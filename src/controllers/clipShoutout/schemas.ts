import { z } from "zod";

export const createClipShoutoutSchema = z.object({
    twitch_id: z.string().min(1),
    owner_id: z.cuid(),
    delay_ms: z.number().optional(),
    reply_message: z.string().optional(),
    twitch_bot_id: z.string().optional(),
    enabled_clip: z.boolean().optional(),
    enabled_highlight_only: z.boolean().optional(),
});

export const updateClipShoutoutSchema = z.object({
    reply_message: z.string().optional(),
    delay_ms: z.number().optional(),
    enabled: z.boolean().optional(),
    twitch_bot_id: z.string().optional().nullable(),
    enabled_clip: z.boolean().optional(),
    enabled_highlight_only: z.boolean().optional(),
    overlay_key: z.string().optional(),
});

export type CreateClipShoutoutSchema = z.infer<typeof createClipShoutoutSchema>;
export type UpdateClipShoutoutSchema = z.infer<typeof updateClipShoutoutSchema>;
