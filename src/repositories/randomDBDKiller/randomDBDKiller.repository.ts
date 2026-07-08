import { prisma } from "@/libs/prisma";
import { CreateRandomDBDKiller, UpdateRandomDBDKiller } from "./request";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { RandomDBDKillerWidget } from "./response";

export default class RandomDBDKillerRepository {

    constructor() {
    }

    async create(request: CreateRandomDBDKiller): Promise<RandomDBDKillerWidget> {
        return prisma.randomDBDKiller.create({
            data: {
                twitch_reward_id: request.twitch_reward_id,
                widget: {
                    create: {
                        twitch_id: request.twitch_id,
                        owner_id: request.owner_id,
                        overlay_key: request.overlay_key,
                        widget_type_slug: WidgetTypeSlug.RANDOM_DBD_KILLER,
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

    async update(id: string, request: UpdateRandomDBDKiller): Promise<RandomDBDKillerWidget> {
        return prisma.randomDBDKiller.update({
            where: { id },
            data: {
                twitch_reward_id: request.twitch_reward_id,
                killer_pool: request.killer_pool,
                animation_style: request.animation_style
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

    async delete(id: string): Promise<void> {
        await prisma.randomDBDKiller.delete({
            where: { id },
        });
    }

    async findById(id: string): Promise<RandomDBDKillerWidget | null> {
        return prisma.randomDBDKiller.findUnique({
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

    async getByOwnerId(ownerId: string): Promise<RandomDBDKillerWidget | null> {
        const widget = await prisma.widget.findUnique({
            where: {
                owner_id_widget_type_slug: {
                    owner_id: ownerId,
                    widget_type_slug: WidgetTypeSlug.RANDOM_DBD_KILLER
                }
            }
        });

        if (!widget) return null;

        return prisma.randomDBDKiller.findUnique({
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

    async getByTwitchId(twitchId: string): Promise<RandomDBDKillerWidget | null> {
        const widget = await prisma.widget.findUnique({
            where: {
                twitch_id_widget_type_slug: {
                    twitch_id: twitchId,
                    widget_type_slug: WidgetTypeSlug.RANDOM_DBD_KILLER
                }
            }
        });

        if (!widget) return null;

        return prisma.randomDBDKiller.findUnique({
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

    async getByTwitchRewardId(twitchRewardId: string): Promise<RandomDBDKillerWidget | null> {
        return prisma.randomDBDKiller.findUnique({
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
