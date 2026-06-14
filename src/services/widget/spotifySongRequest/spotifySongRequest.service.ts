import TLogger, { Layer } from "@/logging/logger";
import Spotify from "@/providers/spotify";
import SpotifySongRequestRepository from "@/repositories/spotifySongRequest/spotifySongRequest.repository";
import { SpotifySongRequestWidget } from "@/repositories/spotifySongRequest/response";
import { UpdateSpotifySongRequest } from "@/repositories/spotifySongRequest/request";
import UserRepository from "@/repositories/user/user.repository";
import WidgetService from "@/services/widget/widget.service";
import { ForbiddenError, NotFoundError } from "@/errors";
import { randomBytes } from "node:crypto";
import { TwitchChannelChatMessageEventRequest } from "@/events/twitch/channelChatMessage/request";
import { createESTransport, twitchAppAPI } from "@/libs/twurple";
import AuthService from "@/services/auth/auth.service";
import { HelixSendChatMessageAsAppParams } from "@twurple/api/lib/interfaces/endpoints/chat.input";
import { mapMessageVariables } from "@/utils/message";
import { Track } from "@spotify/web-api-ts-sdk";
import { InsertSpotifyTrackResponse } from "./response";

export interface CreateSpotifySongRequestServiceRequest {
    twitch_id: string;
    owner_id: string;
    twitchRewardId?: string;
    twitchBotId?: string;
    invalidMessage?: string;
    successMessage?: string;
}

export default class SpotifySongRequestService {

    private readonly logger: TLogger;
    private readonly spotify: Spotify;
    private readonly spotifyRepository: SpotifySongRequestRepository;
    private readonly userRepository: UserRepository;
    private readonly widgetService: WidgetService;
    private readonly authService: AuthService;

    constructor(
        spotifyRepository: SpotifySongRequestRepository,
        userRepository: UserRepository,
        spotify: Spotify,
        widgetService: WidgetService,
        authService: AuthService,
    ) {
        this.logger = new TLogger(Layer.SERVICE);
        this.spotifyRepository = spotifyRepository;
        this.userRepository = userRepository;
        this.spotify = spotify;
        this.widgetService = widgetService;
        this.authService = authService;
    }

    async create(request: CreateSpotifySongRequestServiceRequest): Promise<SpotifySongRequestWidget> {
        this.logger.setContext("service.spotifySongRequest.create");
        this.logger.info({ message: "Creating spotify song request config", data: { request } });

        const user = await this.userRepository.get(request.owner_id);
        if (!user) {
            this.logger.warn({ message: "User not found", data: { request } });
            throw new NotFoundError("User not found");
        }

        const userSubs = await twitchAppAPI.eventSub.getSubscriptionsForUser(user.twitch_id);
        const enabledSubs = userSubs.data.filter(sub => sub.status === "enabled");
        const hasChatMessageSub = enabledSubs.some(sub => sub.type === "channel.chat.message");
        if (!hasChatMessageSub) {
            const tsp = createESTransport("/webhook/v1/twitch/event-sub/channel-chat-message");
            await twitchAppAPI.eventSub.subscribeToChannelChatMessageEvents(user.twitch_id, tsp);
        }

        const res = await this.spotifyRepository.create({
            twitch_id: request.twitch_id,
            owner_id: request.owner_id,
            overlay_key: randomBytes(16).toString("hex"),
            twitchRewardId: request.twitchRewardId,
            twitchBotId: request.twitchBotId,
            invalidMessage: request.invalidMessage,
            successMessage: request.successMessage,
        });

        await this.widgetService.setInitialEnabled(res.widget_id, user.id);
        this.logger.info({ message: "Spotify song request config created", data: { userId: user.id } });
        return res;
    }

    async getByUserId(userId: string): Promise<SpotifySongRequestWidget> {
        this.logger.setContext("service.spotifySongRequest.getByUserId");
        this.logger.info({ message: "Getting spotify song request config", data: { userId } });
        const config = await this.spotifyRepository.getByOwnerId(userId);
        if (!config) {
            this.logger.error({ message: "Spotify song request config not found", data: { userId } });
            throw new NotFoundError("Spotify song request config not found");
        }
        this.logger.info({ message: "Got spotify song request config", data: { userId, config } });
        return config;
    }

    async update(userId: string, data: UpdateSpotifySongRequest): Promise<SpotifySongRequestWidget> {
        this.logger.setContext("service.spotifySongRequest.update");
        this.logger.info({ message: "Updating spotify song request config", data: { userId, data } });
        const existing = await this.getByUserId(userId);
        this.authorize(userId, existing);
        const updated = await this.spotifyRepository.update(existing.id, data);
        this.logger.info({ message: "Spotify song request config updated", data: { userId } });
        return updated;
    }

    async delete(userId: string): Promise<void> {
        this.logger.setContext("service.spotifySongRequest.delete");
        this.logger.info({ message: "Deleting spotify song request config", data: { userId } });
        const existing = await this.spotifyRepository.getByOwnerId(userId);
        if (!existing) {
            return;
        }
        this.authorize(userId, existing);
        await this.spotifyRepository.delete(existing.id);
        this.logger.info({ message: "Spotify song request config deleted", data: { userId } });
    }

    private authorize(userId: string, config: SpotifySongRequestWidget): void {
        if (config.widget.owner_id !== userId) {
            throw new ForbiddenError("You do not own this resource");
        }
    }

    async getByTwitchId(twitchId: string) {
        return this.spotifyRepository.getByTwitchId(twitchId);
    }

    async insertSpotifyTrack(userId: string, query: string): Promise<InsertSpotifyTrackResponse> {
        this.logger.setContext("service.spotifySongRequest.insertSpotifyTrack");
        this.logger.info({ message: "Inserting spotify track to queue", data: { userId, query } });
        try {
            const spotifyAPI = await this.spotify.createUserAPI(userId);

            console.log("Pass authen")

            let track: Track | null = null;

            console.log("Pass authen1")
            if (query.startsWith("https://open.spotify.com/track")) {
                const id = query.split("/").pop()?.split("?")[0];
                if (!id) {
                    throw new Error("Invalid Spotify URL")
                };
                console.log("Pass authen 2", id, spotifyAPI)
                track = await spotifyAPI.tracks.get(id);
            } else {
                const search = await spotifyAPI.search(query, ["track"]);
                if (!search.tracks || search.tracks.items.length === 0) {
                    throw new Error("Track not found")
                }
                console.log("Pass authen 3", search)
                track = search.tracks.items[0];
            }

            if (!track) {
                throw new Error("Track not found");
            };

            console.log("Add URI", track)
            await spotifyAPI.player.addItemToPlaybackQueue(track.uri);

            return { track };
        } catch (error) {
            console.log("Failed insert layer", error)
            this.logger.error({ message: "Failed to insert spotify track", error: String(error), data: { userId, query } });
            throw error;
        }
    }

    async handleTwitchEvent(e: TwitchChannelChatMessageEventRequest) {
        console.log("Handle Twitch Spotify Event")
        if (!e.channel_points_custom_reward_id) {
            return;
        }

        const config = await this.getByTwitchId(e.broadcaster_user_id);
        if (!config) {
            this.logger.warn({ message: "Widget not found", data: { twitchId: e.broadcaster_user_id } });
            return;
        }

        if (!config.widget.enabled) {
            this.logger.warn({ message: "Widget is disabled", data: { twitchId: e.broadcaster_user_id } });
            return;
        }

        if (config.twitch_reward_id !== e.channel_points_custom_reward_id) {
            this.logger.warn({ message: "Reward ID does not match", data: { twitchId: e.broadcaster_user_id, rewardId: e.channel_points_custom_reward_id } });
            return;
        }

        console.log("Handle Twitch Spotify Event 2")
        const twitchUserAPI = await this.authService.createTwitchUserAPI(config.widget.twitch_id)

        const sendChatMessageOptions: HelixSendChatMessageAsAppParams = {}
        if (e.message_id.startsWith("test-message-id")) {
            sendChatMessageOptions.replyParentMessageId = undefined;
        } else {
            sendChatMessageOptions.replyParentMessageId = e.message_id;
        }

        let message = config.success_message;
        let insertResponse: InsertSpotifyTrackResponse | null = null;
        try {
            console.log("--- Start ---")
            insertResponse = await this.insertSpotifyTrack(config.widget.owner_id, e.message.text);
        } catch (err) {
            // console.log("FAILED", err)
            message = config.invalid_message;
        }

        if (!insertResponse) {
            return
        }

        const replaceMap = {
            "{{track_name}}": insertResponse.track.name,
            "{{track_artist}}": insertResponse.track.artists.map((artist) => artist.name).join(", "),
        }

        if (config.twitch_bot_id && message) {
            const formatMessage = mapMessageVariables(message, replaceMap)
            twitchUserAPI.chat.sendChatMessageAsApp(
                config.twitch_bot_id,
                config.widget.twitch_id,
                formatMessage,
                sendChatMessageOptions
            )
        }
    }
}