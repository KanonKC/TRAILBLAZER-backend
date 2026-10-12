import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { CanvasElementInput, CreateCanvas, UpdateCanvas } from "./request";
import { CanvasWithRelations } from "./response";
import { UploadedFile } from "generated/prisma/client";

const logger = new TLogger(Layer.REPOSITORY);

const include = {
    elements: { include: { media: true }, orderBy: { z_index: "asc" as const } },
    links: true,
};

function toElementRows(elements: CanvasElementInput[]) {
    return elements.map((e, i) => ({
        type: e.type,
        media_key: e.media_key,
        volume: e.volume,
        z_index: i,
    }));
}

export default class CanvasRepository {
    async list(ownerId: string): Promise<CanvasWithRelations[]> {
        try {
            return await prisma.canvas.findMany({
                where: { owner_id: ownerId },
                include,
                orderBy: { created_at: "desc" },
            });
        } catch (error) {
            logger.setContext("repository.canvas.list").error({ message: "list failed", error: error as Error });
            throw error;
        }
    }

    async findById(id: string): Promise<CanvasWithRelations | null> {
        try {
            return await prisma.canvas.findUnique({ where: { id }, include });
        } catch (error) {
            logger.setContext("repository.canvas.findById").error({ message: "findById failed", error: error as Error });
            throw error;
        }
    }

    async create(request: CreateCanvas): Promise<CanvasWithRelations> {
        try {
            const { elements, ...data } = request;
            return await prisma.canvas.create({
                data: {
                    ...data,
                    elements: { create: toElementRows(elements) },
                },
                include,
            });
        } catch (error) {
            logger.setContext("repository.canvas.create").error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    /** Elements are replaced wholesale — a template only ever holds its current media. */
    async update(id: string, request: UpdateCanvas): Promise<CanvasWithRelations> {
        try {
            const { elements, ...data } = request;
            return await prisma.$transaction(async (tx) => {
                await tx.canvasElement.deleteMany({ where: { canvas_id: id } });
                return tx.canvas.update({
                    where: { id },
                    data: {
                        ...data,
                        elements: { create: toElementRows(elements) },
                    },
                    include,
                });
            });
        } catch (error) {
            logger.setContext("repository.canvas.update").error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async delete(id: string): Promise<void> {
        try {
            await prisma.canvas.delete({ where: { id } });
        } catch (error) {
            logger.setContext("repository.canvas.delete").error({ message: "delete failed", error: error as Error });
            throw error;
        }
    }

    async getByWidgetId(widgetId: string): Promise<CanvasWithRelations | null> {
        try {
            const link = await prisma.canvasWidgetLink.findUnique({
                where: { widget_id: widgetId },
                include: { canvas: { include } },
            });
            return link?.canvas ?? null;
        } catch (error) {
            logger.setContext("repository.canvas.getByWidgetId").error({ message: "getByWidgetId failed", error: error as Error });
            throw error;
        }
    }

    /** A widget holds at most one canvas, so linking replaces any previous link. */
    async setWidgetLink(widgetId: string, canvasId: string | null): Promise<void> {
        try {
            if (!canvasId) {
                await prisma.canvasWidgetLink.deleteMany({ where: { widget_id: widgetId } });
                return;
            }
            await prisma.canvasWidgetLink.upsert({
                where: { widget_id: widgetId },
                create: { widget_id: widgetId, canvas_id: canvasId },
                update: { canvas_id: canvasId },
            });
        } catch (error) {
            logger.setContext("repository.canvas.setWidgetLink").error({ message: "setWidgetLink failed", error: error as Error });
            throw error;
        }
    }

    async findMediaByKeys(keys: string[]): Promise<UploadedFile[]> {
        try {
            return await prisma.uploadedFile.findMany({ where: { key: { in: keys } } });
        } catch (error) {
            logger.setContext("repository.canvas.findMediaByKeys").error({ message: "findMediaByKeys failed", error: error as Error });
            throw error;
        }
    }
}
