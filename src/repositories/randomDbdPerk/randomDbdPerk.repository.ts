import { prisma } from "@/libs/prisma";
import { CreateRandomDbdPerk, RandomDbdPerkClassType, UpdateRandomDbdPerk } from "./request";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { RandomDbdPerkWidget } from "./response";
import { RandomDbdPerkClass } from "generated/prisma/client";

export default class RandomDbdPerkRepository {

    constructor() {
    }

    async create(request: CreateRandomDbdPerk): Promise<RandomDbdPerkWidget> {
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
    }

    async update(id: string, request: UpdateRandomDbdPerk): Promise<RandomDbdPerkWidget> {
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
    }

    async delete(id: string): Promise<void> {
        await prisma.randomDbdPerk.delete({
            where: { id },
        });
    }

    async findById(id: string): Promise<RandomDbdPerkWidget | null> {
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
    }

    async getByOwnerId(ownerId: string): Promise<RandomDbdPerkWidget | null> {
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
            return null;
        }
    }

    async getByTwitchId(twitchId: string): Promise<RandomDbdPerkWidget | null> {
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
            return null;
        }
    }

    async getClassByRewardId(rewardId: string): Promise<RandomDbdPerkClass | null> {
        return prisma.randomDbdPerkClass.findUnique({
            where: {
                twitch_reward_id: rewardId
            }
        })
    }
}
