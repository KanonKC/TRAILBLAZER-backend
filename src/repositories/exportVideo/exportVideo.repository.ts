import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { CreateExportVideo, UpdateExportVideo, CreateExportVideoHistory } from "./request";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { ExportVideoWithWidget, ExportVideoHistoryResponse } from "./response";
import { Pagination } from "@/services/response";

const logger = new TLogger(Layer.REPOSITORY);

export default class ExportVideoRepository {

    constructor() {
    }

    async create(transactionId: string, request: CreateExportVideo): Promise<ExportVideoWithWidget> {
        try {
        return prisma.exportVideo.create({
            data: {
                enabled: request.enabled ?? true,
                privacy_status: request.privacy_status,
                tags: request.tags,
                description: request.description,
                widget: {
                    create: {
                        twitch_id: request.twitch_id,
                        owner_id: request.owner_id,
                        widget_type_slug: WidgetTypeSlug.EXPORT_VIDEO
                    }
                }
            },
            include: {
                widget: {
                    include: {
                        widget_type: true
                    }
                },
            }
        });
    } catch (error) {
            logger.setContext("repository.exportVideo.create", transactionId).error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    async update(transactionId: string, id: string, request: UpdateExportVideo): Promise<ExportVideoWithWidget> {
        try {
        const { privacy_status, tags, description, ...exportVideoData } = request;
        const updateData: any = { ...exportVideoData };

        if (privacy_status !== undefined) updateData.privacy_status = privacy_status;
        if (tags !== undefined) updateData.tags = tags;
        if (description !== undefined) updateData.description = description;

        return prisma.exportVideo.update({
            where: { id },
            data: updateData,
            include: {
                widget: {
                    include: {
                        widget_type: true
                    }
                },
            }
        });
    } catch (error) {
            logger.setContext("repository.exportVideo.update", transactionId).error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async delete(transactionId: string, id: string): Promise<void> {
        try {
        await prisma.exportVideo.delete({
            where: { id },
        });
    } catch (error) {
            logger.setContext("repository.exportVideo.delete", transactionId).error({ message: "delete failed", error: error as Error });
            throw error;
        }
    }

    async get(transactionId: string, id: string): Promise<ExportVideoWithWidget | null> {
        try {
        return prisma.exportVideo.findUnique({
            where: { id },
            include: {
                widget: {
                    include: {
                        widget_type: true
                    }
                },
            }
        });
    } catch (error) {
            logger.setContext("repository.exportVideo.get", transactionId).error({ message: "get failed", error: error as Error });
            throw error;
        }
    }

    async getByWidgetId(transactionId: string, widgetId: string): Promise<ExportVideoWithWidget | null> {
        try {
        return prisma.exportVideo.findUnique({
            where: { widget_id: widgetId },
            include: {
                widget: {
                    include: {
                        widget_type: true
                    }
                },
            }
        });
    } catch (error) {
            logger.setContext("repository.exportVideo.getByWidgetId", transactionId).error({ message: "getByWidgetId failed", error: error as Error });
            throw error;
        }
    }

    async getByOwnerId(transactionId: string, ownerId: string): Promise<ExportVideoWithWidget | null> {
        try {
        const widget = await prisma.widget.findUniqueOrThrow({
            where: {
                owner_id_widget_type_slug: {
                    owner_id: ownerId,
                    widget_type_slug: WidgetTypeSlug.EXPORT_VIDEO
                }
            }
        });
        return prisma.exportVideo.findUnique({
            where: { widget_id: widget.id },
            include: {
                widget: {
                    include: {
                        widget_type: true
                    }
                },
            }
        });
    } catch (error) {
            logger.setContext("repository.exportVideo.getByOwnerId", transactionId).error({ message: "getByOwnerId failed", error: error as Error });
            throw error;
        }
    }

    async getByTwitchId(transactionId: string, twitchId: string): Promise<ExportVideoWithWidget | null> {
        try {
        const widget = await prisma.widget.findUniqueOrThrow({
            where: {
                twitch_id_widget_type_slug: {
                    twitch_id: twitchId,
                    widget_type_slug: WidgetTypeSlug.EXPORT_VIDEO
                }
            }
        });
        return prisma.exportVideo.findUnique({
            where: { widget_id: widget.id },
            include: {
                widget: {
                    include: {
                        widget_type: true
                    }
                },
            }
        });
    } catch (error) {
            logger.setContext("repository.exportVideo.getByTwitchId", transactionId).error({ message: "getByTwitchId failed", error: error as Error });
            throw error;
        }
    }


    // ExportVideoHistory CRUD
    async createHistory(transactionId: string, request: CreateExportVideoHistory): Promise<ExportVideoHistoryResponse> {
        try {
        return prisma.exportVideoHistory.create({
            data: {
                export_video_id: request.export_video_id,
                batch_id: request.batch_id,
                video_id: request.video_id,
                status: request.status,
                message: request.message
            }
        });
    } catch (error) {
            logger.setContext("repository.exportVideo.createHistory", transactionId).error({ message: "createHistory failed", error: error as Error });
            throw error;
        }
    }

    async listHistoryByExportVideoId(transactionId: string, exportVideoId: string, pagination: Pagination): Promise<[ExportVideoHistoryResponse[], number]> {
        try {
        const where = { export_video_id: exportVideoId };
        const data = await prisma.exportVideoHistory.findMany({
            where,
            orderBy: { created_at: "desc" },
            skip: (pagination.page - 1) * pagination.limit,
            take: pagination.limit,
        });
        const total = await prisma.exportVideoHistory.count({
            where
        });
        return [data, total];
    } catch (error) {
            logger.setContext("repository.exportVideo.listHistoryByExportVideoId", transactionId).error({ message: "listHistoryByExportVideoId failed", error: error as Error });
            throw error;
        }
    }

    async getHistory(transactionId: string, id: number): Promise<ExportVideoHistoryResponse | null> {
        try {
        return prisma.exportVideoHistory.findUnique({
            where: { id }
        });
    } catch (error) {
            logger.setContext("repository.exportVideo.getHistory", transactionId).error({ message: "getHistory failed", error: error as Error });
            throw error;
        }
    }

    async deleteHistory(transactionId: string, id: number): Promise<void> {
        try {
        await prisma.exportVideoHistory.delete({
            where: { id }
        });
    } catch (error) {
            logger.setContext("repository.exportVideo.deleteHistory", transactionId).error({ message: "deleteHistory failed", error: error as Error });
            throw error;
        }
    }
}
