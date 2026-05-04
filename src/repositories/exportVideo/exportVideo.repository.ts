import { prisma } from "@/libs/prisma";
import { CreateExportVideo, UpdateExportVideo, CreateExportVideoHistory } from "./request";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { ExportVideoWithWidget, ExportVideoHistoryResponse } from "./response";
import { Pagination } from "@/services/response";

export default class ExportVideoRepository {

    constructor() {
    }

    async create(request: CreateExportVideo): Promise<ExportVideoWithWidget> {
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
    }

    async update(id: string, request: UpdateExportVideo): Promise<ExportVideoWithWidget> {
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
    }

    async delete(id: string): Promise<void> {
        await prisma.exportVideo.delete({
            where: { id },
        });
    }

    async get(id: string): Promise<ExportVideoWithWidget | null> {
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
    }

    async getByWidgetId(widgetId: string): Promise<ExportVideoWithWidget | null> {
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
    }

    async getByOwnerId(ownerId: string): Promise<ExportVideoWithWidget | null> {
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
    }

    async getByTwitchId(twitchId: string): Promise<ExportVideoWithWidget | null> {
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
    }


    // ExportVideoHistory CRUD
    async createHistory(request: CreateExportVideoHistory): Promise<ExportVideoHistoryResponse> {
        return prisma.exportVideoHistory.create({
            data: {
                export_video_id: request.export_video_id,
                batch_id: request.batch_id,
                video_id: request.video_id,
                status: request.status,
                message: request.message
            }
        });
    }

    async listHistoryByExportVideoId(exportVideoId: string, pagination: Pagination): Promise<[ExportVideoHistoryResponse[], number]> {
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
    }

    async getHistory(id: number): Promise<ExportVideoHistoryResponse | null> {
        return prisma.exportVideoHistory.findUnique({
            where: { id }
        });
    }

    async deleteHistory(id: number): Promise<void> {
        await prisma.exportVideoHistory.delete({
            where: { id }
        });
    }
}
