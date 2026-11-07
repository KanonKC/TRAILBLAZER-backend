import { z } from 'zod';
import ReactiveRewardService from './reactiveReward.service';
import ReactiveRewardRepository from '@/repositories/reactiveReward/reactiveReward.repository';
import RewardBindingRepository from '@/repositories/rewardBinding/rewardBinding.repository';
import WidgetService from '@/services/widget/widget.service';
import OverlayQueueService from '@/services/overlayQueue/overlayQueue.service';
import TwitchService from '@/services/twitch/twitch';
import EventSubReconcilerService from '@/services/twitch/eventSubReconciler/eventSubReconciler.service';
import { WidgetTypeSlug } from '@/services/constant';
import { WidgetHandler, OverlayJob } from '@/services/overlayQueue/overlayQueue.types';
import { TwitchChannelRedemptionAddEventRequest } from '@/events/twitch/channelRedemptionAdd/request';
import redis from '@/libs/redis';

jest.mock('@/libs/redis', () => ({ __esModule: true, default: { exists: jest.fn() } }));
jest.mock('@/libs/awsS3', () => ({
  __esModule: true,
  default: { getSignedURL: jest.fn(async (key: string) => `signed:${key}`) },
}));
jest.mock('@/services/twitch/eventSubReconciler/eventSubReconciler.service', () => ({
  __esModule: true,
  default: {
    ensureEventSubs: jest.fn().mockResolvedValue([]),
    getRequiredEventTypes: jest.fn().mockReturnValue(['channel.channel_points_custom_reward_redemption.add']),
  },
}));

const redisMock = redis as unknown as { exists: jest.Mock };
const ownerId = 'owner-1';
const twitchId = 'twitch-owner-1';
const reactionId = '11111111-1111-4111-8111-111111111111';

const file = (key: string, overrides: Record<string, unknown> = {}) => ({
  id: `id-${key}`,
  key,
  owner_id: ownerId,
  type: 'image/png',
  size_kb: 100,
  duration_ms: null,
  name: `${key}.png`,
  ...overrides,
});

function makeReaction(overrides: Record<string, unknown> = {}) {
  return {
    id: reactionId,
    reactive_reward_id: 'rr-1',
    twitch_reward_id: 'reward-1',
    twitch_reward_title: 'Hydrate',
    enabled: true,
    sort_order: 0,
    media_type: 'IMAGE',
    media_key: 'media-key',
    media_file: file('media-key'),
    sound_key: null,
    sound_file: null,
    volume: 80,
    display_duration_ms: 5000,
    position: 'CENTER',
    size_percent: 50,
    reactive_reward: { id: 'rr-1', widget: { id: 'widget-1', owner_id: ownerId, twitch_id: twitchId, enabled: true } },
    ...overrides,
  } as any;
}

const input = {
  twitch_reward_id: 'reward-1',
  enabled: true,
  media_type: 'IMAGE' as const,
  media_key: 'media-key',
  volume: 80,
  display_duration_ms: 5000,
  position: 'CENTER' as const,
  size_percent: 50,
};

const event = (overrides: Partial<TwitchChannelRedemptionAddEventRequest> = {}): TwitchChannelRedemptionAddEventRequest => ({
  id: 'redemption-1',
  broadcaster_user_id: twitchId,
  broadcaster_user_login: 'owner',
  broadcaster_user_name: 'Owner',
  user_id: 'viewer-1',
  user_login: 'viewer',
  user_name: 'Viewer',
  user_input: '',
  status: 'unfulfilled',
  reward: { id: 'reward-1', title: 'Hydrate', cost: 100, prompt: '' },
  redeemed_at: '2026-11-07T00:00:00Z',
  ...overrides,
});

describe('ReactiveRewardService', () => {
  let repository: jest.Mocked<ReactiveRewardRepository>;
  let rewardBindings: jest.Mocked<RewardBindingRepository>;
  let widgets: jest.Mocked<WidgetService>;
  let queue: jest.Mocked<OverlayQueueService>;
  let twitch: jest.Mocked<TwitchService>;
  let service: ReactiveRewardService;
  let registeredHandler: WidgetHandler<any>;
  let registeredSlug: string;
  const record = () => ({ id: 'rr-1', widget_id: 'widget-1', widget: { id: 'widget-1', owner_id: ownerId, enabled: true, overlay_key: 'secret-key' }, reactions: [makeReaction()] }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    redisMock.exists.mockResolvedValue(1);
    repository = {
      getByOwner: jest.fn().mockResolvedValue(record()),
      createForOwner: jest.fn(),
      reaction: jest.fn().mockResolvedValue(makeReaction()),
      reactionByReward: jest.fn().mockResolvedValue(makeReaction()),
      file: jest.fn().mockImplementation(async (key: string) => file(key)),
      saveReaction: jest.fn().mockImplementation(async (_owner, _rr, data) => makeReaction({ ...data })),
      deleteReaction: jest.fn(),
    } as unknown as jest.Mocked<ReactiveRewardRepository>;
    rewardBindings = { rewardUsed: jest.fn().mockResolvedValue(false) } as unknown as jest.Mocked<RewardBindingRepository>;
    widgets = {
      authorizeWidgetType: jest.fn().mockResolvedValue(undefined),
      setInitialEnabled: jest.fn().mockResolvedValue(undefined),
      isEnabledAndAvailable: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(undefined),
      refreshOverlayKey: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WidgetService>;
    queue = {
      register: jest.fn((slug, handler) => {
        registeredSlug = slug;
        registeredHandler = handler;
      }),
      enqueue: jest.fn().mockResolvedValue({ enqueued: true, jobId: 'job-1' }),
    } as unknown as jest.Mocked<OverlayQueueService>;
    twitch = {
      listChannelRewards: jest.fn().mockResolvedValue({ data: [{ id: 'reward-1', title: 'Hydrate' }] }),
    } as unknown as jest.Mocked<TwitchService>;
    service = new ReactiveRewardService(repository, rewardBindings, widgets, queue, twitch);
  });

  it('registers its own queue channel and event', () => {
    expect(registeredSlug).toBe(WidgetTypeSlug.REACTIVE_REWARD);
    expect(registeredHandler.channel).toBe('reactive-reward:play');
    expect(registeredHandler.event).toBe('reaction-play');
  });

  describe('widget lifecycle', () => {
    it('creates the widget the first time and switches it on within the quota', async () => {
      repository.createForOwner.mockResolvedValue({ record: record(), created: true });
      await service.enable(ownerId, twitchId);
      expect(widgets.authorizeWidgetType).toHaveBeenCalledWith(ownerId, WidgetTypeSlug.REACTIVE_REWARD, undefined);
      expect(widgets.setInitialEnabled).toHaveBeenCalledWith('widget-1', ownerId, undefined);
    });

    it('returns the existing widget on a second enable without switching it again', async () => {
      repository.createForOwner.mockResolvedValue({ record: record(), created: false });
      await service.enable(ownerId, twitchId);
      expect(widgets.setInitialEnabled).not.toHaveBeenCalled();
    });

    it('reports a missing widget as not found', async () => {
      repository.getByOwner.mockResolvedValue(null);
      await expect(service.get(ownerId)).rejects.toThrow('not enabled');
    });

    it('adds preview URLs to every reaction', async () => {
      const result = await service.get(ownerId);
      expect(result.reactions[0]).toMatchObject({ media_url: 'signed:media-key', sound_url: null });
    });

    it('deletes through the widget service so ownership is checked there', async () => {
      await service.delete(ownerId);
      expect(widgets.delete).toHaveBeenCalledWith('widget-1', ownerId, undefined);
    });

    it('refreshes the overlay key of the widget', async () => {
      await service.refreshOverlayKey(ownerId);
      expect(widgets.refreshOverlayKey).toHaveBeenCalledWith('widget-1', undefined);
    });
  });

  describe('saveReaction', () => {
    it('saves a new reaction with the reward title read from Twitch', async () => {
      const saved = await service.saveReaction(ownerId, twitchId, input);
      expect(repository.saveReaction).toHaveBeenCalledWith(
        ownerId, 'rr-1', expect.objectContaining({ twitch_reward_id: 'reward-1', twitch_reward_title: 'Hydrate' }), undefined, undefined);
      expect(saved).toMatchObject({ media_url: 'signed:media-key' });
    });

    it('does not repeat the parent widget, and its overlay key, inside the returned reaction', async () => {
      const saved = await service.saveReaction(ownerId, twitchId, input);
      expect(saved).not.toHaveProperty('reactive_reward');
    });

    it('makes sure the redemption EventSub subscription exists for the channel', async () => {
      await service.saveReaction(ownerId, twitchId, input);
      expect(EventSubReconcilerService.ensureEventSubs).toHaveBeenCalledWith(twitchId, expect.any(Array), undefined);
    });

    it('requires the widget to have been enabled first', async () => {
      repository.getByOwner.mockResolvedValue(null);
      await expect(service.saveReaction(ownerId, twitchId, input)).rejects.toThrow('not enabled');
    });

    it('stops when the widget type is unavailable to the streamer', async () => {
      widgets.authorizeWidgetType.mockRejectedValue(new Error('unavailable'));
      await expect(service.saveReaction(ownerId, twitchId, input)).rejects.toThrow('unavailable');
      expect(repository.saveReaction).not.toHaveBeenCalled();
    });

    it("refuses to edit another streamer's reaction", async () => {
      repository.reaction.mockResolvedValue(makeReaction({ reactive_reward: { id: 'rr-9', widget: { id: 'w-9', owner_id: 'someone-else', twitch_id: 'x', enabled: true } } }));
      await expect(service.saveReaction(ownerId, twitchId, input, reactionId)).rejects.toThrow('own');
      expect(repository.saveReaction).not.toHaveBeenCalled();
    });

    it('reports an unknown reaction id as not found', async () => {
      repository.reaction.mockResolvedValue(null);
      await expect(service.saveReaction(ownerId, twitchId, input, reactionId)).rejects.toThrow('not found');
    });

    it('refuses a reward that another widget already uses, excluding the reaction being edited from that check', async () => {
      rewardBindings.rewardUsed.mockResolvedValueOnce(true);
      await expect(service.saveReaction(ownerId, twitchId, input, reactionId)).rejects.toThrow('already bound');
      expect(rewardBindings.rewardUsed).toHaveBeenCalledWith('reward-1', { reactionId }, undefined);
      expect(repository.saveReaction).not.toHaveBeenCalled();
    });

    it('refuses a reward that is not on the streamer channel', async () => {
      twitch.listChannelRewards.mockResolvedValue({ data: [{ id: 'other-reward', title: 'Other' }] } as any);
      await expect(service.saveReaction(ownerId, twitchId, input)).rejects.toThrow('channel');
    });

    it("refuses media that is not the streamer's own upload", async () => {
      repository.file.mockResolvedValue(file('media-key', { owner_id: 'someone-else' }) as any);
      await expect(service.saveReaction(ownerId, twitchId, input)).rejects.toThrow('Select an uploaded file you own');
      repository.file.mockResolvedValue(null);
      await expect(service.saveReaction(ownerId, twitchId, input)).rejects.toThrow('Select an uploaded file you own');
    });

    it('refuses media that does not fit the chosen type', async () => {
      repository.file.mockResolvedValue(file('media-key', { type: 'audio/mpeg' }) as any);
      await expect(service.saveReaction(ownerId, twitchId, input)).rejects.toThrow('png, jpeg, gif, webp or avif');
    });

    it('accepts a video that has a recorded duration', async () => {
      repository.file.mockResolvedValue(file('media-key', { type: 'video/mp4', size_kb: 5000, duration_ms: 8000 }) as any);
      await expect(service.saveReaction(ownerId, twitchId, { ...input, media_type: 'VIDEO' })).resolves.toBeDefined();
    });

    it('refuses a video without a recorded duration or over 30 seconds', async () => {
      repository.file.mockResolvedValue(file('media-key', { type: 'video/mp4', duration_ms: null }) as any);
      await expect(service.saveReaction(ownerId, twitchId, { ...input, media_type: 'VIDEO' })).rejects.toThrow('duration could not be read');
      repository.file.mockResolvedValue(file('media-key', { type: 'video/mp4', duration_ms: 31_000 }) as any);
      await expect(service.saveReaction(ownerId, twitchId, { ...input, media_type: 'VIDEO' })).rejects.toThrow('at most 30 seconds');
    });

    it('validates the sound that goes with an image as audio', async () => {
      repository.file.mockImplementation(async (key: string) => (key === 'sound-key' ? file('sound-key', { type: 'audio/mpeg', duration_ms: 2000 }) : file(key)) as any);
      await expect(service.saveReaction(ownerId, twitchId, { ...input, sound_key: 'sound-key' })).resolves.toBeDefined();
      repository.file.mockImplementation(async (key: string) => (key === 'sound-key' ? file('sound-key', { type: 'image/png' }) : file(key)) as any);
      await expect(service.saveReaction(ownerId, twitchId, { ...input, sound_key: 'sound-key' })).rejects.toThrow('Sound must be mp3, wav or ogg');
    });

    it('refuses a separate sound on audio and video', async () => {
      await expect(service.saveReaction(ownerId, twitchId, { ...input, media_type: 'AUDIO', sound_key: 'sound-key' })).rejects.toBeInstanceOf(z.ZodError);
      await expect(service.saveReaction(ownerId, twitchId, { ...input, media_type: 'VIDEO', sound_key: 'sound-key' })).rejects.toBeInstanceOf(z.ZodError);
    });
  });

  describe('deleteReaction', () => {
    it('deletes an owned reaction', async () => {
      await service.deleteReaction(ownerId, reactionId);
      expect(repository.deleteReaction).toHaveBeenCalledWith(reactionId, undefined);
    });

    it("refuses another streamer's reaction", async () => {
      repository.reaction.mockResolvedValue(makeReaction({ reactive_reward: { id: 'rr-9', widget: { id: 'w-9', owner_id: 'someone-else', twitch_id: 'x', enabled: true } } }));
      await expect(service.deleteReaction(ownerId, reactionId)).rejects.toThrow('own');
      expect(repository.deleteReaction).not.toHaveBeenCalled();
    });
  });

  describe('redeem', () => {
    const lastEnqueue = () => queue.enqueue.mock.calls[0][0];

    it('queues the reaction under the owner id, awaiting the overlay ack, deduped on the redemption id', async () => {
      await service.redeem(event(), 'tx');
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
      expect(lastEnqueue()).toMatchObject({
        userId: ownerId,
        widgetSlug: WidgetTypeSlug.REACTIVE_REWARD,
        widgetId: 'widget-1',
        awaitsAck: true,
        dedupeKey: 'redemption-1',
        dedupeTtlMs: 86_400_000,
        payload: { reaction_id: reactionId, redemption_id: 'redemption-1', redeemed_by: 'viewer-1', is_test: false },
      });
      expect(lastEnqueue().priority).toBeUndefined();
    });

    it.each([
      ['an image', {}, 10_000],
      ['an image with a longer sound', { sound_key: 'sound-key', sound_file: file('sound-key', { type: 'audio/mpeg', duration_ms: 8000 }) }, 13_000],
      ['an image with a sound of unknown length', { sound_key: 'sound-key', sound_file: file('sound-key', { type: 'audio/mpeg' }) }, 35_000],
      ['audio', { media_type: 'AUDIO', media_file: file('media-key', { type: 'audio/mpeg', duration_ms: 3000 }) }, 8000],
      ['a video', { media_type: 'VIDEO', media_file: file('media-key', { type: 'video/mp4', duration_ms: 12_000 }) }, 17_000],
      ['a video of unknown length', { media_type: 'VIDEO', media_file: file('media-key', { type: 'video/mp4' }) }, 35_000],
    ])('holds the queue for %s no longer than its length plus 5 s', async (_name, overrides, expectedCeilingMs) => {
      repository.reactionByReward.mockResolvedValue(makeReaction(overrides));
      await service.redeem(event());
      expect(lastEnqueue().durationMs).toBe(expectedCeilingMs);
    });

    it('ignores a reward that no reaction is bound to', async () => {
      repository.reactionByReward.mockResolvedValue(null);
      await service.redeem(event());
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it.each([
      ['a redemption from another channel', () => event({ broadcaster_user_id: 'another-channel' }), {}],
      ['a disabled reaction', () => event(), { enabled: false }],
      ['a disabled widget', () => event(), { reactive_reward: { id: 'rr-1', widget: { id: 'widget-1', owner_id: ownerId, twitch_id: twitchId, enabled: false } } }],
      ['a reaction whose media file was deleted', () => event(), { media_key: null, media_file: null }],
    ])('ignores %s', async (_name, makeEvent, reactionOverrides) => {
      repository.reactionByReward.mockResolvedValue(makeReaction(reactionOverrides));
      await service.redeem(makeEvent());
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('ignores a redemption when the widget type is no longer available to the streamer', async () => {
      widgets.isEnabledAndAvailable.mockResolvedValue(false);
      await service.redeem(event());
      expect(queue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('testReaction', () => {
    it('plays the reaction ahead of the queue, without a dedupe key', async () => {
      await service.testReaction(ownerId, reactionId, 'tx');
      const request = queue.enqueue.mock.calls[0][0];
      expect(request).toMatchObject({
        userId: ownerId,
        widgetSlug: WidgetTypeSlug.REACTIVE_REWARD,
        awaitsAck: true,
        priority: 'front',
        durationMs: 10_000,
        payload: { reaction_id: reactionId, is_test: true },
      });
      expect(request.dedupeKey).toBeUndefined();
      expect(redisMock.exists).toHaveBeenCalledWith(`reactive-reward:presence:${ownerId}`);
    });

    it('answers with an error when no overlay is connected', async () => {
      redisMock.exists.mockResolvedValue(0);
      await expect(service.testReaction(ownerId, reactionId)).rejects.toThrow('No overlay is connected');
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('asks for the widget to be switched on first', async () => {
      repository.reaction.mockResolvedValue(makeReaction({ reactive_reward: { id: 'rr-1', widget: { id: 'widget-1', owner_id: ownerId, twitch_id: twitchId, enabled: false } } }));
      await expect(service.testReaction(ownerId, reactionId)).rejects.toThrow('Enable this widget');
    });

    it('refuses a reaction without media', async () => {
      repository.reaction.mockResolvedValue(makeReaction({ media_key: null, media_file: null }));
      await expect(service.testReaction(ownerId, reactionId)).rejects.toThrow('no media');
    });

    it("refuses another streamer's reaction", async () => {
      repository.reaction.mockResolvedValue(makeReaction({ reactive_reward: { id: 'rr-9', widget: { id: 'w-9', owner_id: 'someone-else', twitch_id: 'x', enabled: true } } }));
      await expect(service.testReaction(ownerId, reactionId)).rejects.toThrow('own');
      expect(queue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('resolving a queued job at dispatch', () => {
    const job = (overrides: Partial<OverlayJob<any>> = {}): OverlayJob<any> => ({
      id: 'job-1',
      userId: ownerId,
      widgetSlug: WidgetTypeSlug.REACTIVE_REWARD,
      enqueuedAt: 0,
      expiresAt: 1,
      effects: [],
      payload: { reaction_id: reactionId, redemption_id: 'redemption-1', redeemed_by: 'viewer-1', is_test: false },
      ...overrides,
    });

    it('builds the overlay payload with freshly signed URLs and a display time apart from the queue ceiling', async () => {
      const payload = await registeredHandler.resolve(job());
      expect(payload).toEqual({
        reaction_id: reactionId,
        redemption_id: 'redemption-1',
        is_test: false,
        media_type: 'IMAGE',
        media_url: 'signed:media-key',
        sound_url: null,
        volume: 80,
        display_ms: 5000,
        position: 'CENTER',
        size_percent: 50,
      });
      expect(payload).not.toHaveProperty('duration_ms');
    });

    it('includes the sound of an image and lasts as long as the longer of the two', async () => {
      repository.reaction.mockResolvedValue(makeReaction({ sound_key: 'sound-key', sound_file: file('sound-key', { type: 'audio/mpeg', duration_ms: 9000 }) }));
      const payload = await registeredHandler.resolve(job());
      expect(payload).toMatchObject({ sound_url: 'signed:sound-key', display_ms: 9000 });
    });

    it('uses the settings as they are now, not as they were when the job was queued', async () => {
      repository.reaction.mockResolvedValue(makeReaction({ volume: 20, position: 'TOP_LEFT', size_percent: 80 }));
      await expect(registeredHandler.resolve(job())).resolves.toMatchObject({ volume: 20, position: 'TOP_LEFT', size_percent: 80 });
    });

    it('looks for the presence of the owner who queued it', async () => {
      await registeredHandler.resolve(job());
      expect(redisMock.exists).toHaveBeenCalledWith(`reactive-reward:presence:${ownerId}`);
    });

    it.each([
      ['the reaction was deleted', () => repository.reaction.mockResolvedValue(null)],
      ['the reaction was disabled', () => repository.reaction.mockResolvedValue(makeReaction({ enabled: false }))],
      ['the widget was disabled', () => repository.reaction.mockResolvedValue(makeReaction({ reactive_reward: { id: 'rr-1', widget: { id: 'widget-1', owner_id: ownerId, twitch_id: twitchId, enabled: false } } }))],
      ['the media file was deleted while it waited', () => repository.reaction.mockResolvedValue(makeReaction({ media_key: null, media_file: null }))],
      ['no overlay is connected', () => redisMock.exists.mockResolvedValue(0)],
    ])('drops the job when %s, so the queue moves on', async (_name, arrange) => {
      arrange();
      await expect(registeredHandler.resolve(job())).resolves.toBeNull();
    });

    it('plays an image whose separate sound file was deleted, without the sound', async () => {
      // Deleting the file clears sound_key through the foreign key
      repository.reaction.mockResolvedValue(makeReaction({ sound_key: null, sound_file: null }));
      await expect(registeredHandler.resolve(job())).resolves.toMatchObject({ sound_url: null, display_ms: 5000 });
    });
  });
});
