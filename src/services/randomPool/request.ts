import { z } from 'zod';

export const itemSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().max(32).nullable().optional(),
    image_key: z.string().min(1).nullable().optional(),
  })
  .refine((item) => !!item.name || !!item.image_key, 'An item needs an image or name');
export const poolSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    cover_key: z.string().min(1).nullable().optional(),
    visibility: z.literal('PRIVATE').default('PRIVATE'),
    items: z.array(itemSchema).max(50),
  })
  .refine(
    (pool) =>
      new Set(pool.items.flatMap((item) => (item.id ? [item.id] : []))).size ===
      pool.items.filter((item) => item.id).length,
    'Duplicate item IDs'
  );
export const configSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    pool_id: z.string().uuid(),
    twitch_reward_id: z.string().min(1),
    /** Account that sends the result to chat: the streamer's own Twitch id, or null for the default bot. */
    twitch_bot_id: z.string().min(1).nullable().optional(),
    mode: z.enum(['UNIFORM', 'WEIGHTED']),
    visualization: z.enum(['SHUFFLE', 'SLIDE', 'WHEEL']),
    default_chat_message: z.string().max(500).nullable().optional(),
    spin_sound_key: z.string().nullable().optional(),
    default_result_sound_key: z.string().nullable().optional(),
    items: z
      .array(
        z.object({
          item_id: z.string().uuid(),
          weight: z.number().finite().positive().max(1000000).default(1),
          chat_message: z.string().max(500).nullable().optional(),
          result_sound_key: z.string().nullable().optional(),
        })
      )
      .max(50)
      .default([]),
  })
  .refine(
    (config) =>
      config.mode === 'WEIGHTED'
        ? config.visualization === 'WHEEL'
        : config.visualization !== 'WHEEL',
    'Invalid mode and visualization combination'
  )
  .refine(
    (config) => new Set(config.items.map((item) => item.item_id)).size === config.items.length,
    'Duplicate item settings'
  );
export type PoolInput = z.infer<typeof poolSchema>;
export type ConfigInput = z.infer<typeof configSchema>;
