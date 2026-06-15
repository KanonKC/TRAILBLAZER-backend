import { z } from "zod";

export const createSpotifySongRequestSchema = z.object({
    twitch_id: z.string().min(1),
    owner_id: z.string().cuid(),
    twitch_reward_id: z.string().optional().nullable(),
    twitch_bot_id: z.string().optional().nullable(),
    invalid_message: z.string().optional().nullable(),
    success_message: z.string().optional().nullable(),
    noActiveMessage: z.string().optional().nullable(),
});

export const updateSpotifySongRequestSchema = z.object({
    twitch_reward_id: z.string().optional().nullable(),
    twitch_bot_id: z.string().optional().nullable(),
    invalid_message: z.string().optional().nullable(),
    success_message: z.string().optional().nullable(),
    noActiveMessage: z.string().optional().nullable(),
    enabled: z.boolean().optional(),
    overlay_key: z.string().optional(),
});

export type CreateSpotifySongRequestSchema = z.infer<typeof createSpotifySongRequestSchema>;
export type UpdateSpotifySongRequestSchema = z.infer<typeof updateSpotifySongRequestSchema>;
