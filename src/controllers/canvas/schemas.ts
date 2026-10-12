import { z } from "zod";
import { CanvasTemplateType } from "@/services/canvas/request";

export const saveCanvasSchema = z.object({
    name: z.string().trim().min(1).max(100),
    template_type: z.nativeEnum(CanvasTemplateType),
    enabled: z.boolean().optional(),
    duration_ms: z.number().int().min(500).max(120_000).optional(),
    image_key: z.string().nullish(),
    audio_key: z.string().nullish(),
    video_key: z.string().nullish(),
    volume: z.number().int().min(0).max(100).optional(),
});

export const setWidgetCanvasSchema = z.object({
    canvas_id: z.string().nullable(),
});
