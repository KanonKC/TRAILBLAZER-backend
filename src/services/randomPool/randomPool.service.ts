import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '@/errors';
import RandomPoolRepository, {
  ConfigRecord,
  PoolRecord,
} from '@/repositories/randomPool/randomPool.repository';
import { ConfigInput, configSchema, PoolInput, poolSchema } from './request';
import { chatMessage, drawItem, poolState } from './randomPool.logic';
import WidgetService from '@/services/widget/widget.service';
import OverlayQueueService from '@/services/overlayQueue/overlayQueue.service';
import TwitchService from '@/services/twitch/twitch';
import EventSubReconcilerService from '@/services/twitch/eventSubReconciler/eventSubReconciler.service';
import { WidgetTypeSlug } from '@/services/constant';
import { TwitchChannelRedemptionAddEventRequest } from '@/events/twitch/channelRedemptionAdd/request';
import { publisher } from '@/libs/redis';
import s3 from '@/libs/awsS3';
import TLogger, { Layer } from '@/logging/logger';
import { timingSafeEqual } from 'crypto';

interface SpinPayload {
  config_id: string;
  pool_id: string;
  item: { id: string; name: string | null; image_key: string | null };
  pool: { id: string; name: string | null; image_key: string | null; weight: number }[];
  visualization: string;
  spin_sound_key: string | null;
  result_sound_key: string | null;
  message: string;
  broadcaster_id: string;
  redemption_id: string;
  redeemed_by: string;
}
export default class RandomPoolService {
  private readonly logger = new TLogger(Layer.SERVICE);
  constructor(
    private readonly repository: RandomPoolRepository,
    private readonly widgets: WidgetService,
    private readonly queue: OverlayQueueService,
    private readonly twitch: TwitchService
  ) {
    widgets.registerEnableHandler(WidgetTypeSlug.RANDOM_POOL, {
      beforeEnable: async (widgetId, ownerId, transactionId) => {
        const config = (await repository.listConfigs(ownerId, transactionId)).find(
          (candidate) => candidate.widget_id === widgetId
        );
        if (config && poolState(config.pool) !== 'READY')
          throw new BadRequestError(`Pool is ${poolState(config.pool).toLowerCase()}`);
      },
      afterChange: async (widgetId, ownerId, _enabled, transactionId) => {
        const config = (await repository.listConfigs(ownerId, transactionId)).find(
          (candidate) => candidate.widget_id === widgetId
        );
        if (config) await this.publishState(config.pool_id, ownerId, transactionId);
      },
    });
    queue.register<SpinPayload>(WidgetTypeSlug.RANDOM_POOL, {
      channel: 'random-pool:result',
      event: 'pool-result',
      estimateDurationMs: () => 25000,
      resolve: async (job) => {
        const config = await repository.config(job.payload.config_id, job.transactionId);
        if (
          !config ||
          !config.widget.enabled ||
          config.pool_id !== job.payload.pool_id ||
          poolState(config.pool) !== 'READY'
        )
          return null;
        const payload = job.payload;
        return {
          ...payload,
          item: await this.snapshot(payload.item),
          pool: await Promise.all(payload.pool.map((item) => this.snapshot(item))),
          spin_sound_url: await this.url(payload.spin_sound_key),
          result_sound_url: await this.url(payload.result_sound_key),
        };
      },
      onAck: async (job) => {
        const logger = this.logger.setContext('service.randomPool.onAck', job.transactionId);
        const payload = job.payload;
        const config = await repository.config(payload.config_id, job.transactionId);
        if (
          !config ||
          !config.widget.enabled ||
          config.pool_id !== payload.pool_id ||
          poolState(config.pool) !== 'READY'
        )
          return;
        if (payload.message) {
          logger.info({ message: 'Sending random pool result to Twitch' });
          const { twitchAppAPI } = await import('@/libs/twurple');
          await twitchAppAPI.chat.sendChatMessageAsApp(
            payload.broadcaster_id,
            payload.broadcaster_id,
            payload.message
          );
          logger.info({ message: 'Random pool result sent' });
        }
      },
    });
  }
  private async url(key: string | null | undefined) {
    return key ? s3.getSignedURL(key, { expiresIn: 3600 }) : null;
  }
  private async snapshot<Item extends { image_key: string | null }>(item: Item) {
    return { ...item, image_url: await this.url(item.image_key) };
  }
  private async ownedPool(ownerId: string, id: string, transactionId?: string) {
    const pool = await this.repository.pool(id, transactionId);
    if (!pool || pool.deleted_at) throw new NotFoundError('Pool not found');
    if (pool.owner_id !== ownerId) throw new ForbiddenError('You do not own this pool');
    return pool;
  }
  async ownedConfig(ownerId: string, id: string, transactionId?: string) {
    const config = await this.repository.config(id, transactionId);
    if (!config) throw new NotFoundError('Config not found');
    if (config.widget.owner_id !== ownerId) throw new ForbiddenError('You do not own this config');
    return config;
  }
  private async file(
    ownerId: string,
    key: string | null | undefined,
    kind: 'image' | 'audio',
    transactionId?: string
  ) {
    if (!key) return;
    const file = await this.repository.file(key, transactionId);
    if (!file || file.owner_id !== ownerId)
      throw new BadRequestError('Select an uploaded file you own');
    if (kind === 'image') {
      if (file.size_kb > 2048) throw new BadRequestError('Files must be at most 2 MB');
      if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'].includes(file.type))
        throw new BadRequestError('Invalid image type');
      return;
    }
    // Audio follows the shared audio uploader: mp3, wav or ogg up to 2.5 MB.
    if (file.size_kb > 2560) throw new BadRequestError('Audio must be at most 2.5 MB');
    if (
      ![
        'audio/mpeg',
        'audio/mp3',
        'audio/ogg',
        'application/ogg',
        'audio/wav',
        'audio/x-wav',
        'audio/wave',
      ].includes(file.type)
    )
      throw new BadRequestError('Audio must be mp3, wav or ogg');
  }
  private async extendPool(pool: PoolRecord) {
    return {
      ...pool,
      cover_url: await this.url(pool.cover_key),
      items: await Promise.all(pool.items.map((item) => this.snapshot(item))),
    };
  }
  private async extendConfig(config: ConfigRecord) {
    return {
      ...config,
      pool_state: poolState(config.pool),
      pool: await this.extendPool(config.pool),
    };
  }
  async listPools(ownerId: string, transactionId?: string) {
    const logger = this.logger.setContext('service.randomPool.listPools', transactionId);
    const [user, pools] = await Promise.all([
      this.repository.user(ownerId, transactionId),
      this.repository.listPools(ownerId, transactionId),
    ]);
    logger.info({ message: 'Listed random pools', data: { count: pools.length } });
    const isPro = user.tier >= 1 && (!user.tier_expire_at || user.tier_expire_at > new Date());
    return {
      data: await Promise.all(pools.map((pool) => this.extendPool(pool))),
      limit: isPro ? 10 : 3,
    };
  }
  async savePool(ownerId: string, input: PoolInput, id?: string, transactionId?: string) {
    const logger = this.logger.setContext('service.randomPool.savePool', transactionId);
    const data = poolSchema.parse(input);
    if (id) await this.ownedPool(ownerId, id, transactionId);
    await Promise.all([
      this.file(ownerId, data.cover_key, 'image', transactionId),
      ...data.items.map((item) => this.file(ownerId, item.image_key, 'image', transactionId)),
    ]);
    const user = await this.repository.user(ownerId, transactionId);
    const isPro = user.tier >= 1 && (!user.tier_expire_at || user.tier_expire_at > new Date());
    const pool = await this.repository.savePool(ownerId, data, isPro ? 10 : 3, id, transactionId);
    await this.publishState(pool.id, ownerId, transactionId);
    logger.info({ message: 'Saved random pool', data: { poolId: pool.id } });
    return this.extendPool(pool);
  }
  async deletePool(ownerId: string, id: string, transactionId?: string) {
    const logger = this.logger.setContext('service.randomPool.deletePool', transactionId);
    const pool = await this.ownedPool(ownerId, id, transactionId);
    await this.repository.deletePool(id, transactionId);
    await this.publishState(id, ownerId, transactionId);
    logger.info({ message: 'Deleted random pool', data: { poolId: id } });
    return { affected_configs: pool._count.configs, importers: 0 };
  }
  private async publishState(poolId: string, ownerId: string, transactionId?: string) {
    const configs = await this.repository.listConfigs(ownerId, transactionId);
    await Promise.all(
      configs
        .filter((config) => config.pool_id === poolId)
        .map((config) =>
          publisher.publish(
            'random-pool:state',
            JSON.stringify({
              config_id: config.id,
              pool_state: poolState(config.pool),
              enabled: config.widget.enabled,
            })
          )
        )
    );
  }
  async listConfigs(ownerId: string, transactionId?: string) {
    return {
      data: await Promise.all(
        (await this.repository.listConfigs(ownerId, transactionId)).map((config) =>
          this.extendConfig(config)
        )
      ),
    };
  }
  async getConfig(ownerId: string, id: string, transactionId?: string) {
    return this.extendConfig(await this.ownedConfig(ownerId, id, transactionId));
  }
  async saveConfig(
    ownerId: string,
    twitchId: string,
    input: ConfigInput,
    id?: string,
    transactionId?: string
  ) {
    const logger = this.logger.setContext('service.randomPool.saveConfig', transactionId);
    await this.widgets.authorizeWidgetType(ownerId, WidgetTypeSlug.RANDOM_POOL, transactionId);
    const data = configSchema.parse(input);
    if (id) await this.ownedConfig(ownerId, id, transactionId);
    const pool = await this.ownedPool(ownerId, data.pool_id, transactionId);
    if (data.items.some((setting) => !pool.items.some((item) => item.id === setting.item_id)))
      throw new BadRequestError('Item does not belong to selected pool');
    if (await this.repository.rewardUsed(data.twitch_reward_id, id, transactionId))
      throw new BadRequestError('Reward is already bound to a widget');
    logger.info({ message: 'Checking channel rewards' });
    const rewards = await this.twitch.listChannelRewards(twitchId, undefined, transactionId);
    logger.info({ message: 'Channel rewards loaded' });
    if (!rewards.data.some((reward) => reward.id === data.twitch_reward_id))
      throw new BadRequestError('Reward does not belong to your channel');
    await Promise.all([
      this.file(ownerId, data.spin_sound_key, 'audio', transactionId),
      this.file(ownerId, data.default_result_sound_key, 'audio', transactionId),
      ...data.items.map((item) =>
        this.file(ownerId, item.result_sound_key, 'audio', transactionId)
      ),
    ]);
    logger.info({ message: 'Ensuring redemption EventSub subscriptions' });
    await EventSubReconcilerService.ensureEventSubs(
      twitchId,
      EventSubReconcilerService.getRequiredEventTypes([WidgetTypeSlug.RANDOM_POOL])
    );
    const config = await this.repository.saveConfig(ownerId, twitchId, data, id, transactionId);
    await this.publishState(config.pool_id, ownerId, transactionId);
    logger.info({ message: 'Saved random pool config', data: { configId: config.id } });
    return this.extendConfig(config);
  }
  async refreshOverlayKey(ownerId: string, id: string, transactionId?: string) {
    const config = await this.ownedConfig(ownerId, id, transactionId);
    await this.widgets.refreshOverlayKey(config.widget_id, transactionId);
    return this.getConfig(ownerId, id, transactionId);
  }
  async deleteConfig(ownerId: string, id: string, transactionId?: string) {
    const config = await this.ownedConfig(ownerId, id, transactionId);
    await this.repository.deleteConfig(config.widget_id, transactionId);
    await publisher.publish(
      'random-pool:state',
      JSON.stringify({ config_id: id, pool_state: 'DELETED', enabled: false })
    );
  }
  async overlay(id: string, key: string, transactionId?: string) {
    const config = await this.repository.config(id, transactionId);
    const expected = config?.widget.overlay_key;
    if (
      !expected ||
      !key ||
      Buffer.byteLength(expected) !== Buffer.byteLength(key) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(key))
    )
      throw new UnauthorizedError('Invalid overlay token');
    return config!;
  }
  async ack(id: string, key: string, jobId: string, transactionId?: string) {
    await this.overlay(id, key, transactionId);
    await this.queue.ack(id, WidgetTypeSlug.RANDOM_POOL, jobId);
  }
  async logs(ownerId: string, id: string, transactionId?: string) {
    await this.ownedConfig(ownerId, id, transactionId);
    return { data: await this.repository.logs(id, transactionId) };
  }
  /** Queues a spin on the real overlay from the saved config; no Twitch chat message or history log. */
  async testSpin(ownerId: string, id: string, transactionId?: string) {
    const logger = this.logger.setContext('service.randomPool.testSpin', transactionId);
    const config = await this.ownedConfig(ownerId, id, transactionId);
    if (!config.widget.enabled) throw new BadRequestError('Enable this config before testing');
    if (poolState(config.pool) !== 'READY') throw new BadRequestError('Pool is not ready');
    const item = drawItem(config.pool.items, config.mode, config.items);
    const setting = config.items.find((setting) => setting.item_id === item.id);
    const result = await this.queue.enqueue<SpinPayload>({
      userId: config.id,
      widgetSlug: WidgetTypeSlug.RANDOM_POOL,
      widgetId: config.widget_id,
      awaitsAck: true,
      transactionId,
      payload: {
        config_id: config.id,
        pool_id: config.pool_id,
        item: { id: item.id, name: item.name, image_key: item.image_key },
        pool: config.pool.items.map((poolItem) => ({
          id: poolItem.id,
          name: poolItem.name,
          image_key: poolItem.image_key,
          weight: config.items.find((entry) => entry.item_id === poolItem.id)?.weight ?? 1,
        })),
        visualization: config.visualization,
        spin_sound_key: config.spin_sound_key,
        result_sound_key: setting?.result_sound_key || config.default_result_sound_key,
        message: '',
        broadcaster_id: config.widget.twitch_id,
        redemption_id: `test-${Date.now()}`,
        redeemed_by: ownerId,
      },
    });
    logger.info({ message: 'Random pool test spin queued', data: result });
    return result;
  }
  async redeem(event: TwitchChannelRedemptionAddEventRequest, transactionId?: string) {
    const logger = this.logger.setContext('service.randomPool.redeem', transactionId);
    const config = await this.repository.byReward(event.reward.id, transactionId);
    if (
      !config ||
      config.widget.twitch_id !== event.broadcaster_user_id ||
      !config.widget.enabled ||
      !await this.widgets.isEnabledAndAvailable(config.widget_id, transactionId) ||
      poolState(config.pool) !== 'READY'
    )
      return;
    const item = drawItem(config.pool.items, config.mode, config.items);
    const setting = config.items.find((setting) => setting.item_id === item.id);
    const result = await this.queue.enqueue<SpinPayload>({
      userId: config.id,
      widgetSlug: WidgetTypeSlug.RANDOM_POOL,
      widgetId: config.widget_id,
      awaitsAck: true,
      dedupeKey: event.id,
      dedupeTtlMs: 86400000,
      transactionId,
      payload: {
        config_id: config.id,
        pool_id: config.pool_id,
        item: { id: item.id, name: item.name, image_key: item.image_key },
        pool: config.pool.items.map((item) => ({
          id: item.id,
          name: item.name,
          image_key: item.image_key,
          weight: config.items.find((setting) => setting.item_id === item.id)?.weight ?? 1,
        })),
        visualization: config.visualization,
        spin_sound_key: config.spin_sound_key,
        result_sound_key: setting?.result_sound_key || config.default_result_sound_key,
        message: chatMessage(
          setting?.chat_message,
          config.default_chat_message,
          event.user_name,
          item.name
        ),
        broadcaster_id: event.broadcaster_user_id,
        redemption_id: event.id,
        redeemed_by: event.user_id || event.user_name,
      },
    });
    if (result.enqueued)
      await this.repository.log(
        config.id,
        config.pool_id,
        event.id,
        event.user_id || event.user_name,
        { id: item.id, name: item.name, image_key: item.image_key },
        transactionId
      );
    logger.info({ message: 'Random pool redemption queued', data: result });
  }
}
