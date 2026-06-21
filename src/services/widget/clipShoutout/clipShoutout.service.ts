import ClipShoutoutRepository from "@/repositories/clipShoutout/clipShoutout.repository";
import { ClipShoutoutCreateRequest, ClipShoutoutUpdateRequest } from "./request";
import UserRepository from "@/repositories/user/user.repository";
import { randomBytes } from "crypto";
import { createESTransport, twitchAppAPI } from "@/libs/twurple";
import { TwitchChannelChatNotificationEventRequest } from "@/events/twitch/channelChatNotification/request";
import { HelixClip, HelixPaginatedClipFilter, HelixPaginatedResult } from "@twurple/api";
import { mapMessageVariables } from "@/utils/message";
import redis, { publisher, TTL } from "@/libs/redis";
import { ClipShoutout } from "generated/prisma/client";
import AuthService from "../../auth/auth.service";
import TwitchGql from "@/providers/twitchGql";
import TLogger, { Layer } from "@/logging/logger";
import { NotFoundError, ForbiddenError } from "@/errors";
import { ClipShoutoutWidget } from "@/repositories/clipShoutout/response";
import Configurations from "@/config/index";
import WidgetService from "../widget.service";

export default class ClipShoutoutService {
    private readonly cfg: Configurations
    private readonly clipShoutoutRepository: ClipShoutoutRepository;
    private readonly userRepository: UserRepository;
    private readonly authService: AuthService;
    private readonly twitchGql: TwitchGql;
    private readonly logger: TLogger;
    private readonly widgetService: WidgetService;

    constructor(cfg: Configurations, clipShoutoutRepository: ClipShoutoutRepository, userRepository: UserRepository, authService: AuthService, twitchGql: TwitchGql, widgetService: WidgetService) {
        this.cfg = cfg;
        this.clipShoutoutRepository = clipShoutoutRepository;
        this.userRepository = userRepository;
        this.authService = authService;
        this.twitchGql = twitchGql;
        this.widgetService = widgetService;
        this.logger = new TLogger(Layer.SERVICE);
    }

    async create(request: ClipShoutoutCreateRequest) {
        this.logger.setContext("service.clipShoutout.create");
        const user = await this.userRepository.get(request.owner_id);
        if (!user) {
            throw new NotFoundError("User not found");
        }

        const userSubs = await twitchAppAPI.eventSub.getSubscriptionsForUser(user.twitch_id);
        const enabledSubs = userSubs.data.filter(sub => sub.status === 'enabled')

        const userChatNotificationSub = enabledSubs.filter(sub => sub.type === 'channel.chat.notification')
        if (userChatNotificationSub.length === 0) {
            const tsp = createESTransport("/webhook/v1/twitch/event-sub/channel-chat-notification")
            await twitchAppAPI.eventSub.subscribeToChannelChatNotificationEvents(user.twitch_id, tsp)
        }

        const res = await this.clipShoutoutRepository.create({
            ...request,
            reply_message: "{{user_name}} พาคนมาทั้งหมด {{viewer_count}} คน!",
            twitch_bot_id: user.twitch_id,
            overlay_key: randomBytes(16).toString("hex")
        });
        await this.widgetService.setInitialEnabled(res.widget_id, user.id)
        return this.getByUserId(user.id)
    }

    async shoutoutRaider(event: TwitchChannelChatNotificationEventRequest) {
        this.logger.setContext("service.clipShoutout.shoutoutRaider");
        if (event.notice_type !== "raid" || !event.raid) {
            return
        }

        // Check if the raid has already been raided (Twitch sometimes sends duplicate events)
        const cooldownCacheKey = `clip_shoutout:shoutout_cooldown:${event.broadcaster_user_id}:${event.raid.user_id}`
        const cachedCooldown = await redis.get(cooldownCacheKey)
        if (cachedCooldown && event.chatter_user_id !== "0") {
            this.logger.info({ message: "Shoutout cooldown was not expired", data: { event } });
            return
        }
        await redis.set(cooldownCacheKey, "true", TTL.FIVE_MINUTES)

        let csConfig: ClipShoutoutWidget | null = null
        const cacheKey = `clip_shoutout:twitch_id:${event.broadcaster_user_id}`

        const cachedCsConfig = await redis.get(cacheKey)
        if (cachedCsConfig) {
            csConfig = JSON.parse(cachedCsConfig)
        } else {
            csConfig = await this.clipShoutoutRepository.getByTwitchId(event.broadcaster_user_id)
        }
        this.logger.info({ message: "csConfig", data: csConfig });
        if (!csConfig || !csConfig.widget.enabled) {
            return
        }

        await redis.set(cacheKey, JSON.stringify(csConfig), TTL.TWO_HOURS)

        if (csConfig.delay_ms > 0) {
            this.logger.debug({ message: "Delaying shoutout", data: { delay_ms: csConfig.delay_ms } });
            await new Promise(resolve => setTimeout(resolve, csConfig.delay_ms));
        }

        const senderId = csConfig.twitch_bot_id || this.cfg.twitch.defaultBotId
        this.logger.info({ message: "shouting out", data: { channel: csConfig.widget.twitch_id, raider: event.raid.user_id } });
        try {
            const twitchUserAPI = await this.authService.createTwitchUserAPI(senderId)
            await twitchUserAPI.chat.shoutoutUser(csConfig.widget.twitch_id, event.raid.user_id)
        } catch (err) {
            const e = err as Error & { code?: string; cause?: unknown }
            this.logger.error({
                message: "Shoutout failed",
                data: { name: e.name, code: e.code, cause: String(e.cause), nodeVersion: process.version },
                error: e
            });
        }

        if (csConfig.reply_message) {
            const replaceMap = {
                "{{user_name}}": event.raid.user_name,
                "{{viewer_count}}": event.raid.viewer_count,
                "{{channel_link}}": `https://twitch.tv/${event.raid.user_login}`,
            }
            const message = mapMessageVariables(csConfig.reply_message, replaceMap)
            this.logger.info({ message: "Sending reply", data: { twitch_bot_id: csConfig.twitch_bot_id, broadcaster_user_id: event.broadcaster_user_id, message } });
            try {
                await twitchAppAPI.chat.sendChatMessageAsApp(senderId, event.broadcaster_user_id, message)
            } catch (err) {
                const e = err as Error & { code?: string; cause?: unknown }
                this.logger.error({
                    message: "Send reply failed",
                    data: { name: e.name, code: e.code, cause: String(e.cause), nodeVersion: process.version },
                    error: e
                });
            }
        }

        if (csConfig.enabled_clip) {

            const filters: HelixPaginatedClipFilter = {
                isFeatured: csConfig.enabled_highlight_only
            }
            this.logger.info({ message: "Clip enabled. Fetching clips from Twitch.", data: { raid_id: event.raid.user_id, filters } });
            let clips: HelixPaginatedResult<HelixClip> | null = null

            try {
                clips = await twitchAppAPI.clips.getClipsForBroadcaster(event.raid.user_id, filters)
                if (clips.data.length === 0 && filters.isFeatured) {
                    clips = await twitchAppAPI.clips.getClipsForBroadcaster(event.raid.user_id)
                }
            } catch (err) {
                const e = err as Error & { code?: string; cause?: unknown }
                this.logger.error({
                    message: "Failed to get clip from Twitch",
                    data: { name: e.name, code: e.code, cause: String(e.cause), nodeVersion: process.version },
                    error: e
                })
            }

            if (clips && clips.data.length > 0) {
                this.logger.info({ message: "Got clips from Twitch", data: { total_clips: clips.data.length } });
                try {
                    const selectedClip = clips.data[Math.floor(Math.random() * clips.data.length)]
                    this.logger.info({ message: "Get video clip", data: { title: selectedClip.title, id: selectedClip.id } });
                    const clipProductionUrl = await this.twitchGql.getClipProductionUrl(selectedClip.id)
                    this.logger.debug({ message: "Clip production URL generated", data: { url: clipProductionUrl } });
                    this.logger.info({ message: "Sending clip", data: { clipProductionUrl, duration: selectedClip.duration, owner_id: csConfig.widget.owner_id } });
                    await publisher.publish("clip-shoutout-clip", JSON.stringify({
                        url: clipProductionUrl,
                        duration: selectedClip.duration,
                        userId: csConfig.widget.owner_id
                    }))
                } catch (err) {
                    this.logger.error({ message: "Publish clip shoutout failed", error: String(err) });
                }
            }
        }

    }

    async getByUserId(userId: string): Promise<ClipShoutoutWidget | null> {
        const res = await this.clipShoutoutRepository.getByOwnerId(userId)
        if (!res) {
            throw new NotFoundError("Clip shoutout config not found");
        }
        await this.widgetService.authorizeOwnership(userId, res.widget.id);
        return res
    }

    async update(id: string, userId: string, data: ClipShoutoutUpdateRequest): Promise<ClipShoutout> {
        this.logger.setContext("service.clipShoutout.update");
        const existing = await this.clipShoutoutRepository.findById(id);

        if (!existing) {
            throw new NotFoundError("Clip shoutout config not found");
        }

        await this.widgetService.authorizeOwnership(userId, existing.widget.id);

        const res = await this.clipShoutoutRepository.update(id, {
            ...data,
            twitch_bot_id: data.twitch_bot_id || this.cfg.twitch.defaultBotId
        });
        await redis.del(`clip_shoutout:twitch_id:${existing.widget.twitch_id}`)
        await redis.del(`clip_shoutout:owner_id:${userId}`)
        return res
    }

    async delete(userId: string): Promise<void> {
        this.logger.setContext("service.clipShoutout.delete");
        const existing = await this.clipShoutoutRepository.getByOwnerId(userId);
        if (!existing) {
            return;
        }

        await this.widgetService.authorizeTierUsage(userId, existing.widget.id);
        await this.widgetService.authorizeOwnership(userId, existing.widget.id);
        await this.clipShoutoutRepository.delete(existing.id);

        await redis.del(`clip_shoutout:twitch_id:${existing.widget.twitch_id}`);
        await redis.del(`clip_shoutout:owner_id:${userId}`);
    }

    // private authorize(userId: string, resource: ClipShoutoutWidget) {
    //     if (resource.widget.owner_id !== userId) {
    //         throw new ForbiddenError("You are not the owner of this widget");
    //     }
    // }

    async getOverlay(id: string) {
        const existing = await this.clipShoutoutRepository.findById(id);

        if (!existing) {
            throw new NotFoundError("Clip shoutout config not found");
        }

        return existing;
    }

    async refreshOverlayKey(userId: string): Promise<ClipShoutout> {
        this.logger.setContext("service.clipShoutout.refreshOverlayKey");
        const existing = await this.clipShoutoutRepository.getByOwnerId(userId);
        if (!existing) {
            throw new NotFoundError("Clip shoutout config not found");
        }

        const newKey = randomBytes(16).toString("hex");
        const updated = await this.clipShoutoutRepository.update(existing.id, { overlay_key: newKey });

        await redis.del(`clip_shoutout:twitch_id:${existing.widget.twitch_id}`);
        await redis.del(`clip_shoutout:owner_id:${userId}`);
        return updated;
    }

    async validateOverlayAccess(userId: string, key: string): Promise<boolean> {
        const cacheKey = `clip_shoutout:owner_id:${userId}`
        let config: ClipShoutoutWidget | null = null

        const cached = await redis.get(cacheKey)
        if (cached) {
            config = JSON.parse(cached)
        } else {
            config = await this.clipShoutoutRepository.getByOwnerId(userId);
            if (config) {
                redis.set(cacheKey, JSON.stringify(config), TTL.TWO_HOURS)
            }
        }
        this.logger.setContext("service.clipShoutout.validateOverlayAccess");
        this.logger.debug({ message: "Validating overlay access", data: { configFound: !!config } });

        if (!config) return false;
        return config.widget.overlay_key === key;
    }
}