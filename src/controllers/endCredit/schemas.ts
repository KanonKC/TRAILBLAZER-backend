import { z } from "zod";

export const createEndCreditSchema = z.object({
    followers_header: z.string().max(500).nullable().optional(),
    subscribes_header: z.string().max(500).nullable().optional(),
    raids_header: z.string().max(500).nullable().optional(),
    bits_header: z.string().max(500).nullable().optional(),
    viewers_header: z.string().max(500).nullable().optional(),
    is_show_viewer_avatars: z.boolean().optional(),
    scroll_speed: z.number().int().min(20).max(200).optional(),
    is_show_sub_months: z.boolean().optional(),
    is_show_raid_count: z.boolean().optional(),
    is_show_bits_amount: z.boolean().optional(),
});

export const updateEndCreditSchema = z.object({
    followers_header: z.string().max(500).nullable().optional(),
    subscribes_header: z.string().max(500).nullable().optional(),
    raids_header: z.string().max(500).nullable().optional(),
    bits_header: z.string().max(500).nullable().optional(),
    viewers_header: z.string().max(500).nullable().optional(),
    is_show_viewer_avatars: z.boolean().optional(),
    scroll_speed: z.number().int().min(20).max(200).optional(),
    is_show_sub_months: z.boolean().optional(),
    is_show_raid_count: z.boolean().optional(),
    is_show_bits_amount: z.boolean().optional(),
    enabled: z.boolean().optional(),
});

export type CreateEndCreditSchema = z.infer<typeof createEndCreditSchema>;
export type UpdateEndCreditSchema = z.infer<typeof updateEndCreditSchema>;
