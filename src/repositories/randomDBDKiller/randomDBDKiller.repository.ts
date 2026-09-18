import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { CreateRandomDBDKiller, UpdateRandomDBDKiller } from "./request";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { RandomDBDKillerWidget } from "./response";

const logger = new TLogger(Layer.REPOSITORY);

export default class RandomDBDKillerRepository {

    constructor() {
    }

    async create(transactionId: string, request: CreateRandomDBDKiller): Promise<RandomDBDKillerWidget> {
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
            logger.setContext("repository.randomDBDKiller.create", transactionId).error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    async update(transactionId: string, id: string, request: UpdateRandomDBDKiller): Promise<RandomDBDKillerWidget> {
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
            logger.setContext("repository.randomDBDKiller.update", transactionId).error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async delete(transactionId: string, id: string): Promise<void> {
        try {
        await prisma.randomDBDKiller.delete({
            where: { id },
        });
    } catch (error) {
            logger.setContext("repository.randomDBDKiller.delete", transactionId).error({ message: "delete failed", error: error as Error });
            throw error;
        }
    }

    async findById(transactionId: string, id: string): Promise<RandomDBDKillerWidget | null> {
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
            logger.setContext("repository.randomDBDKiller.findById", transactionId).error({ message: "findById failed", error: error as Error });
            throw error;
        }
    }

    async getByOwnerId(transactionId: string, ownerId: string): Promise<RandomDBDKillerWidget | null> {
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
            logger.setContext("repository.randomDBDKiller.getByOwnerId", transactionId).error({ message: "getByOwnerId failed", error: error as Error });
            throw error;
        }
    }

    async getByTwitchId(transactionId: string, twitchId: string): Promise<RandomDBDKillerWidget | null> {
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
            logger.setContext("repository.randomDBDKiller.getByTwitchId", transactionId).error({ message: "getByTwitchId failed", error: error as Error });
            throw error;
        }
    }

    async getByTwitchRewardId(transactionId: string, twitchRewardId: string): Promise<RandomDBDKillerWidget | null> {
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
            logger.setContext("repository.randomDBDKiller.getByTwitchRewardId", transactionId).error({ message: "getByTwitchRewardId failed", error: error as Error });
            throw error;
        }
    }
}
