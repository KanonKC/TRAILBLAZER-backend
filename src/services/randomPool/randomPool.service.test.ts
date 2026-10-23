import RandomPoolService from './randomPool.service';
import RandomPoolRepository, {
  ConfigRecord,
  PoolRecord,
} from '@/repositories/randomPool/randomPool.repository';
import OverlayQueueService from '@/services/overlayQueue/overlayQueue.service';
import WidgetService from '@/services/widget/widget.service';
import TwitchService from '@/services/twitch/twitch';
import { TwitchChannelRedemptionAddEventRequest } from '@/events/twitch/channelRedemptionAdd/request';
import { WidgetHandler, OverlayJob } from '@/services/overlayQueue/overlayQueue.types';
import { ConfigInput } from './request';
import { twitchAppAPI } from '@/libs/twurple';
jest.mock('@/libs/redis', () => ({ publisher: { publish: jest.fn().mockResolvedValue(1) } }));
jest.mock('@/libs/awsS3', () => ({
  __esModule: true,
  default: { getSignedURL: jest.fn(async (key) => `signed:${key}`) },
}));
jest.mock('@/libs/twurple', () => ({
  twitchAppAPI: { chat: { sendChatMessageAsApp: jest.fn().mockResolvedValue(undefined) } },
}));
jest.mock('@/services/twitch/eventSubReconciler/eventSubReconciler.service', () => ({
  __esModule: true,
  default: {
    ensureEventSubs: jest.fn().mockResolvedValue(undefined),
    getRequiredEventTypes: jest.fn().mockReturnValue([]),
  },
}));
const poolId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
describe('RandomPoolService authorization and lifecycle', () => {
  let repository: jest.Mocked<RandomPoolRepository>;
  let queue: jest.Mocked<OverlayQueueService>;
  let widgets: jest.Mocked<WidgetService>;
  let twitch: jest.Mocked<TwitchService>;
  let service: RandomPoolService;
  let config: ConfigRecord;
  let handler: WidgetHandler<unknown>;
  const input: ConfigInput = {
    name: 'Config',
    pool_id: poolId,
    twitch_reward_id: 'reward',
    mode: 'UNIFORM',
    visualization: 'SHUFFLE',
    items: [],
  };
  beforeEach(() => {
    jest.clearAllMocks();
    config = {
      id: 'config',
      widget_id: 'widget',
      pool_id: poolId,
      twitch_reward_id: 'reward',
      mode: 'UNIFORM',
      visualization: 'SHUFFLE',
      default_chat_message: '{user}: {item}',
      spin_sound_key: null,
      default_result_sound_key: null,
      items: [],
      widget: { owner_id: 'owner', twitch_id: 'channel', enabled: true, overlay_key: 'secret' },
      pool: {
        id: poolId,
        owner_id: 'owner',
        name: 'Pool',
        deleted_at: null,
        moderation_status: 'VISIBLE',
        cover_key: null,
        items: [{ id: itemId, name: 'Prize', image_key: null }],
        _count: { configs: 1 },
      },
    } as unknown as ConfigRecord;
    repository = {
      pool: jest.fn().mockResolvedValue(config.pool),
      config: jest.fn().mockResolvedValue(config),
      byReward: jest.fn().mockResolvedValue(config),
      rewardUsed: jest.fn().mockResolvedValue(false),
      file: jest.fn(),
      user: jest.fn().mockResolvedValue({ tier: 0 }),
      listPools: jest.fn().mockResolvedValue([config.pool]),
      listConfigs: jest.fn().mockResolvedValue([config]),
      savePool: jest.fn().mockResolvedValue(config.pool),
      saveConfig: jest.fn().mockResolvedValue(config),
      deletePool: jest.fn(),
      log: jest.fn(),
    } as unknown as jest.Mocked<RandomPoolRepository>;
    widgets = { updateEnable: jest.fn() } as unknown as jest.Mocked<WidgetService>;
    queue = {
      register: jest.fn((slug, registered) => {
        handler = registered;
      }),
      enqueue: jest.fn().mockResolvedValue({ enqueued: true, jobId: 'job' }),
      ack: jest.fn(),
    } as unknown as jest.Mocked<OverlayQueueService>;
    twitch = {
      listChannelRewards: jest.fn().mockResolvedValue({ data: [{ id: 'reward' }] }),
    } as unknown as jest.Mocked<TwitchService>;
    service = new RandomPoolService(repository, widgets, queue, twitch);
  });
  it('protects configs and pools against other owners', async () => {
    await expect(service.getConfig('other', 'config')).rejects.toThrow('own');
    await expect(service.deletePool('other', poolId)).rejects.toThrow('own');
    expect(repository.deletePool).not.toHaveBeenCalled();
  });
  it.each([
    [0, null, 3],
    [1, null, 10],
    [1, new Date(0), 3],
  ])('enforces plan-aware pool limits', async (tier, tier_expire_at, limit) => {
    repository.user.mockResolvedValue({ tier, tier_expire_at } as Awaited<
      ReturnType<RandomPoolRepository['user']>
    >);
    await service.savePool('owner', { name: 'Pool', visibility: 'PRIVATE', items: [] });
    expect(repository.savePool).toHaveBeenCalledWith(
      'owner',
      expect.anything(),
      limit,
      undefined,
      undefined
    );
  });
  it('rejects foreign, oversized and invalid files', async () => {
    for (const file of [
      { owner_id: 'other', size_kb: 1, type: 'image/png' },
      { owner_id: 'owner', size_kb: 2049, type: 'image/png' },
      { owner_id: 'owner', size_kb: 1, type: 'image/svg+xml' },
    ]) {
      repository.file.mockResolvedValue(file as Awaited<ReturnType<RandomPoolRepository['file']>>);
      await expect(
        service.savePool('owner', {
          name: 'Pool',
          visibility: 'PRIVATE',
          cover_key: 'key',
          items: [],
        })
      ).rejects.toThrow();
    }
    expect(repository.savePool).not.toHaveBeenCalled();
  });
  it('rejects long/unknown audio and accepts 15-second audio', async () => {
    for (const duration_ms of [null, 15001]) {
      repository.file.mockResolvedValue({
        owner_id: 'owner',
        size_kb: 100,
        type: 'audio/mpeg',
        duration_ms,
      } as Awaited<ReturnType<RandomPoolRepository['file']>>);
      await expect(
        service.saveConfig('owner', 'channel', { ...input, spin_sound_key: 'audio' })
      ).rejects.toThrow('Audio');
    }
    repository.file.mockResolvedValue({
      owner_id: 'owner',
      size_kb: 2048,
      type: 'audio/mpeg',
      duration_ms: 15000,
    } as Awaited<ReturnType<RandomPoolRepository['file']>>);
    await service.saveConfig('owner', 'channel', { ...input, spin_sound_key: 'audio' });
    expect(repository.saveConfig).toHaveBeenCalled();
  });
  it('rejects reward reuse, foreign rewards and foreign item settings', async () => {
    repository.rewardUsed.mockResolvedValueOnce(true);
    await expect(service.saveConfig('owner', 'channel', input)).rejects.toThrow('bound');
    twitch.listChannelRewards.mockResolvedValueOnce({ data: [] });
    await expect(service.saveConfig('owner', 'channel', input)).rejects.toThrow('channel');
    await expect(
      service.saveConfig('owner', 'channel', { ...input, items: [{ item_id: poolId, weight: 1 }] })
    ).rejects.toThrow('Item');
  });
  it('creates a config without requiring quota and delegates enabling to shared widget accounting', async () => {
    await service.saveConfig('owner', 'channel', input);
    expect(widgets.updateEnable).not.toHaveBeenCalled();
    await service.enable('owner', 'config', true);
    expect(widgets.updateEnable).toHaveBeenCalledWith('widget', 'owner', true, undefined);
  });
  it('rejects enabling invalid pools', async () => {
    config.pool.items = [];
    await expect(service.enable('owner', 'config', true)).rejects.toThrow('empty');
    await service.enable('owner', 'config', false);
  });
  it('requires the config-specific overlay token', async () => {
    await expect(service.ack('config', 'bad', 'job')).rejects.toThrow('token');
    expect(queue.ack).not.toHaveBeenCalled();
    await service.ack('config', 'secret', 'job');
    expect(queue.ack).toHaveBeenCalledWith('config', 'random-pool', 'job');
  });
  const event = {
    id: 'redemption',
    reward: { id: 'reward' },
    broadcaster_user_id: 'channel',
    user_name: 'Viewer',
  } as TwitchChannelRedemptionAddEventRequest;
  it('queues immutable snapshots per config, logs the draw, and sends chat only after ACK', async () => {
    await service.redeem(event);
    expect(repository.log).toHaveBeenCalledWith(
      'config',
      poolId,
      'redemption',
      'Viewer',
      { id: itemId, name: 'Prize', image_key: null },
      undefined
    );
    const job = queue.enqueue.mock.calls[0][0] as OverlayJob;
    expect(job.userId).toBe('config');
    expect(job.awaitsAck).toBe(true);
    expect(twitchAppAPI.chat.sendChatMessageAsApp).not.toHaveBeenCalled();
    await handler.onAck!(job);
    expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith(
      'channel',
      'channel',
      'Viewer: Prize'
    );
  });
  it('skips draws for disabled, empty, deleted, hidden and different-channel pools', async () => {
    const pool = config.pool;
    for (const state of ['disabled', 'empty', 'deleted', 'hidden', 'channel']) {
      config.widget.enabled = state !== 'disabled';
      config.widget.twitch_id = state === 'channel' ? 'other' : 'channel';
      config.pool = {
        ...pool,
        items: state === 'empty' ? [] : pool.items,
        deleted_at: state === 'deleted' ? new Date() : null,
        moderation_status: state === 'hidden' ? 'HIDDEN' : 'VISIBLE',
      } as PoolRecord;
      await service.redeem(event);
    }
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
  it('drops pending draws and chat when a pool becomes invalid', async () => {
    await service.redeem(event);
    const job = queue.enqueue.mock.calls[0][0] as OverlayJob;
    config.pool.deleted_at = new Date();
    expect(await handler.resolve(job)).toBeNull();
    await handler.onAck!(job);
    expect(twitchAppAPI.chat.sendChatMessageAsApp).not.toHaveBeenCalled();
  });
});
