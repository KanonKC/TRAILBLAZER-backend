import { BadRequestError, ForbiddenError, NotFoundError } from '@/errors';
import ReactiveRewardRepository, {
  ReactionRecord,
  ReactiveRewardRecord,
} from '@/repositories/reactiveReward/reactiveReward.repository';
import RewardBindingRepository from '@/repositories/rewardBinding/rewardBinding.repository';
import WidgetService from '@/services/widget/widget.service';
import OverlayQueueService from '@/services/overlayQueue/overlayQueue.service';
import TwitchService from '@/services/twitch/twitch';
import EventSubReconcilerService from '@/services/twitch/eventSubReconciler/eventSubReconciler.service';
import { WidgetTypeSlug } from '@/services/constant';
import { TwitchChannelRedemptionAddEventRequest } from '@/events/twitch/channelRedemptionAdd/request';
import redis from '@/libs/redis';
import s3 from '@/libs/awsS3';
import TLogger, { Layer } from '@/logging/logger';
import { ReactionInput, reactionSchema } from './request';
import {
  PlaybackFacts,
  ReactionMediaType,
  UNKNOWN_MEDIA_LENGTH_MS,
  mediaFileProblem,
  playbackLengthMs,
  presenceKey,
  queueCeilingMs,
} from './reactiveReward.logic';

const SIGNED_URL_SECONDS = 3600;
const REDEMPTION_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

/** Only stable references: anything that can change or expire is read again when the job is dispatched. */
interface ReactionPlayPayload {
  reaction_id: string;
  redemption_id: string;
  redeemed_by: string;
  is_test: boolean;
}

type PlayableReaction = Pick<
  ReactionRecord,
  'media_type' | 'display_duration_ms' | 'sound_key' | 'media_file' | 'sound_file'
>;

function playbackFactsOf(reaction: PlayableReaction): PlaybackFacts {
  return {
    mediaType: reaction.media_type as ReactionMediaType,
    displayDurationMs: reaction.display_duration_ms,
    mediaDurationMs: reaction.media_file?.duration_ms ?? null,
    hasSound: !!reaction.sound_key,
    soundDurationMs: reaction.sound_file?.duration_ms ?? null,
  };
}

export default class ReactiveRewardService {
  private readonly logger = new TLogger(Layer.SERVICE);

  constructor(
    private readonly repository: ReactiveRewardRepository,
    private readonly rewardBindings: RewardBindingRepository,
    private readonly widgets: WidgetService,
    private readonly queue: OverlayQueueService,
    private readonly twitch: TwitchService
  ) {
    queue.register<ReactionPlayPayload>(WidgetTypeSlug.REACTIVE_REWARD, {
      channel: 'reactive-reward:play',
      event: 'reaction-play',
      estimateDurationMs: () => UNKNOWN_MEDIA_LENGTH_MS + 5_000,
      resolve: (job) => this.resolveJob(job.payload, job.userId, job.transactionId),
    });
  }

  /** Builds the SSE payload at dispatch time, or null to drop the job without holding the queue. */
  private async resolveJob(payload: ReactionPlayPayload, ownerId: string, transactionId?: string) {
    const logger = this.logger.setContext('service.reactiveReward.resolveJob', transactionId);
    const reaction = await this.repository.reaction(payload.reaction_id, transactionId);
    if (!reaction || !reaction.enabled || !reaction.reactive_reward.widget.enabled) {
      logger.info({ message: 'Dropping job, reaction is gone or disabled', data: { reactionId: payload.reaction_id } });
      return null;
    }
    if (!reaction.media_file) {
      logger.warn({ message: 'Dropping job, reaction media file was deleted', data: { reactionId: payload.reaction_id } });
      return null;
    }
    if (!(await redis.exists(presenceKey(ownerId)))) {
      // The viewers' points are not refunded; the redemption is simply lost
      logger.warn({ message: 'Dropping job, no overlay is connected', data: { reactionId: payload.reaction_id, redemptionId: payload.redemption_id } });
      return null;
    }
    const facts = playbackFactsOf(reaction);
    const [mediaUrl, soundUrl] = await Promise.all([
      s3.getSignedURL(reaction.media_file.key, { expiresIn: SIGNED_URL_SECONDS }),
      reaction.sound_file ? s3.getSignedURL(reaction.sound_file.key, { expiresIn: SIGNED_URL_SECONDS }) : null,
    ]);
    return {
      reaction_id: reaction.id,
      redemption_id: payload.redemption_id,
      is_test: payload.is_test,
      media_type: reaction.media_type,
      media_url: mediaUrl,
      sound_url: soundUrl,
      volume: reaction.volume,
      // How long the overlay keeps the item. duration_ms (added by the queue) is the longer ceiling for a missing ack.
      display_ms: playbackLengthMs(facts),
      position: reaction.position,
      size_percent: reaction.size_percent,
    };
  }

  /** Adds short-lived preview URLs so the dashboard can show and play what a reaction is bound to. */
  private async extendReaction<Reaction extends { media_file: { key: string } | null; sound_file: { key: string } | null }>(
    reaction: Reaction
  ) {
    const [mediaUrl, soundUrl] = await Promise.all([
      reaction.media_file ? s3.getSignedURL(reaction.media_file.key, { expiresIn: SIGNED_URL_SECONDS }) : null,
      reaction.sound_file ? s3.getSignedURL(reaction.sound_file.key, { expiresIn: SIGNED_URL_SECONDS }) : null,
    ]);
    return { ...reaction, media_url: mediaUrl, sound_url: soundUrl };
  }

  private async extend(record: ReactiveRewardRecord) {
    return { ...record, reactions: await Promise.all(record.reactions.map((reaction) => this.extendReaction(reaction))) };
  }

  private async ownedReaction(ownerId: string, id: string, transactionId?: string) {
    const reaction = await this.repository.reaction(id, transactionId);
    if (!reaction) throw new NotFoundError('Reaction not found');
    if (reaction.reactive_reward.widget.owner_id !== ownerId)
      throw new ForbiddenError('You do not own this reaction');
    return reaction;
  }

  private async ownedFile(
    ownerId: string,
    key: string,
    mediaType: ReactionMediaType,
    role: 'media' | 'sound',
    transactionId?: string
  ) {
    const file = await this.repository.file(key, transactionId);
    if (!file || file.owner_id !== ownerId) throw new BadRequestError('Select an uploaded file you own');
    const problem = mediaFileProblem(file, mediaType, role);
    if (problem) throw new BadRequestError(problem);
    return file;
  }

  /** The streamer's widget: created (disabled) the first time, otherwise returned as it is. */
  async enable(ownerId: string, twitchId: string, transactionId?: string) {
    const logger = this.logger.setContext('service.reactiveReward.enable', transactionId);
    await this.widgets.authorizeWidgetType(ownerId, WidgetTypeSlug.REACTIVE_REWARD, transactionId);
    const { record, created } = await this.repository.createForOwner(ownerId, twitchId, transactionId);
    if (created) await this.widgets.setInitialEnabled(record.widget_id, ownerId, transactionId);
    logger.info({ message: 'Enabled reactive reward', data: { created } });
    return this.get(ownerId, transactionId);
  }

  async get(ownerId: string, transactionId?: string) {
    const record = await this.repository.getByOwner(ownerId, transactionId);
    if (!record) throw new NotFoundError('Reactive reward not enabled');
    return this.extend(record);
  }

  async delete(ownerId: string, transactionId?: string) {
    const logger = this.logger.setContext('service.reactiveReward.delete', transactionId);
    const record = await this.repository.getByOwner(ownerId, transactionId);
    if (!record) throw new NotFoundError('Reactive reward not enabled');
    await this.widgets.delete(record.widget_id, ownerId, transactionId);
    logger.info({ message: 'Deleted reactive reward' });
  }

  async refreshOverlayKey(ownerId: string, transactionId?: string) {
    const record = await this.repository.getByOwner(ownerId, transactionId);
    if (!record) throw new NotFoundError('Reactive reward not enabled');
    await this.widgets.refreshOverlayKey(record.widget_id, transactionId);
    return this.get(ownerId, transactionId);
  }

  async saveReaction(
    ownerId: string,
    twitchId: string,
    input: ReactionInput,
    reactionId?: string,
    transactionId?: string
  ) {
    const logger = this.logger.setContext('service.reactiveReward.saveReaction', transactionId);
    await this.widgets.authorizeWidgetType(ownerId, WidgetTypeSlug.REACTIVE_REWARD, transactionId);
    const data = reactionSchema.parse(input);
    const record = await this.repository.getByOwner(ownerId, transactionId);
    if (!record) throw new NotFoundError('Reactive reward not enabled');
    if (reactionId) await this.ownedReaction(ownerId, reactionId, transactionId);

    if (await this.rewardBindings.rewardUsed(data.twitch_reward_id, { reactionId }, transactionId))
      throw new BadRequestError('Reward is already bound to a widget');

    logger.info({ message: 'Checking channel rewards' });
    const rewards = await this.twitch.listChannelRewards(twitchId, undefined, transactionId);
    logger.info({ message: 'Channel rewards loaded' });
    const reward = rewards.data.find((candidate) => candidate.id === data.twitch_reward_id);
    if (!reward) throw new BadRequestError('Reward does not belong to your channel');

    await Promise.all([
      this.ownedFile(ownerId, data.media_key, data.media_type, 'media', transactionId),
      data.sound_key ? this.ownedFile(ownerId, data.sound_key, 'AUDIO', 'sound', transactionId) : undefined,
    ]);

    logger.info({ message: 'Ensuring redemption EventSub subscriptions' });
    await EventSubReconcilerService.ensureEventSubs(
      twitchId,
      EventSubReconcilerService.getRequiredEventTypes([WidgetTypeSlug.REACTIVE_REWARD]),
      transactionId
    );

    const saved = await this.repository.saveReaction(
      ownerId,
      record.id,
      { ...data, twitch_reward_title: reward.title },
      reactionId,
      transactionId
    );
    logger.info({ message: 'Saved reaction', data: { reactionId: saved.id } });
    // The parent widget is already known to the caller and carries the overlay key, so it is not repeated here
    const { reactive_reward: _parent, ...reaction } = saved;
    return this.extendReaction(reaction);
  }

  async deleteReaction(ownerId: string, reactionId: string, transactionId?: string) {
    const logger = this.logger.setContext('service.reactiveReward.deleteReaction', transactionId);
    await this.ownedReaction(ownerId, reactionId, transactionId);
    await this.repository.deleteReaction(reactionId, transactionId);
    logger.info({ message: 'Deleted reaction', data: { reactionId } });
  }

  /** Plays the reaction on the real overlay right now, ahead of any queued redemptions. */
  async testReaction(ownerId: string, reactionId: string, transactionId?: string) {
    const logger = this.logger.setContext('service.reactiveReward.testReaction', transactionId);
    const reaction = await this.ownedReaction(ownerId, reactionId, transactionId);
    const widget = reaction.reactive_reward.widget;
    if (!widget.enabled) throw new BadRequestError('Enable this widget before testing');
    if (!reaction.media_file) throw new BadRequestError('This reaction has no media');
    if (!(await redis.exists(presenceKey(ownerId))))
      throw new BadRequestError('No overlay is connected. Open your OBS browser source first');
    const result = await this.queue.enqueue<ReactionPlayPayload>({
      userId: ownerId,
      widgetSlug: WidgetTypeSlug.REACTIVE_REWARD,
      widgetId: widget.id,
      awaitsAck: true,
      durationMs: queueCeilingMs(playbackFactsOf(reaction)),
      priority: 'front',
      transactionId,
      payload: { reaction_id: reaction.id, redemption_id: `test-${Date.now()}`, redeemed_by: ownerId, is_test: true },
    });
    logger.info({ message: 'Reaction test queued', data: result });
    return result;
  }

  async redeem(event: TwitchChannelRedemptionAddEventRequest, transactionId?: string) {
    const logger = this.logger.setContext('service.reactiveReward.redeem', transactionId);
    const reaction = await this.repository.reactionByReward(event.reward.id, transactionId);
    if (!reaction) return;
    const widget = reaction.reactive_reward.widget;
    // Unlike "no reaction is bound", each of these is something a streamer may need to ask support about
    const skipReason =
      widget.twitch_id !== event.broadcaster_user_id
        ? 'redemption is from another channel'
        : !reaction.enabled
          ? 'reaction is disabled'
          : !widget.enabled
            ? 'widget is disabled'
            : !(await this.widgets.isEnabledAndAvailable(widget.id, transactionId))
              ? 'widget is unavailable for this streamer'
              : null;
    if (skipReason) {
      logger.info({ message: 'Ignoring redemption', data: { reactionId: reaction.id, redemptionId: event.id, reason: skipReason } });
      return;
    }
    if (!reaction.media_file) {
      logger.warn({ message: 'Ignoring redemption, reaction media file was deleted', data: { reactionId: reaction.id } });
      return;
    }
    const result = await this.queue.enqueue<ReactionPlayPayload>({
      // The owner, not a config id: the SSE stream and overlay access checks are keyed by the owner
      userId: widget.owner_id,
      widgetSlug: WidgetTypeSlug.REACTIVE_REWARD,
      widgetId: widget.id,
      awaitsAck: true,
      durationMs: queueCeilingMs(playbackFactsOf(reaction)),
      dedupeKey: event.id,
      dedupeTtlMs: REDEMPTION_DEDUPE_TTL_MS,
      transactionId,
      payload: {
        reaction_id: reaction.id,
        redemption_id: event.id,
        redeemed_by: event.user_id || event.user_name,
        is_test: false,
      },
    });
    logger.info({ message: 'Reaction redemption queued', data: result });
  }
}
