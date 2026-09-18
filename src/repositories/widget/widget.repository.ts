import TLogger, { Layer } from "@/logging/logger";
import { Widget } from "generated/prisma/client";
import { ListWidgetFilters, UpdateWidget } from "./request";
import { prisma } from "@/libs/prisma";
import { ExtendedWidget } from "./response";
import { Pagination } from "@/services/response";
import { WidgetWhereInput } from "generated/prisma/models";

const logger = new TLogger(Layer.REPOSITORY);

export default class WidgetRepository {
    constructor() {
    }

    async get(id: string, transactionId?: string): Promise<ExtendedWidget | null> {
        try {
        return prisma.widget.findUnique({
            where: { id },
            include: {
                widget_type: true,
            }
        });
    } catch (error) {
            logger.setContext("repository.widget.get", transactionId).error({ message: "get failed", error: error as Error });
            throw error;
        }
    }

    async getByOverlayKey(overlayKey: string, transactionId?: string): Promise<ExtendedWidget | null> {
        try {
        return prisma.widget.findUnique({
            where: { overlay_key: overlayKey },
            include: {
                widget_type: true,
            }
        });
    } catch (error) {
            logger.setContext("repository.widget.getByOverlayKey", transactionId).error({ message: "getByOverlayKey failed", error: error as Error });
            throw error;
        }
    }

    async update(id: string, request: UpdateWidget, transactionId?: string): Promise<void> {
        try {
        await prisma.widget.update({
            where: { id },
            data: request,
        });
    } catch (error) {
            logger.setContext("repository.widget.update", transactionId).error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async delete(id: string, transactionId?: string): Promise<void> {
        try {
        await prisma.widget.delete({
            where: { id },
        });
    } catch (error) {
            logger.setContext("repository.widget.delete", transactionId).error({ message: "delete failed", error: error as Error });
            throw error;
        }
    }

    async listByOwnerId(ownerId: string, pagination: Pagination, filters?: ListWidgetFilters, transactionId?: string): Promise<[ExtendedWidget[], number]> {
        try {
        const where: WidgetWhereInput = {
            owner_id: ownerId,
        };

        if (filters?.excludeIds && filters.excludeIds.length > 0) {
            where.id = {
                notIn: filters.excludeIds,
            };
        }

        if (filters?.enabled !== undefined) {
            where.enabled = filters.enabled;
        }

        const res = await prisma.widget.findMany({
            where: where,
            include: {
                widget_type: true,
            },
            skip: (pagination.page - 1) * pagination.limit,
            take: pagination.limit,
        });
        const total = await prisma.widget.count({
            where: where,
        });
        return [res, total];
    } catch (error) {
            logger.setContext("repository.widget.listByOwnerId", transactionId).error({ message: "listByOwnerId failed", error: error as Error });
            throw error;
        }
    }

    async disableAll(ownerId: string, transactionId?: string): Promise<void> {
        try {
        await prisma.widget.updateMany({
            where: { owner_id: ownerId },
            data: { enabled: false },
        });
    } catch (error) {
            logger.setContext("repository.widget.disableAll", transactionId).error({ message: "disableAll failed", error: error as Error });
            throw error;
        }
    }

    async getEnabledQuotaUsed(ownerId: string, excludeIds?: string[], transactionId?: string): Promise<number> {
        try {
        const enabledWidgets = await prisma.widget.findMany({
            where: {
                owner_id: ownerId,
                enabled: true,
                ...(excludeIds && excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
            },
            include: { widget_type: true },
        });
        return enabledWidgets.reduce((sum, w) => sum + (w.widget_type?.cost ?? 1), 0);
    } catch (error) {
            logger.setContext("repository.widget.getEnabledQuotaUsed", transactionId).error({ message: "getEnabledQuotaUsed failed", error: error as Error });
            throw error;
        }
    }

    async getFirstEnabled(ownerId: string, transactionId?: string): Promise<ExtendedWidget | null> {
        try {
        return prisma.widget.findFirst({
            where: {
                owner_id: ownerId,
                enabled: true
            },
            include: {
                widget_type: true
            }
        })
    } catch (error) {
            logger.setContext("repository.widget.getFirstEnabled", transactionId).error({ message: "getFirstEnabled failed", error: error as Error });
            throw error;
        }
    }

    async updateOverlayKey(id: string, overlayKey: string, transactionId?: string): Promise<void> {
        try {
        await prisma.widget.update({
            where: { id },
            data: { overlay_key: overlayKey },
        });
    } catch (error) {
            logger.setContext("repository.widget.updateOverlayKey", transactionId).error({ message: "updateOverlayKey failed", error: error as Error });
            throw error;
        }
    }

    async increaseTriggeredCount(id: string, transactionId?: string): Promise<void> {
        try {
        await prisma.widget.update({
            where: { id },
            data: { triggered_count: {
                increment: 1
            } }
        })
    } catch (error) {
            logger.setContext("repository.widget.increaseTriggeredCount", transactionId).error({ message: "increaseTriggeredCount failed", error: error as Error });
            throw error;
        }
    }

}