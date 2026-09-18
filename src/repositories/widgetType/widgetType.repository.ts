import { prisma } from "@/libs/prisma";
import { WidgetType } from "generated/prisma/client";
import { CreateWidgetType, UpdateWidgetType } from "./request";
import TLogger, { Layer } from "@/logging/logger";

const logger = new TLogger(Layer.REPOSITORY);

export default class WidgetTypeRepository {

    constructor() {
    }

    async list(transactionId: string): Promise<WidgetType[]> {
        try {
        return prisma.widgetType.findMany({
            orderBy: { id: "asc" }
        });
    } catch (error) {
            logger.setContext("repository.widgetType.list", transactionId).error({ message: "list failed", error: error as Error });
            throw error;
        }
    }

    async get(transactionId: string, id: number): Promise<WidgetType | null> {
        try {
        return prisma.widgetType.findUnique({ where: { id } });
    } catch (error) {
            logger.setContext("repository.widgetType.get", transactionId).error({ message: "get failed", error: error as Error });
            throw error;
        }
    }

    async getBySlug(transactionId: string, slug: string): Promise<WidgetType | null> {
        try {
        return prisma.widgetType.findUnique({ where: { slug } });
    } catch (error) {
            logger.setContext("repository.widgetType.getBySlug", transactionId).error({ message: "getBySlug failed", error: error as Error });
            throw error;
        }
    }

    async create(transactionId: string, request: CreateWidgetType): Promise<WidgetType> {
        try {
        return prisma.widgetType.create({ data: request });
    } catch (error) {
            logger.setContext("repository.widgetType.create", transactionId).error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    async update(transactionId: string, id: number, request: UpdateWidgetType): Promise<WidgetType> {
        try {
        return prisma.widgetType.update({ where: { id }, data: request });
    } catch (error) {
            logger.setContext("repository.widgetType.update", transactionId).error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async delete(transactionId: string, id: number): Promise<void> {
        try {
        await prisma.widgetType.delete({ where: { id } });
    } catch (error) {
            logger.setContext("repository.widgetType.delete", transactionId).error({ message: "delete failed", error: error as Error });
            throw error;
        }
    }

    async countWidgetsUsingSlug(transactionId: string, slug: string): Promise<number> {
        try {
        return prisma.widget.count({ where: { widget_type_slug: slug } });
    } catch (error) {
            logger.setContext("repository.widgetType.countWidgetsUsingSlug", transactionId).error({ message: "countWidgetsUsingSlug failed", error: error as Error });
            throw error;
        }
    }
}
