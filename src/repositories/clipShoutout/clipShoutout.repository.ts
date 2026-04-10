import { prisma } from "@/libs/prisma";
import { CreateClipShoutout, UpdateClipShoutout } from "./request";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { ClipShoutoutWidget } from "./response";

export default class ClipShoutoutRepository {

    constructor() {
    }

    async create(request: CreateClipShoutout): Promise<ClipShoutoutWidget> {
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
                widget: true,
            }
        });
    }

    async update(id: string, request: UpdateClipShoutout): Promise<ClipShoutoutWidget> {
        return prisma.clipShoutout.update({
            where: { id },
            data: request,
            include: {
                widget: true,
            }
        });
    }

    async delete(id: string): Promise<void> {
        await prisma.clipShoutout.delete({
            where: { id },
        });
    }

    async findById(id: string): Promise<ClipShoutoutWidget | null> {
        return prisma.clipShoutout.findUnique({
            where: { id },
            include: {
                widget: true,
            }
        });
    }

    async getByOwnerId(ownerId: string): Promise<ClipShoutoutWidget | null> {
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
                widget: true,
            }
        });
    }

    async getByTwitchId(twitchId: string): Promise<ClipShoutoutWidget | null> {
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
                widget: true,
            }
        });
    }
}