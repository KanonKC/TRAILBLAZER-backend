import { z } from "zod";

const emptyToUndefined = (val: unknown) => (val === "" ? undefined : val);

export const listAdminUserSchema = z.object({
    search: z.string().optional(),
    tier: z.preprocess(emptyToUndefined, z.coerce.number().int().optional()),
    is_showcase: z.preprocess(emptyToUndefined, z.coerce.boolean().optional()),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().default(20)
});

export const getUserWidgetsSchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().default(50)
});
