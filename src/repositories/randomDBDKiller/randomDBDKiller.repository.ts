import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { CreateRandomDBDKiller, UpdateRandomDBDKiller } from "./request";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { RandomDBDKillerWidget } from "./response";

const logger = new TLogger(Layer.REPOSITORY);

export default class RandomDBDKillerRepository {

    constructor() {
    }

    async create(request: CreateRandomDBDKiller): Promise<RandomDBDKillerWidget> {
        try {
        return prisma.randomDBDKiller.create({
            data: {
                twitch_reward_id: request.twitch_reward_id,
                animation_style: "frame",
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
    } catch (error) {
            logger.setContext("repository.randomDBDKiller.create").error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    async update(id: string, request: UpdateRandomDBDKiller): Promise<RandomDBDKillerWidget> {
        try {
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
    } catch (error) {
            logger.setContext("repository.randomDBDKiller.update").error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async delete(id: string): Promise<void> {
        try {
        await prisma.randomDBDKiller.delete({
            where: { id },
        });
    } catch (error) {
            logger.setContext("repository.randomDBDKiller.delete").error({ message: "delete failed", error: error as Error });
            throw error;
        }
    }

    async findById(id: string): Promise<RandomDBDKillerWidget | null> {
        try {
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
    } catch (error) {
            logger.setContext("repository.randomDBDKiller.findById").error({ message: "findById failed", error: error as Error });
            throw error;
        }
    }

    async getByOwnerId(ownerId: string): Promise<RandomDBDKillerWidget | null> {
        try {
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
    } catch (error) {
            logger.setContext("repository.randomDBDKiller.getByOwnerId").error({ message: "getByOwnerId failed", error: error as Error });
            throw error;
        }
    }

    async getByTwitchId(twitchId: string): Promise<RandomDBDKillerWidget | null> {
        try {
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
    } catch (error) {
            logger.setContext("repository.randomDBDKiller.getByTwitchId").error({ message: "getByTwitchId failed", error: error as Error });
            throw error;
        }
    }

    async getByTwitchRewardId(twitchRewardId: string): Promise<RandomDBDKillerWidget | null> {
        try {
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
    } catch (error) {
            logger.setContext("repository.randomDBDKiller.getByTwitchRewardId").error({ message: "getByTwitchRewardId failed", error: error as Error });
            throw error;
        }
    }
}
