import { prisma } from '@/libs/prisma';
import RewardBindingRepository from './rewardBinding.repository';

jest.mock('@/libs/prisma', () => ({
  prisma: {
    randomPoolConfig: { findFirst: jest.fn() },
    reactiveRewardReaction: { findFirst: jest.fn() },
    randomDBDKiller: { findUnique: jest.fn() },
    randomDbdPerkClass: { findUnique: jest.fn() },
    dropImage: { findUnique: jest.fn() },
    spotifySongRequest: { findUnique: jest.fn() },
  },
}));

const tables = prisma as unknown as Record<string, { findFirst?: jest.Mock; findUnique?: jest.Mock }>;

describe('RewardBindingRepository.rewardUsed', () => {
  const repository = new RewardBindingRepository();

  beforeEach(() => {
    jest.clearAllMocks();
    for (const table of Object.values(tables)) {
      table.findFirst?.mockResolvedValue(null);
      table.findUnique?.mockResolvedValue(null);
    }
  });

  it('says a reward nobody uses is free', async () => {
    await expect(repository.rewardUsed('reward-1')).resolves.toBe(false);
  });

  it.each<[string, string, 'findFirst' | 'findUnique']>([
    ['Random Pool', 'randomPoolConfig', 'findFirst'],
    ['Reactive Reward', 'reactiveRewardReaction', 'findFirst'],
    ['Random DBD Killer', 'randomDBDKiller', 'findUnique'],
    ['Random DBD Perk', 'randomDbdPerkClass', 'findUnique'],
    ['Drop Image', 'dropImage', 'findUnique'],
    ['Spotify Song Request', 'spotifySongRequest', 'findUnique'],
  ])('says a reward bound to %s is taken', async (_widget, table, method) => {
    tables[table][method]!.mockResolvedValue({ id: 'bound' });
    await expect(repository.rewardUsed('reward-1')).resolves.toBe(true);
  });

  it('does not count the Random Pool config being saved against itself', async () => {
    await repository.rewardUsed('reward-1', { randomPoolConfigId: 'config-1' });
    expect(tables.randomPoolConfig.findFirst).toHaveBeenCalledWith({
      where: { twitch_reward_id: 'reward-1', id: { not: 'config-1' } },
    });
  });

  it('does not count the reaction being saved against itself', async () => {
    await repository.rewardUsed('reward-1', { reactionId: 'reaction-1' });
    expect(tables.reactiveRewardReaction.findFirst).toHaveBeenCalledWith({
      where: { twitch_reward_id: 'reward-1', id: { not: 'reaction-1' } },
    });
  });

  it('still counts a reaction when only a Random Pool config is excluded, and the other way round', async () => {
    tables.reactiveRewardReaction.findFirst!.mockResolvedValue({ id: 'reaction-9' });
    await expect(repository.rewardUsed('reward-1', { randomPoolConfigId: 'config-1' })).resolves.toBe(true);
    tables.reactiveRewardReaction.findFirst!.mockResolvedValue(null);
    tables.randomPoolConfig.findFirst!.mockResolvedValue({ id: 'config-9' });
    await expect(repository.rewardUsed('reward-1', { reactionId: 'reaction-1' })).resolves.toBe(true);
  });

  it('lets a database failure surface instead of reporting the reward as free', async () => {
    tables.dropImage.findUnique!.mockRejectedValue(new Error('db down'));
    await expect(repository.rewardUsed('reward-1')).rejects.toThrow('db down');
  });
});
