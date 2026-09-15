import { z } from "zod";

export const createWidgetTypeSchema = z.object({
    slug: z.string().min(1),
    display_name: z.string().min(1),
    description: z.string().nullable().optional(),
    cost: z.number().int().min(0).optional(),
    icon_url: z.string().nullable().optional(),
    theme_color: z.string().nullable().optional(),
    href: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
    is_display: z.boolean().optional()
});

export const updateWidgetTypeSchema = createWidgetTypeSchema.partial();
