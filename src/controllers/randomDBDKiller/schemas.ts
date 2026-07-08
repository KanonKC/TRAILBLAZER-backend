import { z } from "zod";

export const createRandomDBDKillerSchema = z.object({
    twitch_reward_id: z.string().optional()
});

export const updateRandomDBDKillerSchema = z.object({
    twitch_reward_id: z.string().optional(),
    killer_pool: z.array(z.string()).optional()
});
