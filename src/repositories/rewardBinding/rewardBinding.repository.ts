import { prisma } from '@/libs/prisma';
import TLogger, { Layer } from '@/logging/logger';

/** The binding being saved, which must not count as "already bound" against itself. */
export interface RewardBindingExclusion {
  randomPoolConfigId?: string;
  reactionId?: string;
}

/**
 * A Twitch reward can drive one widget at a time. The widgets store the reward id in different tables, so the
 * "is it taken?" question lives here, once, and every widget that binds a reward asks it before saving.
 */
export default class RewardBindingRepository {
  private readonly logger = new TLogger(Layer.REPOSITORY);

  async rewardUsed(
    rewardId: string,
    exclude: RewardBindingExclusion = {},
    transactionId?: string
  ): Promise<boolean> {
    const logger = this.logger.setContext('repository.rewardBinding.rewardUsed', transactionId);
    try {
      const [pool, reaction, killer, perk, drop, spotify] = await Promise.all([
        prisma.randomPoolConfig.findFirst({
          where: {
            twitch_reward_id: rewardId,
            ...(exclude.randomPoolConfigId ? { id: { not: exclude.randomPoolConfigId } } : {}),
          },
        }),
        prisma.reactiveRewardReaction.findFirst({
          where: {
            twitch_reward_id: rewardId,
            ...(exclude.reactionId ? { id: { not: exclude.reactionId } } : {}),
          },
        }),
        prisma.randomDBDKiller.findUnique({ where: { twitch_reward_id: rewardId } }),
        prisma.randomDbdPerkClass.findUnique({ where: { twitch_reward_id: rewardId } }),
        prisma.dropImage.findUnique({ where: { twitch_reward_id: rewardId } }),
        prisma.spotifySongRequest.findUnique({ where: { twitch_reward_id: rewardId } }),
      ]);
      return !!(pool || reaction || killer || perk || drop || spotify);
    } catch (error) {
      logger.error({ message: 'Reward binding lookup failed', error: error as Error });
      throw error;
    }
  }
}
