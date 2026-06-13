import { prisma } from "@/libs/prisma";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { CreateSpotifySongRequest, UpdateSpotifySongRequest } from "./request";
import { SpotifySongRequestWidget } from "./response";

export default class SpotifySongRequestRepository {
    constructor() {}

    async create(request: CreateSpotifySongRequest): Promise<SpotifySongRequestWidget> {
        return prisma.spotifySongRequest.create({
            data: {
                twitch_reward_id: request.twitchRewardId,
                twitch_bot_id: request.twitchBotId,
                invalid_message: request.invalidMessage,
                success_message: request.successMessage,
                widget: {
                    create: {
                        twitch_id: request.twitch_id,
                        owner_id: request.owner_id,
                        overlay_key: request.overlay_key,
                        widget_type_slug: WidgetTypeSlug.SPOTIFY_SONG_REQUEST,
                    },
                },
            },
            include: {
                widget: {
                    include: {
                        widget_type: true,
                    },
                },
            },
        });
    }

    async update(id: string, request: UpdateSpotifySongRequest): Promise<SpotifySongRequestWidget> {
        return prisma.spotifySongRequest.update({
            where: { id },
            data: request,
            include: {
                widget: {
                    include: {
                        widget_type: true,
                    },
                },
            },
        });
    }

    async get(id: string): Promise<SpotifySongRequestWidget | null> {
        return prisma.spotifySongRequest.findUnique({
            where: { id },
            include: {
                widget: {
                    include: {
                        widget_type: true,
                    },
                },
            },
        });
    }

    async getByOwnerId(ownerId: string): Promise<SpotifySongRequestWidget | null> {
        const widget = await prisma.widget.findUniqueOrThrow({
            where: {
                owner_id_widget_type_slug: {
                    owner_id: ownerId,
                    widget_type_slug: WidgetTypeSlug.SPOTIFY_SONG_REQUEST,
                },
            },
        });
        return prisma.spotifySongRequest.findUnique({
            where: { widget_id: widget.id },
            include: {
                widget: {
                    include: {
                        widget_type: true,
                    },
                },
            },
        });
    }

    async getByTwitchId(twitchId: string): Promise<SpotifySongRequestWidget | null> {
        const widget = await prisma.widget.findUniqueOrThrow({
            where: {
                twitch_id_widget_type_slug: {
                    twitch_id: twitchId,
                    widget_type_slug: WidgetTypeSlug.SPOTIFY_SONG_REQUEST,
                },
            },
        });
        return prisma.spotifySongRequest.findUnique({
            where: { widget_id: widget.id },
            include: {
                widget: {
                    include: {
                        widget_type: true,
                    },
                },
            },
        });
    }

    async delete(id: string): Promise<void> {
        await prisma.spotifySongRequest.delete({ where: { id } });
    }
}
