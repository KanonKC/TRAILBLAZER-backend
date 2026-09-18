import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { CreateRandomDbdPerk, RandomDbdPerkClassType, UpdateRandomDbdPerk } from "./request";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { RandomDbdPerkWidget } from "./response";
import { RandomDbdPerkClass } from "generated/prisma/client";

const logger = new TLogger(Layer.REPOSITORY);

export default class RandomDbdPerkRepository {

    constructor() {
    }

    async create(request: CreateRandomDbdPerk, transactionId?: string): Promise<RandomDbdPerkWidget> {
        try {
        const classType = [RandomDbdPerkClassType.SURVIVOR, RandomDbdPerkClassType.KILLER]
        return prisma.randomDbdPerk.create({
            data: {
                widget: {
                    create: {
                        twitch_id: request.twitch_id,
                        owner_id: request.owner_id,
                        widget_type_slug: WidgetTypeSlug.RANDOM_DBD_PERK,
                    }
                },
                classes: {
                    createMany: {
                        data: classType.map((type) => ({
                            type,
                            enabled: false
                        }))
                    }
                }
            },
            include: {
                widget: {
                    include: {
                        widget_type: true
                    }
                },
                classes: {
                    orderBy: {
                        type: "desc"
                    }
                }
            }
        });
    } catch (error) {
            logger.setContext("repository.randomDbdPerk.create", transactionId).error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    async update(id: string, request: UpdateRandomDbdPerk, transactionId?: string): Promise<RandomDbdPerkWidget> {
        try {
        return prisma.randomDbdPerk.update({
            where: { id },
            data: {
                classes: request.classes ? {
                    update: request.classes.map(cls => ({
                        where: {
                            random_dbd_perk_id_type: {
                                random_dbd_perk_id: id,
                                type: cls.type
                            }
                        },
                        data: {
                            enabled: cls.enabled,
                            twitch_reward_id: cls.twitch_reward_id,
                            maximum_random_size: cls.maximum_random_size
                        }
                    }))
                } : undefined
            },
            include: {
                widget: {
                    include: {
                        widget_type: true
                    }
                },
                classes: {
                    orderBy: {
                        type: "desc"
                    }
                }
            }
        });
    } catch (error) {
            logger.setContext("repository.randomDbdPerk.update", transactionId).error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async delete(id: string, transactionId?: string): Promise<void> {
        try {
        await prisma.randomDbdPerk.delete({
            where: { id },
        });
    } catch (error) {
            logger.setContext("repository.randomDbdPerk.delete", transactionId).error({ message: "delete failed", error: error as Error });
            throw error;
        }
    }

    async findById(id: string, transactionId?: string): Promise<RandomDbdPerkWidget | null> {
        try {
        return prisma.randomDbdPerk.findUnique({
            where: { id },
            include: {
                widget: {
                    include: {
                        widget_type: true
                    }
                },
                classes: {
                    orderBy: {
                        type: "desc"
                    }
                }
            }
        });
    } catch (error) {
            logger.setContext("repository.randomDbdPerk.findById", transactionId).error({ message: "findById failed", error: error as Error });
            throw error;
        }
    }

    async getByOwnerId(ownerId: string, transactionId?: string): Promise<RandomDbdPerkWidget | null> {
        try {
            const widget = await prisma.widget.findUnique({
                where: {
                    owner_id_widget_type_slug: {
                        owner_id: ownerId,
                        widget_type_slug: WidgetTypeSlug.RANDOM_DBD_PERK
                    }
                }
            });

            if (!widget) return null;

            return prisma.randomDbdPerk.findUnique({
                where: { widget_id: widget.id },
                include: {
                    widget: {
                    include: {
                        widget_type: true
                    }
                },
                    classes: {
                        orderBy: {
                            type: "desc"
                        }
                    }
                }
            });
        } catch (error) {
            logger.setContext("repository.randomDbdPerk.getByOwnerId", transactionId).error({ message: "getByOwnerId failed", error: error as Error });
            return null;
        }
    }

    async getByTwitchId(twitchId: string, transactionId?: string): Promise<RandomDbdPerkWidget | null> {
        try {
            const widget = await prisma.widget.findUnique({
                where: {
                    twitch_id_widget_type_slug: {
                        twitch_id: twitchId,
                        widget_type_slug: WidgetTypeSlug.RANDOM_DBD_PERK
                    }
                }
            });

            if (!widget) return null;

            return prisma.randomDbdPerk.findUnique({
                where: { widget_id: widget.id },
                include: {
                    widget: {
                    include: {
                        widget_type: true
                    }
                },
                    classes: {
                        orderBy: {
                            type: "desc"
                        }
                    }
                },
            });
        } catch (error) {
            logger.setContext("repository.randomDbdPerk.getByTwitchId", transactionId).error({ message: "getByTwitchId failed", error: error as Error });
            return null;
        }
    }

    async getClassByRewardId(rewardId: string, transactionId?: string): Promise<RandomDbdPerkClass | null> {
        try {
        return prisma.randomDbdPerkClass.findUnique({
            where: {
                twitch_reward_id: rewardId
            }
        })
    } catch (error) {
            logger.setContext("repository.randomDbdPerk.getClassByRewardId", transactionId).error({ message: "getClassByRewardId failed", error: error as Error });
            throw error;
        }
    }
}
