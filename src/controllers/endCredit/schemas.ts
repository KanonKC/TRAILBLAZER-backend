import { z } from "zod";

export const createEndCreditSchema = z.object({
    followers_header: z.string().max(500).nullable().optional(),
    subscribes_header: z.string().max(500).nullable().optional(),
    raids_header: z.string().max(500).nullable().optional(),
    bits_header: z.string().max(500).nullable().optional(),
    viewers_header: z.string().max(500).nullable().optional(),
    is_show_viewer_avatars: z.boolean().optional(),
});

export const updateEndCreditSchema = z.object({
    followers_header: z.string().max(500).nullable().optional(),
    subscribes_header: z.string().max(500).nullable().optional(),
    raids_header: z.string().max(500).nullable().optional(),
    bits_header: z.string().max(500).nullable().optional(),
    viewers_header: z.string().max(500).nullable().optional(),
    is_show_viewer_avatars: z.boolean().optional(),
    enabled: z.boolean().optional(),
});

export type CreateEndCreditSchema = z.infer<typeof createEndCreditSchema>;
export type UpdateEndCreditSchema = z.infer<typeof updateEndCreditSchema>;
