import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { CreateDropImage, UpdateDropImage } from "./request";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { DropImageWidget } from "./response";

const logger = new TLogger(Layer.REPOSITORY);

export default class DropImageRepository {

    constructor() {
    }

    async create(request: CreateDropImage, transactionId?: string): Promise<DropImageWidget> {
        try {
        return prisma.dropImage.create({
            data: {
                twitch_reward_id: request.twitch_reward_id,
                twitch_bot_id: request.twitch_bot_id,
                invalid_message: request.invalid_message,
                not_image_message: request.not_image_message,
                contain_mature_message: request.contain_mature_message,
                enabled_moderation: request.enabled_moderation,
                enabled: request.enabled,
                widget: {
                    create: {
                        twitch_id: request.twitch_id,
                        owner_id: request.owner_id,
                        overlay_key: request.overlay_key,
                        widget_type_slug: WidgetTypeSlug.DROP_IMAGE
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
            logger.setContext("repository.dropImage.create", transactionId).error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    async update(id: string, request: UpdateDropImage, transactionId?: string): Promise<DropImageWidget> {
        try {
        const { overlay_key, ...dropImageData } = request;

        const updateData: any = { ...dropImageData };
        if (overlay_key !== undefined) {
            updateData.widget = {
                update: {
                    overlay_key: overlay_key
                }
            };
        }

        return prisma.dropImage.update({
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
            logger.setContext("repository.dropImage.update", transactionId).error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async delete(id: string, transactionId?: string): Promise<void> {
        try {
        await prisma.dropImage.delete({
            where: { id },
        });
    } catch (error) {
            logger.setContext("repository.dropImage.delete", transactionId).error({ message: "delete failed", error: error as Error });
            throw error;
        }
    }

    async findById(id: string, transactionId?: string): Promise<DropImageWidget | null> {
        try {
        return prisma.dropImage.findUnique({
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
            logger.setContext("repository.dropImage.findById", transactionId).error({ message: "findById failed", error: error as Error });
            throw error;
        }
    }

    async getByOwnerId(ownerId: string, transactionId?: string): Promise<DropImageWidget | null> {
        try {
        const widget = await prisma.widget.findUniqueOrThrow({
            where: {
                owner_id_widget_type_slug: {
                    owner_id: ownerId,
                    widget_type_slug: WidgetTypeSlug.DROP_IMAGE
                }
            }
        });
        return prisma.dropImage.findUnique({
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
            logger.setContext("repository.dropImage.getByOwnerId", transactionId).error({ message: "getByOwnerId failed", error: error as Error });
            throw error;
        }
    }

    async getByTwitchId(twitchId: string, transactionId?: string): Promise<DropImageWidget | null> {
        try {
        const widget = await prisma.widget.findUniqueOrThrow({
            where: {
                twitch_id_widget_type_slug: {
                    twitch_id: twitchId,
                    widget_type_slug: WidgetTypeSlug.DROP_IMAGE
                }
            }
        });
        return prisma.dropImage.findUnique({
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
            logger.setContext("repository.dropImage.getByTwitchId", transactionId).error({ message: "getByTwitchId failed", error: error as Error });
            throw error;
        }
    }

    async getByTwitchRewardId(twitchRewardId: string, transactionId?: string): Promise<DropImageWidget | null> {
        try {
        return prisma.dropImage.findFirst({
            where: { twitch_reward_id: twitchRewardId },
            include: {
                widget: {
                    include: {
                        widget_type: true
                    }
                },
            }
        });
    } catch (error) {
            logger.setContext("repository.dropImage.getByTwitchRewardId", transactionId).error({ message: "getByTwitchRewardId failed", error: error as Error });
            throw error;
        }
    }
}
