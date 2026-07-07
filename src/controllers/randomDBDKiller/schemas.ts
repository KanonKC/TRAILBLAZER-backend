import { z } from "zod";

export const createRandomDBDKillerSchema = z.object({
    twitch_reward_id: z.string()
});

export const updateRandomDBDKillerSchema = z.object({
    twitch_reward_id: z.string().optional(),
    killer_pool: z.array(z.string()).optional()
});
