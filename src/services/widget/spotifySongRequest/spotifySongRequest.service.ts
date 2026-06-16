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
import { NoActiveDeviceError } from "./error";

export interface CreateSpotifySongRequestServiceRequest {
    twitch_id: string;
    owner_id: string;
    twitchRewardId?: string;
    twitchBotId?: string;
    invalidMessage?: string;
    successMessage?: string;
    noActiveMessage?: string;
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
            invalidMessage: request.invalidMessage || "เกิดข้อผิดพลาดในการใส่เพลง ลองใหม่อีกครั้ง",
            successMessage: request.successMessage || "เพิ่มเพลง {{track_name}} - {{track_artist}} แล้ว",
            noActiveMessage: request.noActiveMessage || "ตอนนี้ยังไม่สามารถใส่เพลงได้ เนื่องจากยังไม่ได้เปิด Spotify",
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

    async test(userId: string): Promise<void> {
        this.logger.setContext("service.spotifySongRequest.test");
        this.logger.info({ message: "Running test insert", data: { userId } });
        const config = await this.getByUserId(userId);
        this.authorize(userId, config);
        if (!config.twitch_reward_id) {
            throw new Error("No reward configured");
        }
        const fakeEvent: TwitchChannelChatMessageEventRequest = {
            broadcaster_user_id: config.widget.twitch_id,
            broadcaster_user_login: "",
            broadcaster_user_name: "",
            chatter_user_id: config.widget.twitch_id,
            chatter_user_login: "",
            chatter_user_name: "",
            message_id: `test-message-id-${Date.now()}`,
            message: { text: "https://open.spotify.com/track/0CWAQlHsvfqcKJVVz9up2R", fragments: [] },
            color: "",
            badges: [],
            message_type: "text",
            cheer: null,
            reply: null,
            channel_points_custom_reward_id: config.twitch_reward_id,
            source_broadcaster_user_id: null,
            source_broadcaster_user_login: null,
            source_broadcaster_user_name: null,
            source_message_id: null,
            source_badges: null,
        };
        await this.handleTwitchEvent(fakeEvent);
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
                };
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

            try {
                await spotifyAPI.player.addItemToPlaybackQueue(track.uri);
            } catch (err) {
                // TODO: Find way to improve this!
                if (String(err).includes("Unexpected token") || String(err).includes("Unexpected non-whitespace")) {
                } else if (String(err).includes("NO_ACTIVE_DEVICE")) {
                    throw new NoActiveDeviceError()
                }
            }
            return {
                name: track.name,
                artists: track.artists.map(a => a.name),
                url: track.external_urls.spotify
            };
        } catch (error) {
            this.logger.error({ message: "Failed to insert spotify track", error: String(error), data: { userId, query } });
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
            insertResponse = await this.insertSpotifyTrack(config.widget.owner_id, e.message.text);
        } catch (err) {
            this.logger.error({ message: "Failed to insert track during event handling", error: err as Error });
            if (err instanceof NoActiveDeviceError) {
                message = config.no_active_message;
            } else {
                message = config.invalid_message;
            }
        }

        const replaceMap = {
            "{{track_name}}": insertResponse?.name,
            "{{track_artist}}": insertResponse?.artists.join(", "),
        }

        if (config.twitch_bot_id && message) {
            const formatMessage = mapMessageVariables(message, replaceMap)
            await twitchAppAPI.chat.sendChatMessageAsApp(
                config.twitch_bot_id,
                config.widget.twitch_id,
                formatMessage,
                sendChatMessageOptions
            )
        }
    }
}