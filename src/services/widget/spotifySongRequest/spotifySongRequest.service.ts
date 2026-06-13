import TLogger, { Layer } from "@/logging/logger";
import Spotify from "@/providers/spotify";
import SpotifySongRequestRepository from "@/repositories/spotifySongRequest/spotifySongRequest.repository";
import { SpotifySongRequestWidget } from "@/repositories/spotifySongRequest/response";
import { UpdateSpotifySongRequest } from "@/repositories/spotifySongRequest/request";
import UserRepository from "@/repositories/user/user.repository";
import WidgetService from "@/services/widget/widget.service";
import { NotFoundError, BadRequestError } from "@/errors";
import { randomBytes } from "node:crypto";
import { TwitchChannelChatMessageEventRequest } from "@/events/twitch/channelChatMessage/request";
import { twitchAppAPI } from "@/libs/twurple";
import AuthService from "@/services/auth/auth.service";
import { HelixSendChatMessageAsAppParams } from "@twurple/api/lib/interfaces/endpoints/chat.input";
import { mapMessageVariables } from "@/utils/message";
import { Track } from "@spotify/web-api-ts-sdk";
import { InsertSpotifyTrackResponse } from "./response";

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

    async getByTwitchId(twitchId: string) {
        return this.spotifyRepository.getByTwitchId(twitchId);
    }

    async insertSpotifyTrack(userId: string, query: string): Promise<InsertSpotifyTrackResponse> {
        this.logger.setContext("service.spotifySongRequest.insertSpotifyTrack");
        this.logger.info({ message: "Inserting spotify track to queue", data: { userId, query } });
        try {
            const spotifyAPI = await this.spotify.createUserAPI(userId);

            let track: Track | null = null;

            if (query.startsWith("https://open.spotify.com/track")) {
                const id = query.split("/").pop()?.split("?")[0];
                if (!id) {
                    throw new Error("Invalid Spotify URL")
                } ;
                track = await spotifyAPI.tracks.get(id);
            } else {
                const search = await spotifyAPI.search(query, ["track"]);
                if (!search.tracks || search.tracks.items.length === 0) {
                    throw new Error("Track not found")
                }
                track = search.tracks.items[0];
            }

            if (!track) {
                throw new Error("Track not found");
            };

            await spotifyAPI.player.addItemToPlaybackQueue(track.uri);

            return { track };
        } catch (error) {
            this.logger.error({ message: "Failed to insert spotify track", error: error as Error, data: { userId, query } });
            throw error;
        }
    }

    async handleTwitchEvent(e: TwitchChannelChatMessageEventRequest) {
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

        const twitchUserAPI = await this.authService.createTwitchUserAPI(config.widget.owner_id)

        const sendChatMessageOptions: HelixSendChatMessageAsAppParams = {}
        if (e.message_id.startsWith("test-message-id")) {
            sendChatMessageOptions.replyParentMessageId = undefined;
        } else {
            sendChatMessageOptions.replyParentMessageId = e.message_id;
        }
        
        let message = config.success_message;
        let insertResponse: InsertSpotifyTrackResponse | null = null;
        try {
            insertResponse = await this.insertSpotifyTrack(config.widget.owner_id, e.message.text);
        } catch (err) {
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