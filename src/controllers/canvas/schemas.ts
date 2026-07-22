import { z } from "zod";
import { CanvasElementType } from "@/repositories/canvas/request";

export const createCanvasSchema = z.object({
    name: z.string().min(1).max(100),
    duration_ms: z.number().int().positive().max(120000).optional(),
});

export const updateCanvasSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    enabled: z.boolean().optional(),
    duration_ms: z.number().int().positive().max(120000).optional(),
});

export const canvasElementSchema = z.object({
    id: z.string().optional(),
    type: z.nativeEnum(CanvasElementType),
    media_key: z.string().nullable().optional(),
    text_content: z.string().max(500).nullable().optional(),
    text_style: z.record(z.string(), z.unknown()).nullable().optional(),
    x: z.number().min(0).max(100).optional(),
    y: z.number().min(0).max(100).optional(),
    width: z.number().min(0).max(100).optional(),
    height: z.number().min(0).max(100).optional(),
    rotation: z.number().min(-360).max(360).optional(),
    z_index: z.number().int().optional(),
    opacity: z.number().min(0).max(1).optional(),
    start_delay_ms: z.number().int().min(0).max(120000).optional(),
    duration_ms: z.number().int().min(0).max(120000).optional(),
    enter_transition: z.enum(["fade", "slide-up", "slide-down", "slide-left", "slide-right", "zoom", "pop", "none"]).optional(),
    exit_transition: z.enum(["fade", "slide-up", "slide-down", "slide-left", "slide-right", "zoom", "pop", "none"]).optional(),
    transition_ms: z.number().int().min(0).max(5000).optional(),
    volume: z.number().int().min(0).max(100).optional(),
    loop: z.boolean().optional(),
});

export const updateCanvasElementsSchema = z.object({
    elements: z.array(canvasElementSchema).max(30),
});

export const putCanvasSchema = updateCanvasSchema.extend({
    elements: z.array(canvasElementSchema).max(30).optional(),
});

export const updateCanvasLinksSchema = z.object({
    widgetIds: z.array(z.string()).max(50),
});
