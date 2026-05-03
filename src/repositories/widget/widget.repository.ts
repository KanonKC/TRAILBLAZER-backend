import { Widget } from "generated/prisma/client";
import { ListWidgetFilters, UpdateWidget } from "./request";
import { prisma } from "@/libs/prisma";
import { ExtendedWidget } from "./response";
import { Pagination } from "@/services/response";
import { WidgetWhereInput } from "generated/prisma/models";

export default class WidgetRepository {
    constructor() {
    }

    async get(id: string): Promise<ExtendedWidget | null> {
        return prisma.widget.findUnique({
            where: { id },
            include: {
                widget_type: true,
            }
        });
    }

    async getByOverlayKey(overlayKey: string): Promise<ExtendedWidget | null> {
        return prisma.widget.findUnique({
            where: { overlay_key: overlayKey },
            include: {
                widget_type: true,
            }
        });
    }

    async update(id: string, request: UpdateWidget): Promise<void> {
        await prisma.widget.update({
            where: { id },
            data: request,
        });
    }

    async delete(id: string): Promise<void> {
        await prisma.widget.delete({
            where: { id },
        });
    }

    async listByOwnerId(ownerId: string, pagination: Pagination, filters?: ListWidgetFilters): Promise<[ExtendedWidget[], number]> {
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
    }

    async disableAll(ownerId: string): Promise<void> {
        await prisma.widget.updateMany({
            where: { owner_id: ownerId },
            data: { enabled: false },
        });
    }

    async getEnabledQuotaUsed(ownerId: string, excludeIds?: string[]): Promise<number> {
        const enabledWidgets = await prisma.widget.findMany({
            where: {
                owner_id: ownerId,
                enabled: true,
                ...(excludeIds && excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
            },
            include: { widget_type: true },
        });
        return enabledWidgets.reduce((sum, w) => sum + (w.widget_type?.cost ?? 1), 0);
    }

    async getFirstEnabled(ownerId: string): Promise<ExtendedWidget | null> {
        return prisma.widget.findFirst({
            where: {
                owner_id: ownerId,
                enabled: true
            },
            include: {
                widget_type: true
            }
        })
    }

    async updateOverlayKey(id: string, overlayKey: string): Promise<void> {
        await prisma.widget.update({
            where: { id },
            data: { overlay_key: overlayKey },
        });
    }

}