import { prisma } from "@/libs/prisma";
import { CreateDropImage, UpdateDropImage } from "./request";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { DropImageWidget } from "./response";

export default class DropImageRepository {

    constructor() {
    }

    async create(request: CreateDropImage): Promise<DropImageWidget> {
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
    }

    async update(id: string, request: UpdateDropImage): Promise<DropImageWidget> {
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
    }

    async delete(id: string): Promise<void> {
        await prisma.dropImage.delete({
            where: { id },
        });
    }

    async findById(id: string): Promise<DropImageWidget | null> {
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
    }

    async getByOwnerId(ownerId: string): Promise<DropImageWidget | null> {
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
    }

    async getByTwitchId(twitchId: string): Promise<DropImageWidget | null> {
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
    }

    async getByTwitchRewardId(twitchRewardId: string): Promise<DropImageWidget | null> {
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
    }
}
