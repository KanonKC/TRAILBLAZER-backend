import { prisma } from "@/libs/prisma";
import { CreateEndCredit, CreateEndCreditViewerRecord, UpdateEndCredit } from "./request";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { EndCreditWidget } from "./response";
import { EndCreditViewerRecord } from "generated/prisma/client";

export default class EndCreditRepository {

    constructor() {
    }

    async create(request: CreateEndCredit): Promise<EndCreditWidget> {
        return prisma.endCredit.create({
            data: {
                followers_header: request.followers_header,
                subscribes_header: request.subscribes_header,
                raids_header: request.raids_header,
                bits_header: request.bits_header,
                viewers_header: request.viewers_header,
                is_show_viewer_avatars: request.is_show_viewer_avatars,
                scroll_speed: request.scroll_speed,
                is_show_followers: request.is_show_followers,
                is_show_subs: request.is_show_subs,
                is_show_raids: request.is_show_raids,
                is_show_bits: request.is_show_bits,
                is_show_sub_months: request.is_show_sub_months,
                is_show_raid_count: request.is_show_raid_count,
                is_show_bits_amount: request.is_show_bits_amount,
                widget: {
                    create: {
                        twitch_id: request.twitch_id,
                        owner_id: request.owner_id,
                        overlay_key: request.overlay_key,
                        widget_type_slug: WidgetTypeSlug.END_CREDIT
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

    async getByOwnerId(ownerId: string): Promise<EndCreditWidget | null> {
        const widget = await prisma.widget.findUnique({
            where: {
                owner_id_widget_type_slug: {
                    owner_id: ownerId,
                    widget_type_slug: WidgetTypeSlug.END_CREDIT
                }
            }
        });
        if (!widget) {
            return null;
        }
        return prisma.endCredit.findUnique({
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

    async getByTwitchId(twitchId: string): Promise<EndCreditWidget | null> {
        const widget = await prisma.widget.findUnique({
            where: {
                twitch_id_widget_type_slug: {
                    twitch_id: twitchId,
                    widget_type_slug: WidgetTypeSlug.END_CREDIT
                }
            }
        });
        if (!widget) {
            return null;
        }
        return prisma.endCredit.findUnique({
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

    async createViewerRecord(request: CreateEndCreditViewerRecord): Promise<EndCreditViewerRecord> {
        return prisma.endCreditViewerRecord.create({
            data: {
                end_credit_id: request.end_credit_id,
                viewer_id: request.viewer_id,
                type: request.type,
                value: request.value,
                platform_created_at: request.platform_created_at,
            }
        });
    }

    async getById(id: string): Promise<EndCreditWidget | null> {
        return prisma.endCredit.findUnique({
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

    async update(id: string, request: UpdateEndCredit): Promise<EndCreditWidget> {
        const { overlay_key, ...endCreditData } = request;

        const updateData: any = { ...endCreditData };
        if (overlay_key !== undefined) {
            updateData.widget = {
                update: {
                    overlay_key: overlay_key
                }
            };
        }

        return prisma.endCredit.update({
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
        await prisma.endCredit.delete({
            where: { id },
        });
    }

    async getViewerRecordsByEndCreditId(endCreditId: string): Promise<EndCreditViewerRecord[]> {
        return prisma.endCreditViewerRecord.findMany({
            where: { end_credit_id: endCreditId },
            orderBy: { platform_created_at: "asc" },
        });
    }
}
