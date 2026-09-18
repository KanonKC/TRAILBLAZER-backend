import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { CreateSpotifySongRequest, UpdateSpotifySongRequest } from "./request";
import { SpotifySongRequestWidget } from "./response";

const logger = new TLogger(Layer.REPOSITORY);

export default class SpotifySongRequestRepository {
    constructor() {}

    async create(transactionId: string, request: CreateSpotifySongRequest): Promise<SpotifySongRequestWidget> {
        try {
        return prisma.spotifySongRequest.create({
            data: {
                twitch_reward_id: request.twitchRewardId,
                twitch_bot_id: request.twitchBotId,
                invalid_message: request.invalidMessage,
                success_message: request.successMessage,
                no_active_message: request.noActiveMessage,
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
    } catch (error) {
            logger.setContext("repository.spotifySongRequest.create", transactionId).error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    async update(transactionId: string, id: string, request: UpdateSpotifySongRequest): Promise<SpotifySongRequestWidget> {
        try {
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
    } catch (error) {
            logger.setContext("repository.spotifySongRequest.update", transactionId).error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async get(transactionId: string, id: string): Promise<SpotifySongRequestWidget | null> {
        try {
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
    } catch (error) {
            logger.setContext("repository.spotifySongRequest.get", transactionId).error({ message: "get failed", error: error as Error });
            throw error;
        }
    }

    async getByOwnerId(transactionId: string, ownerId: string): Promise<SpotifySongRequestWidget | null> {
        try {
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
    } catch (error) {
            logger.setContext("repository.spotifySongRequest.getByOwnerId", transactionId).error({ message: "getByOwnerId failed", error: error as Error });
            throw error;
        }
    }

    async getByTwitchId(transactionId: string, twitchId: string): Promise<SpotifySongRequestWidget | null> {
        try {
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
    } catch (error) {
            logger.setContext("repository.spotifySongRequest.getByTwitchId", transactionId).error({ message: "getByTwitchId failed", error: error as Error });
            throw error;
        }
    }

    async delete(transactionId: string, id: string): Promise<void> {
        try {
        await prisma.spotifySongRequest.delete({ where: { id } });
    } catch (error) {
            logger.setContext("repository.spotifySongRequest.delete", transactionId).error({ message: "delete failed", error: error as Error });
            throw error;
        }
    }
}
