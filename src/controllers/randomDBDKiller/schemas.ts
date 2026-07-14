import { z } from "zod";
import { RandomDBDKillerAnimationStyle } from "@/repositories/randomDBDKiller/request";

export const createRandomDBDKillerSchema = z.object({
    twitch_reward_id: z.string().optional()
});

export const updateRandomDBDKillerSchema = z.object({
    twitch_reward_id: z.string().optional(),
    killer_pool: z.array(z.string()).optional(),
    animation_style: z.nativeEnum(RandomDBDKillerAnimationStyle).optional()
});
