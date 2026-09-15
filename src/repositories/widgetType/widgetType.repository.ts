import { prisma } from "@/libs/prisma";
import { WidgetType } from "generated/prisma/client";
import { CreateWidgetType, UpdateWidgetType } from "./request";

export default class WidgetTypeRepository {

    constructor() {
    }

    async list(): Promise<WidgetType[]> {
        return prisma.widgetType.findMany({
            orderBy: { id: "asc" }
        });
    }

    async get(id: number): Promise<WidgetType | null> {
        return prisma.widgetType.findUnique({ where: { id } });
    }

    async getBySlug(slug: string): Promise<WidgetType | null> {
        return prisma.widgetType.findUnique({ where: { slug } });
    }

    async create(request: CreateWidgetType): Promise<WidgetType> {
        return prisma.widgetType.create({ data: request });
    }

    async update(id: number, request: UpdateWidgetType): Promise<WidgetType> {
        return prisma.widgetType.update({ where: { id }, data: request });
    }

    async delete(id: number): Promise<void> {
        await prisma.widgetType.delete({ where: { id } });
    }

    async countWidgetsUsingSlug(slug: string): Promise<number> {
        return prisma.widget.count({ where: { widget_type_slug: slug } });
    }
}
