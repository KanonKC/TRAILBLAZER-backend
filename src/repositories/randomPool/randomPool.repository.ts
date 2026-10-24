import { prisma } from '@/libs/prisma';
import { Prisma } from '../../../generated/prisma/client';
import TLogger, { Layer } from '@/logging/logger';
import { PoolInput, ConfigInput } from '@/services/randomPool/request';
import { BadRequestError, NotFoundError } from '@/errors';
import { randomUUID } from 'crypto';

const poolInclude = {
  items: { orderBy: { sort_order: 'asc' as const } },
  _count: { select: { configs: true } },
};
export const configInclude = { widget: true, pool: { include: poolInclude }, items: true };
export type PoolRecord = Prisma.RandomPoolGetPayload<{ include: typeof poolInclude }>;
export type ConfigRecord = Prisma.RandomPoolConfigGetPayload<{ include: typeof configInclude }>;
export default class RandomPoolRepository {
  private readonly logger = new TLogger(Layer.REPOSITORY);
  async run<Result>(
    transactionId: string | undefined,
    action: () => Promise<Result>
  ): Promise<Result> {
    const logger = this.logger.setContext('repository.randomPool', transactionId);
    try {
      return await action();
    } catch (error) {
      logger.error({ message: 'Random pool database operation failed', error: error as Error });
      throw error;
    }
  }
  listPools(ownerId: string, transactionId?: string) {
    return this.run(transactionId, () =>
      prisma.randomPool.findMany({
        where: { owner_id: ownerId, deleted_at: null },
        include: poolInclude,
        orderBy: { created_at: 'desc' },
      })
    );
  }
  pool(id: string, transactionId?: string) {
    return this.run(transactionId, () =>
      prisma.randomPool.findUnique({ where: { id }, include: poolInclude })
    );
  }
  user(id: string, transactionId?: string) {
    return this.run(transactionId, () => prisma.user.findUniqueOrThrow({ where: { id } }));
  }
  file(key: string, transactionId?: string) {
    return this.run(transactionId, () => prisma.uploadedFile.findUnique({ where: { key } }));
  }
  async savePool(
    ownerId: string,
    data: PoolInput,
    limit: number,
    id?: string,
    transactionId?: string
  ) {
    return this.run(transactionId, () =>
      prisma.$transaction(async (transaction) => {
        // Serializes owner limits and pool writes across processes.
        await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${ownerId} FOR UPDATE`;
        const existing = id
          ? await transaction.randomPool.findFirst({
              where: { id, owner_id: ownerId, deleted_at: null },
            })
          : null;
        if (id && !existing) throw new NotFoundError('Pool not found');
        if (
          !id &&
          (await transaction.randomPool.count({
            where: { owner_id: ownerId, deleted_at: null },
          })) >= limit
        )
          throw new BadRequestError(`Pool limit reached (${limit})`);
        const { items, ...fields } = data;
        const pool = id
          ? await transaction.randomPool.update({ where: { id }, data: fields })
          : await transaction.randomPool.create({ data: { ...fields, owner_id: ownerId } });
        const existingItems = await transaction.randomPoolItem.findMany({
          where: { pool_id: pool.id },
        });
        const existingIds = new Set(existingItems.map((item) => item.id));
        if (items.some((item) => item.id && !existingIds.has(item.id)))
          throw new BadRequestError('Item does not belong to this pool');
        await transaction.randomPoolItem.deleteMany({
          where: {
            pool_id: pool.id,
            id: { notIn: items.flatMap((item) => (item.id ? [item.id] : [])) },
          },
        });
        for (const [sort_order, item] of items.entries()) {
          const fields = { name: item.name || null, image_key: item.image_key || null, sort_order };
          if (item.id)
            await transaction.randomPoolItem.update({ where: { id: item.id }, data: fields });
          else await transaction.randomPoolItem.create({ data: { ...fields, pool_id: pool.id } });
        }
        return transaction.randomPool.findUniqueOrThrow({
          where: { id: pool.id },
          include: poolInclude,
        });
      })
    );
  }
  deletePool(id: string, transactionId?: string) {
    return this.run(transactionId, () =>
      prisma.randomPool.update({ where: { id }, data: { deleted_at: new Date() } })
    );
  }
  listConfigs(ownerId: string, transactionId?: string) {
    return this.run(transactionId, () =>
      prisma.randomPoolConfig.findMany({
        where: { widget: { owner_id: ownerId } },
        include: configInclude,
        orderBy: { created_at: 'desc' },
      })
    );
  }
  config(id: string, transactionId?: string) {
    return this.run(transactionId, () =>
      prisma.randomPoolConfig.findUnique({ where: { id }, include: configInclude })
    );
  }
  byReward(rewardId: string, transactionId?: string) {
    return this.run(transactionId, () =>
      prisma.randomPoolConfig.findUnique({
        where: { twitch_reward_id: rewardId },
        include: configInclude,
      })
    );
  }
  rewardUsed(rewardId: string, excludeId?: string, transactionId?: string) {
    return this.run(transactionId, async () => {
      const [pool, killer, perk, drop, spotify] = await Promise.all([
        prisma.randomPoolConfig.findFirst({
          where: { twitch_reward_id: rewardId, ...(excludeId ? { id: { not: excludeId } } : {}) },
        }),
        prisma.randomDBDKiller.findUnique({ where: { twitch_reward_id: rewardId } }),
        prisma.randomDbdPerkClass.findUnique({ where: { twitch_reward_id: rewardId } }),
        prisma.dropImage.findUnique({ where: { twitch_reward_id: rewardId } }),
        prisma.spotifySongRequest.findUnique({ where: { twitch_reward_id: rewardId } }),
      ]);
      return !!(pool || killer || perk || drop || spotify);
    });
  }
  saveConfig(
    ownerId: string,
    twitchId: string,
    data: ConfigInput,
    id?: string,
    transactionId?: string
  ) {
    return this.run(transactionId, () =>
      prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${ownerId} FOR UPDATE`;
        const { items, pool_id, ...fields } = data;
        const config = id
          ? await transaction.randomPoolConfig.update({
              where: { id },
              data: { ...fields, pool_id },
            })
          : await transaction.randomPoolConfig.create({
              data: {
                ...fields,
                pool: { connect: { id: pool_id } },
                widget: {
                  create: {
                    owner_id: ownerId,
                    twitch_id: twitchId,
                    widget_type_slug: 'random-pool',
                    instance_key: randomUUID(),
                    overlay_key: randomUUID(),
                    enabled: false,
                  },
                },
              },
            });
        await transaction.randomPoolConfigItem.deleteMany({ where: { config_id: config.id } });
        if (items.length)
          await transaction.randomPoolConfigItem.createMany({
            data: items.map((item) => ({ ...item, config_id: config.id })),
          });
        return transaction.randomPoolConfig.findUniqueOrThrow({
          where: { id: config.id },
          include: configInclude,
        });
      })
    );
  }
  deleteConfig(widgetId: string, transactionId?: string) {
    return this.run(transactionId, () => prisma.widget.delete({ where: { id: widgetId } }));
  }
  log(
    configId: string,
    poolId: string,
    redemptionId: string,
    redeemedBy: string,
    item: Prisma.InputJsonValue,
    transactionId?: string
  ) {
    return this.run(transactionId, () =>
      prisma.randomPoolSpinLog.upsert({
        where: { redemption_id: redemptionId },
        update: {},
        create: {
          config_id: configId,
          pool_id: poolId,
          redemption_id: redemptionId,
          redeemed_by: redeemedBy,
          item_snapshot: item,
        },
      })
    );
  }
  logs(configId: string, transactionId?: string) {
    return this.run(transactionId, () =>
      prisma.randomPoolSpinLog.findMany({
        where: { config_id: configId },
        orderBy: { created_at: 'desc' },
        take: 100,
      })
    );
  }
}
