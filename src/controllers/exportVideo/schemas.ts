import { z } from "zod";

export const createExportVideoSchema = z.object({
    twitch_id: z.string().min(1),
    owner_id: z.string().cuid(),
    privacy_status: z.string().optional(),
    tags: z.array(z.string()).optional(),
    description: z.string().nullable().optional(),
});

export const updateExportVideoSchema = z.object({
    privacy_status: z.string().optional(),
    tags: z.array(z.string()).optional(),
    description: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
});

export const createExportVideoHistorySchema = z.object({
    batch_id: z.string().nullable().optional(),
    video_id: z.string().min(1),
    status: z.string().min(1),
    message: z.string().nullable().optional(),
});

export type CreateExportVideoSchema = z.infer<typeof createExportVideoSchema>;
export type UpdateExportVideoSchema = z.infer<typeof updateExportVideoSchema>;
export type CreateExportVideoHistorySchema = z.infer<typeof createExportVideoHistorySchema>;
