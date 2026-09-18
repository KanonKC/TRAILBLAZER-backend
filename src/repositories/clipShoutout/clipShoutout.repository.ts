import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { CreateClipShoutout, UpdateClipShoutout } from "./request";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { ClipShoutoutWidget } from "./response";

const logger = new TLogger(Layer.REPOSITORY);

export default class ClipShoutoutRepository {

    constructor() {
    }

    async create(request: CreateClipShoutout, transactionId?: string): Promise<ClipShoutoutWidget> {
        try {
        return prisma.clipShoutout.create({
            data: {
                reply_message: request.reply_message,
                delay_ms: request.delay_ms,
                enabled_clip: request.enabled_clip,
                enabled_highlight_only: request.enabled_highlight_only,
                widget: {
                    create: {
                        twitch_id: request.twitch_id,
                        owner_id: request.owner_id,
                        overlay_key: request.overlay_key,
                        widget_type_slug: WidgetTypeSlug.CLIP_SHOUTOUT
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
            logger.setContext("repository.clipShoutout.create", transactionId).error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    async update(id: string, request: UpdateClipShoutout, transactionId?: string): Promise<ClipShoutoutWidget> {
        try {
        return prisma.clipShoutout.update({
            where: { id },
            data: request,
            include: {
                widget: {
                    include: {
                        widget_type: true
                    }
                },
            }
        });
    } catch (error) {
            logger.setContext("repository.clipShoutout.update", transactionId).error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async delete(id: string, transactionId?: string): Promise<void> {
        try {
        await prisma.clipShoutout.delete({
            where: { id },
        });
    } catch (error) {
            logger.setContext("repository.clipShoutout.delete", transactionId).error({ message: "delete failed", error: error as Error });
            throw error;
        }
    }

    async findById(id: string, transactionId?: string): Promise<ClipShoutoutWidget | null> {
        try {
        return prisma.clipShoutout.findUnique({
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
            logger.setContext("repository.clipShoutout.findById", transactionId).error({ message: "findById failed", error: error as Error });
            throw error;
        }
    }

    async getByOwnerId(ownerId: string, transactionId?: string): Promise<ClipShoutoutWidget | null> {
        try {
        const widget = await prisma.widget.findUniqueOrThrow({
            where: {
                owner_id_widget_type_slug: {
                    owner_id: ownerId,
                    widget_type_slug: WidgetTypeSlug.CLIP_SHOUTOUT
                }
            }
        });
        return prisma.clipShoutout.findUnique({
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
            logger.setContext("repository.clipShoutout.getByOwnerId", transactionId).error({ message: "getByOwnerId failed", error: error as Error });
            throw error;
        }
    }

    async getByTwitchId(twitchId: string, transactionId?: string): Promise<ClipShoutoutWidget | null> {
        try {
        const widget = await prisma.widget.findUniqueOrThrow({
            where: {
                twitch_id_widget_type_slug: {
                    twitch_id: twitchId,
                    widget_type_slug: WidgetTypeSlug.CLIP_SHOUTOUT
                }
            }
        });
        return prisma.clipShoutout.findUnique({
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
            logger.setContext("repository.clipShoutout.getByTwitchId", transactionId).error({ message: "getByTwitchId failed", error: error as Error });
            throw error;
        }
    }
}