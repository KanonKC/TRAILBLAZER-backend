import { Prisma } from "generated/prisma/client";
import { prisma } from "@/libs/prisma";
import { CanvasElementInput, CreateCanvas, UpdateCanvas } from "./request";
import { CanvasWithElements, CanvasWithLinks } from "./response";

const ELEMENTS_INCLUDE = {
    elements: {
        include: { media: true },
        orderBy: { z_index: "asc" as const }
    }
};

export default class CanvasRepository {
    constructor() {
    }

    async create(request: CreateCanvas): Promise<CanvasWithElements> {
        return prisma.canvas.create({
            data: {
                name: request.name,
                owner_id: request.owner_id,
                duration_ms: request.duration_ms ?? 5000,
            },
            include: ELEMENTS_INCLUDE,
        });
    }

    async get(id: string): Promise<CanvasWithElements | null> {
        return prisma.canvas.findUnique({
            where: { id },
            include: ELEMENTS_INCLUDE,
        });
    }

    async getWithLinks(id: string): Promise<CanvasWithLinks | null> {
        return prisma.canvas.findUnique({
            where: { id },
            include: {
                ...ELEMENTS_INCLUDE,
                links: { include: { widget: true } },
            },
        });
    }

    async update(id: string, request: UpdateCanvas): Promise<CanvasWithElements> {
        return prisma.canvas.update({
            where: { id },
            data: request,
            include: ELEMENTS_INCLUDE,
        });
    }

    async delete(id: string): Promise<void> {
        await prisma.canvas.delete({ where: { id } });
    }

    async listByOwnerId(ownerId: string): Promise<CanvasWithElements[]> {
        return prisma.canvas.findMany({
            where: { owner_id: ownerId },
            include: ELEMENTS_INCLUDE,
            orderBy: { created_at: "desc" },
        });
    }

    async countByOwnerId(ownerId: string): Promise<number> {
        return prisma.canvas.count({ where: { owner_id: ownerId } });
    }

    async replaceElements(canvasId: string, elements: CanvasElementInput[]): Promise<CanvasWithElements> {
        return prisma.$transaction(async (tx) => {
            await tx.canvasElement.deleteMany({ where: { canvas_id: canvasId } });
            if (elements.length > 0) {
                await tx.canvasElement.createMany({
                    data: elements.map((el) => ({
                        canvas_id: canvasId,
                        type: el.type,
                        media_key: el.media_key ?? null,
                        text_content: el.text_content ?? null,
                        text_style: (el.text_style ?? undefined) as Prisma.InputJsonValue | undefined,
                        x: el.x,
                        y: el.y,
                        width: el.width,
                        height: el.height,
                        rotation: el.rotation,
                        z_index: el.z_index,
                        opacity: el.opacity,
                        start_delay_ms: el.start_delay_ms,
                        duration_ms: el.duration_ms,
                        enter_transition: el.enter_transition,
                        exit_transition: el.exit_transition,
                        transition_ms: el.transition_ms,
                        volume: el.volume,
                        loop: el.loop,
                    })),
                });
            }
            return tx.canvas.findUniqueOrThrow({
                where: { id: canvasId },
                include: ELEMENTS_INCLUDE,
            });
        });
    }

    async replaceLinks(canvasId: string, widgetIds: string[]): Promise<void> {
        await prisma.$transaction(async (tx) => {
            await tx.canvasWidgetLink.deleteMany({ where: { canvas_id: canvasId } });
            if (widgetIds.length > 0) {
                await tx.canvasWidgetLink.createMany({
                    data: widgetIds.map((widgetId) => ({ canvas_id: canvasId, widget_id: widgetId })),
                    skipDuplicates: true,
                });
            }
        });
    }

    async getEnabledByWidgetId(widgetId: string): Promise<CanvasWithElements[]> {
        const canvases = await prisma.canvas.findMany({
            where: {
                enabled: true,
                links: { some: { widget_id: widgetId } },
            },
            include: ELEMENTS_INCLUDE,
        });
        return canvases;
    }

    async incrementTriggeredCount(id: string): Promise<void> {
        await prisma.canvas.update({
            where: { id },
            data: { triggered_count: { increment: 1 } },
        });
    }
}
