import { prisma } from "@/libs/prisma";
import { WidgetType } from "generated/prisma/client";
import { CreateWidgetType, UpdateWidgetType } from "./request";
import TLogger, { Layer } from "@/logging/logger";

const logger = new TLogger(Layer.REPOSITORY);

export default class WidgetTypeRepository {

    constructor() {
    }

    async list(transactionId?: string): Promise<WidgetType[]> {
        try {
        return prisma.widgetType.findMany({
            orderBy: { id: "asc" }
        });
    } catch (error) {
            logger.setContext("repository.widgetType.list", transactionId).error({ message: "list failed", error: error as Error });
            throw error;
        }
    }

    async get(id: number, transactionId?: string): Promise<WidgetType | null> {
        try {
        return prisma.widgetType.findUnique({ where: { id } });
    } catch (error) {
            logger.setContext("repository.widgetType.get", transactionId).error({ message: "get failed", error: error as Error });
            throw error;
        }
    }

    async getBySlug(slug: string, transactionId?: string): Promise<WidgetType | null> {
        try {
        return prisma.widgetType.findUnique({ where: { slug } });
    } catch (error) {
            logger.setContext("repository.widgetType.getBySlug", transactionId).error({ message: "getBySlug failed", error: error as Error });
            throw error;
        }
    }

    async create(request: CreateWidgetType, transactionId?: string): Promise<WidgetType> {
        try {
        return prisma.widgetType.create({ data: request });
    } catch (error) {
            logger.setContext("repository.widgetType.create", transactionId).error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    async update(id: number, request: UpdateWidgetType, transactionId?: string): Promise<WidgetType> {
        try {
        return prisma.widgetType.update({ where: { id }, data: request });
    } catch (error) {
            logger.setContext("repository.widgetType.update", transactionId).error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async updateAndDisableUnavailable(id: number, request: UpdateWidgetType, transactionId?: string): Promise<{ widgetType: WidgetType; affectedWidgets: { id: string; owner_id: string }[] }> {
        try {
            return await prisma.$transaction(async transaction => {
                const widgetType = await transaction.widgetType.update({ where: { id }, data: request });
                const affectedWidgets = await transaction.widget.findMany({
                    where: { widget_type_slug: widgetType.slug, enabled: true, ...(request.availability === "whitelist_only" ? { owner: { is_whitelisted: false } } : {}) },
                    select: { id: true, owner_id: true },
                });
                await transaction.widget.updateMany({ where: { id: { in: affectedWidgets.map(widget => widget.id) } }, data: { enabled: false } });
                return { widgetType, affectedWidgets };
            });
        } catch (error) {
            logger.setContext("repository.widgetType.updateAndDisableUnavailable", transactionId).error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async delete(id: number, transactionId?: string): Promise<void> {
        try {
        await prisma.widgetType.delete({ where: { id } });
    } catch (error) {
            logger.setContext("repository.widgetType.delete", transactionId).error({ message: "delete failed", error: error as Error });
            throw error;
        }
    }

    async countWidgetsUsingSlug(slug: string, transactionId?: string): Promise<number> {
        try {
        return prisma.widget.count({ where: { widget_type_slug: slug } });
    } catch (error) {
            logger.setContext("repository.widgetType.countWidgetsUsingSlug", transactionId).error({ message: "countWidgetsUsingSlug failed", error: error as Error });
            throw error;
        }
    }
}
