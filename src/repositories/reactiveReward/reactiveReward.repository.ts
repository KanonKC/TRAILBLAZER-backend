import { randomUUID } from 'crypto';
import { prisma } from '@/libs/prisma';
import { Prisma } from '../../../generated/prisma/client';
import TLogger, { Layer } from '@/logging/logger';
import { BadRequestError, NotFoundError } from '@/errors';
import { ReactionInput } from '@/services/reactiveReward/request';
import { MAX_REACTIONS_PER_WIDGET } from '@/services/reactiveReward/reactiveReward.logic';

const WIDGET_TYPE_SLUG = 'reactive-reward';

const reactionInclude = { media_file: true, sound_file: true };
export const reactiveRewardInclude = {
  // The widget type carries the point cost the dashboard shows next to the status switch
  widget: { include: { widget_type: true } },
  reactions: { orderBy: { sort_order: 'asc' as const }, include: reactionInclude },
};
const reactionWithOwnerInclude = {
  ...reactionInclude,
  reactive_reward: { include: { widget: true } },
};

export type ReactiveRewardRecord = Prisma.ReactiveRewardGetPayload<{ include: typeof reactiveRewardInclude }>;
export type ReactionRecord = Prisma.ReactiveRewardReactionGetPayload<{ include: typeof reactionWithOwnerInclude }>;

export default class ReactiveRewardRepository {
  private readonly logger = new TLogger(Layer.REPOSITORY);

  private async run<Result>(
    operation: string,
    transactionId: string | undefined,
    action: () => Promise<Result>
  ): Promise<Result> {
    const logger = this.logger.setContext(`repository.reactiveReward.${operation}`, transactionId);
    try {
      return await action();
    } catch (error) {
      logger.error({ message: 'Reactive reward database operation failed', error: error as Error });
      throw error;
    }
  }

  getByOwner(ownerId: string, transactionId?: string) {
    return this.run('getByOwner', transactionId, () =>
      prisma.reactiveReward.findFirst({
        where: { widget: { owner_id: ownerId } },
        include: reactiveRewardInclude,
      })
    );
  }

  /** The streamer's one Reactive Reward widget: returns the existing one, or creates it (disabled) the first time. */
  createForOwner(ownerId: string, twitchId: string, transactionId?: string) {
    return this.run('createForOwner', transactionId, () =>
      prisma.$transaction(async (transaction) => {
        // Serializes concurrent first-time enables of the same owner
        await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${ownerId} FOR UPDATE`;
        const existing = await transaction.reactiveReward.findFirst({
          where: { widget: { owner_id: ownerId } },
          include: reactiveRewardInclude,
        });
        if (existing) return { record: existing, created: false };
        const record = await transaction.reactiveReward.create({
          data: {
            widget: {
              create: {
                owner_id: ownerId,
                twitch_id: twitchId,
                widget_type_slug: WIDGET_TYPE_SLUG,
                instance_key: '',
                overlay_key: randomUUID(),
                enabled: false,
              },
            },
          },
          include: reactiveRewardInclude,
        });
        return { record, created: true };
      })
    );
  }

  reaction(id: string, transactionId?: string) {
    return this.run('reaction', transactionId, () =>
      prisma.reactiveRewardReaction.findUnique({ where: { id }, include: reactionWithOwnerInclude })
    );
  }

  reactionByReward(twitchRewardId: string, transactionId?: string) {
    return this.run('reactionByReward', transactionId, () =>
      prisma.reactiveRewardReaction.findUnique({
        where: { twitch_reward_id: twitchRewardId },
        include: reactionWithOwnerInclude,
      })
    );
  }

  file(key: string, transactionId?: string) {
    return this.run('file', transactionId, () => prisma.uploadedFile.findUnique({ where: { key } }));
  }

  saveReaction(
    ownerId: string,
    reactiveRewardId: string,
    data: ReactionInput & { twitch_reward_title: string },
    reactionId?: string,
    transactionId?: string
  ) {
    return this.run('saveReaction', transactionId, () =>
      prisma.$transaction(async (transaction) => {
        // Serializes the per-widget limit and the writes of one owner across processes
        await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${ownerId} FOR UPDATE`;
        const fields = { ...data, sound_key: data.sound_key || null };
        if (reactionId) {
          const existing = await transaction.reactiveRewardReaction.findFirst({
            where: { id: reactionId, reactive_reward_id: reactiveRewardId },
          });
          if (!existing) throw new NotFoundError('Reaction not found');
          return transaction.reactiveRewardReaction.update({
            where: { id: reactionId },
            data: fields,
            include: reactionWithOwnerInclude,
          });
        }
        const [count, last] = await Promise.all([
          transaction.reactiveRewardReaction.count({ where: { reactive_reward_id: reactiveRewardId } }),
          transaction.reactiveRewardReaction.findFirst({
            where: { reactive_reward_id: reactiveRewardId },
            orderBy: { sort_order: 'desc' },
            select: { sort_order: true },
          }),
        ]);
        if (count >= MAX_REACTIONS_PER_WIDGET)
          throw new BadRequestError(`Reaction limit reached (${MAX_REACTIONS_PER_WIDGET})`);
        return transaction.reactiveRewardReaction.create({
          data: { ...fields, reactive_reward_id: reactiveRewardId, sort_order: (last?.sort_order ?? -1) + 1 },
          include: reactionWithOwnerInclude,
        });
      })
    );
  }

  deleteReaction(id: string, transactionId?: string) {
    return this.run('deleteReaction', transactionId, () =>
      prisma.reactiveRewardReaction.delete({ where: { id } })
    );
  }
}
