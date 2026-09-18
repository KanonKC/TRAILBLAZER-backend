import Configurations from "@/config/index";
import { TwitchChannelChatMessageEventRequest } from "@/events/twitch/channelChatMessage/request";
import { TwitchStreamOnlineEventRequest } from "@/events/twitch/streamOnline/request";
import s3 from "@/libs/awsS3";
import redis, { TTL, publisher } from "@/libs/redis";
import { createESTransport, twitchAppAPI } from "@/libs/twurple";
import TLogger, { Layer } from "@/logging/logger";
import FirstWordRepository from "@/repositories/firstWord/firstWord.repository";
import { UpdateFirstWord, ListCustomerReplyRequest, CreateCustomReply, UpdateCustomReply } from "@/repositories/firstWord/request";
import { FirstWordWidget } from "@/repositories/firstWord/response";
import UserRepository from "@/repositories/user/user.repository";
import { mapMessageVariables } from "@/utils/message";
import { randomBytes } from "crypto";
import { FirstWord, FirstWordChatter, FirstWordCustomReply, User } from "generated/prisma/client";
import AuthService from "../../auth/auth.service";
import { CreateFirstWordRequest, ListCustomerReplyFilters, CreateCustomReplyRequest, UpdateCustomReplyRequest } from "./request";
import { ForbiddenError, NotFoundError, TError } from "@/errors";
import { ListResponse, Pagination } from "../../response";

import WidgetService from "../widget.service";

export default class FirstWordService {
    private readonly cfg: Configurations
    private readonly firstWordRepository: FirstWordRepository;
    private readonly userRepository: UserRepository;
    private readonly widgetService: WidgetService;
    private readonly logger = new TLogger(Layer.SERVICE);

    constructor(cfg: Configurations, firstWordRepository: FirstWordRepository, userRepository: UserRepository, widgetService: WidgetService) {
        this.cfg = cfg;
        this.firstWordRepository = firstWordRepository;
        this.userRepository = userRepository;
        this.widgetService = widgetService;
    }

    async create(request: CreateFirstWordRequest, transactionId?: string): Promise<FirstWordWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.firstWord.create", transactionId);
        const user = await this.userRepository.get(request.owner_id, transactionId);
        if (!user) {
            logger.warn({ message: "User not found", data: { request } });
            throw new NotFoundError("User not found");
        }

        const userSubs = await twitchAppAPI.eventSub.getSubscriptionsForUser(user.twitch_id);
        const enabledSubs = userSubs.data.filter(sub => sub.status === 'enabled')

        const userChatMessageSub = enabledSubs.filter(sub => sub.type === 'channel.chat.message')
        if (userChatMessageSub.length === 0) {
            const tsp = createESTransport("/webhook/v1/twitch/event-sub/channel-chat-message")
            await twitchAppAPI.eventSub.subscribeToChannelChatMessageEvents(user.twitch_id, tsp)
        }

        const streamOnlineSubs = enabledSubs.filter(sub => sub.type === 'stream.online')
        if (streamOnlineSubs.length === 0) {
            const tsp = createESTransport("/webhook/v1/twitch/event-sub/stream-online")
            await twitchAppAPI.eventSub.subscribeToStreamOnlineEvents(user.twitch_id, tsp)
        }

        const streamOfflineSubs = enabledSubs.filter(sub => sub.type === 'stream.offline')
        if (streamOfflineSubs.length === 0) {
            const tsp = createESTransport("/webhook/v1/twitch/event-sub/stream-offline")
            await twitchAppAPI.eventSub.subscribeToStreamOfflineEvents(user.twitch_id, tsp)
        }

        const res = await this.firstWordRepository.create({
            ...request,
            reply_message: "สวัสดี {{user_name}} ยินดีต้อนรับเข้าสู่สตรีม!",
            twitch_bot_id: user.twitch_id,
            overlay_key: randomBytes(16).toString("hex"),
        }, transactionId);

        await this.widgetService.setInitialEnabled(res.widget_id, user.id, transactionId)

        return this.getByUserId(user.id, transactionId)
    }

    async getByUserId(userId: string, transactionId?: string): Promise<FirstWordWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.firstWord.getByUserId", transactionId);
        logger.info({ message: "Getting first word config", data: { userId } });
        let config: FirstWordWidget | null = null
        const cacheKey = `first_word:owner_id:${userId}`
        const cached = await redis.get(cacheKey)
        if (cached) {
            config = JSON.parse(cached)
        }
        if (!config) {
            const res = await this.firstWordRepository.getByOwnerId(userId, transactionId)
            if (!res) {
                logger.error({ message: "First word config not found", data: { userId, res } });
                throw new NotFoundError("First word config not found")
            }
            config = res
        }
        await this.widgetService.authorizeOwnership(userId, config.widget.id, transactionId)
        redis.set(cacheKey, JSON.stringify(config), TTL.ONE_DAY)
        logger.info({ message: "Get first word config success", data: { userId, config } });
        return config
    }

    async update(userId: string, data: UpdateFirstWord, transactionId?: string): Promise<FirstWordWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.firstWord.update", transactionId);
        logger.info({ message: "Initializing update first word config", data: { userId, data } });
        const existing = await this.firstWordRepository.getByOwnerId(userId, transactionId)
        if (!existing) {
            logger.error({ message: "First word config not found", data: { userId } });
            throw new NotFoundError("First word config not found")
        }
        await this.widgetService.authorizeOwnership(userId, existing.widget.id, transactionId)
        try {
            const res = await this.firstWordRepository.update(existing.id, data, transactionId)
            await redis.del(`first_word:owner_id:${userId}`)
            logger.info({ message: "First word config updated", data: { userId, config: res } });
            return this.getByUserId(userId, transactionId)
        } catch (error) {
            logger.error({ message: "Failed to update first word config", error: error as Error });
            throw error
        }
    }

    async delete(userId: string, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.firstWord.delete", transactionId);
        const firstWord = await this.firstWordRepository.getByOwnerId(userId, transactionId);
        if (!firstWord) {
            return;
        }
        await this.widgetService.authorizeTierUsage(userId, firstWord.widget.id, undefined, transactionId)
        await this.widgetService.authorizeOwnership(userId, firstWord.widget.id, transactionId)
        if (firstWord.audio_key) {
            try {
                await s3.deleteFile(firstWord.audio_key);
                logger.info({ message: "Audio file deleted from s3", data: { audio_key: firstWord.audio_key } });
            } catch (error) {
                logger.error({ message: "Failed to delete audio file from s3", error: error as Error });
                // Continue deletion even if S3 fails
            }
        }

        await this.firstWordRepository.delete(firstWord.id, transactionId);
        logger.info({ message: "First word config deleted", data: { userId } });

        // Clear caches
        await redis.del(`first_word:owner_id:${userId}`);
        await redis.del(`first_word:chatters:channel_id:${userId}`); // Assuming channel_id same as owner twitch_id logic elsewhere or close enough to clear
    }

    async refreshOverlayKey(userId: string, transactionId?: string): Promise<FirstWord> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.firstWord.refreshOverlayKey", transactionId);
        const firstWord = await this.firstWordRepository.getByOwnerId(userId, transactionId);
        if (!firstWord) {
            logger.error({ message: "First word config not found", data: { userId } });
            throw new NotFoundError("First word config not found");
        }
        await this.widgetService.authorizeOwnership(userId, firstWord.widget.id, transactionId)

        const newKey = randomBytes(16).toString("hex");
        // TODO: Use widget repository
        const updated = await this.firstWordRepository.update(firstWord.id, { overlay_key: newKey }, transactionId);

        await redis.del(`first_word:owner_id:${userId}`);
        logger.info({ message: "First word config updated", data: { userId } });
        return updated;
    }

    async validateOverlayAccess(userId: string, key: string, transactionId?: string): Promise<boolean> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.firstWord.validateOverlayAccess", transactionId);
        // We can use cache here for performance since this hits frequently on connection
        const firstWordCacheKey = `first_word:owner_id:${userId}`
        let firstWord: FirstWordWidget | null = null

        const firstWordCache = await redis.get(firstWordCacheKey)
        if (firstWordCache) {
            firstWord = JSON.parse(firstWordCache)
        } else {
            firstWord = await this.firstWordRepository.getByOwnerId(userId, transactionId);
            if (firstWord) {
                redis.set(firstWordCacheKey, JSON.stringify(firstWord), TTL.TWO_HOURS)
            }
        }

        logger.debug({ message: "firstWord", data: firstWord });

        if (!firstWord) return false;
        await this.widgetService.authorizeOwnership(userId, firstWord.widget.id, transactionId)

        logger.debug({ message: "firstWord validate passed", data: { overlay_key: firstWord.widget.overlay_key, key } });
        // Use constant time comparison if possible, but for UUIDs/strings here standard checks are okay 
        // as long as we handle missing keys.
        return firstWord.widget.overlay_key === key;
    }

    async greetNewChatter(e: TwitchChannelChatMessageEventRequest, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.firstWord.greetNewChatter", transactionId);
        logger.info({ message: "Initiate greeting new chatter", data: { event: e } });
        let user: User | null = null
        const userCacheKey = `user:twitch_id:${e.broadcaster_user_id}`
        const userCache = await redis.get(userCacheKey)

        if (userCache) {
            user = JSON.parse(userCache)
        } else {
            user = await this.userRepository.getByTwitchId(e.broadcaster_user_id, transactionId);
            if (user) {
                redis.set(userCacheKey, JSON.stringify(user), TTL.TWO_HOURS)
            }
        }

        if (!user) {
            logger.error({ message: "User not found", data: { event: e } });
            throw new NotFoundError("User not found");
        }

        logger.info({ message: "Found user", data: { user } });

        const firstWordCacheKey = `first_word:owner_id:${user.id}`
        const firstWordCache = await redis.get(firstWordCacheKey)
        let firstWord: FirstWordWidget | null = null

        if (firstWordCache) {
            firstWord = JSON.parse(firstWordCache)
        } else {
            firstWord = await this.firstWordRepository.getByOwnerId(user.id, transactionId);
            if (firstWord) {
                redis.set(firstWordCacheKey, JSON.stringify(firstWord), TTL.TWO_HOURS)
            }
        }

        if (!firstWord) {
            logger.error({ message: "First word config not found", data: { user } });
            throw new NotFoundError("First word config not found");
        }

        logger.info({ message: "First word config found", data: { firstWord } });

        // Check if first word is enabled
        if (!firstWord.widget.enabled) {
            logger.info({ message: "First word is not enabled", data: { firstWord } });
            return
        }


        const senderId = firstWord.twitch_bot_id || this.cfg.twitch.defaultBotId

        // Check if user is bot itself
        if (e.chatter_user_id === senderId) {
            logger.info({ message: "User is bot itself", data: { firstWord } });
            return
        }

        let chattersIds: string[] = []
        const chattersCacheKey = `first_word:chatters:channel_id:${e.broadcaster_user_id}`
        const chattersCache = await redis.get(chattersCacheKey)

        if (chattersCache) {
            chattersIds = JSON.parse(chattersCache)
        } else {
            chattersIds = await this.firstWordRepository.listChatterIdByChannelId(e.broadcaster_user_id, transactionId);
            redis.set(chattersCacheKey, JSON.stringify(chattersIds), TTL.TWO_HOURS)
        }

        logger.info({ message: "Found chatters", data: { chattersIds } });
        const chatter = chattersIds.find(chatterId => chatterId === e.chatter_user_id)

        // Check if user is already greeted and not a test user
        if (chatter && e.chatter_user_id !== "0") {
            logger.info({ message: "User is already greeted", data: { chatter } });
            return
        }

        if (e.chatter_user_id !== "0") {
            // Add chatter to database if not test user to prevent duplicate greetings
            logger.info({ message: "Adding chatter to database", data: { chatter: e.chatter_user_id } });
            try {
                await this.firstWordRepository.addChatter({
                    first_word_id: firstWord.id,
                    twitch_chatter_id: e.chatter_user_id,
                    twitch_channel_id: e.broadcaster_user_id,
                }, transactionId)
                chattersIds.push(e.chatter_user_id)
                redis.del(chattersCacheKey)
                redis.set(chattersCacheKey, JSON.stringify(chattersIds), TTL.TWO_HOURS)
            } catch (error) {
                logger.error({ message: "Failed to add chatter to database", error: error as Error });
                return
            }

            // Increase chatter greet count
            logger.info({ message: "Increasing chatter greet count", data: { chatter: e.chatter_user_id } });
            try {
                await this.firstWordRepository.createOrIncrementGreetCount(firstWord.id, e.chatter_user_id, e.broadcaster_user_id, transactionId)
            } catch (error) {
                logger.error({ message: "Failed to increase chatter greet count", error: error as Error });
                return
            }
        }

        logger.info({ message: "Found custom reply", data: { firstWord, chatterId: e.chatter_user_id } });
        const customReply = await this.firstWordRepository.getCustomReplyByTwitchId(firstWord.id, e.chatter_user_id, transactionId)

        logger.info({ message: "Custom reply result", data: { customReply, isFound: !!customReply } });

        let message = customReply?.reply_message || firstWord.reply_message

        // If replay message does not empty -> Send message to Twitch
        if (message) {
            const greetCount = await this.firstWordRepository.getGreetCount(e.chatter_user_id, e.broadcaster_user_id, transactionId)
            const replaceMap = {
                "{{user_name}}": e.chatter_user_name,
                "{{greet_count}}": (greetCount?.count || 0).toString()
            }
            message = mapMessageVariables(message, replaceMap)
            logger.debug({ message: "send chat message", data: { broadcaster_user_id: e.broadcaster_user_id, message } });
            logger.info({ message: "Sending chat message", data: { message } });
            await twitchAppAPI.chat.sendChatMessageAsApp(senderId, e.broadcaster_user_id, message)
        }

        // If audio key does not empty -> Send audio to overlay
        if (firstWord.audio_key) {
            logger.debug({ message: "audio_key", data: { audio_key: firstWord.audio_key } });
            const audioKey = customReply?.audio_key || firstWord.audio_key
            const audioVolume = customReply?.audio_volume ?? firstWord.audio_volume ?? 100
            const url = await s3.getSignedURL(audioKey, { expiresIn: 3600 });
            logger.debug({ message: "url", data: { url } });
            logger.info({ message: "Sending audio to overlay", data: { url } });
            await publisher.publish("first-word-audio", JSON.stringify({
                userId: user.id,
                audioUrl: url,
                volume: audioVolume
            }))
            logger.debug({ message: "published" });
        }

        await this.widgetService.increaseTriggeredCount(firstWord.widget.id, transactionId)
    }

    async resetChattersOnStartStream(e: TwitchStreamOnlineEventRequest, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.firstWord.resetChattersOnStartStream", transactionId);
        try {
            logger.info({ message: "Resetting chatters on start stream", data: { event: e } });
            await this.resetChatter(e.broadcaster_user_id, transactionId)
            logger.info({ message: "Reset chatters on start stream successfully", data: { event: e } });
        } catch (error) {
            logger.error({ message: "Failed to reset chatters on start stream", error: error as Error });
        }
    }

    async resetChatter(twitchId: string, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.firstWord.resetChatters", transactionId);
        const user = await this.userRepository.getByTwitchId(twitchId, transactionId);
        if (!user) {
            logger.error({ message: "User not found", data: { twitchId } });
            throw new NotFoundError("User not found");
        }

        const firstWord = await this.firstWordRepository.getByOwnerId(user.id, transactionId);
        if (!firstWord) {
            logger.error({ message: "First word not found", data: { user } });
            throw new NotFoundError("First word not found");
        }

        await this.firstWordRepository.clearChatters(firstWord.id, transactionId)
        redis.del(`first_word:chatters:channel_id:${twitchId}`)
        redis.del(`first_word:chatters:${firstWord.id}`)
    }

    async clearCaches(transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.firstWord.clearCaches", transactionId);
        const keys = await redis.keys("first_word:*")
        for (const key of keys) {
            await redis.del(key)
        }
    }

    async listCustomReplies(userId: string, filters: ListCustomerReplyFilters, pagination: Pagination, transactionId?: string): Promise<ListResponse<FirstWordCustomReply>> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.firstWord.listCustomReplies", transactionId);
        logger.info({ message: "Get user first word", data: { userId } });
        const firstWord = await this.getByUserId(userId, transactionId);
        logger.info({ message: "Found user first word", data: { firstWord } });
        const req: ListCustomerReplyRequest = {
            search: filters.search,
            first_word_id: firstWord.id
        }
        logger.info({ message: "List custom replies", data: { req, pagination } });
        const [data, count] = await this.firstWordRepository.listCustomReplies(req, pagination, transactionId)
        logger.info({ message: "Found custom replies", data: { data, count } });
        return {
            data: data,
            pagination: {
                ...pagination,
                total: count
            }
        }
    }

    async createCustomReply(userId: string, request: CreateCustomReplyRequest, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.firstWord.createCustomReply", transactionId);
        logger.info({ message: "Get twitch user", data: { twitch_chatter_id: request.twitch_chatter_id } });
        const twitchUser = await twitchAppAPI.users.getUserById(request.twitch_chatter_id)
        logger.info({ message: "Found twitch user", data: { twitchUser } });
        if (!twitchUser) {
            logger.error({ message: "Twitch user not found", data: { twitch_chatter_id: request.twitch_chatter_id } });
            throw new NotFoundError("Twitch user not found");
        }

        logger.info({ message: "Get user first word", data: { userId } });
        const firstWord = await this.getByUserId(userId, transactionId);
        logger.info({ message: "Found user first word", data: { firstWord } });
        await this.widgetService.authorizeOwnership(userId, firstWord.widget.id, transactionId)

        const req: CreateCustomReply = {
            ...request,
            first_word_id: firstWord.id,
            twitch_chatter_username: twitchUser.displayName,
            twitch_chatter_avatar_url: twitchUser.profilePictureUrl
        };
        logger.info({ message: "Creating custom reply", data: { req } });
        await this.firstWordRepository.createCustomReply(req, transactionId);
        logger.info({ message: "Clearing caches" });
        await this.clearCaches(transactionId);
        logger.info({ message: "Custom reply created successfully" });
    }

    async updateCustomReply(userId: string, id: number, request: UpdateCustomReplyRequest, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.firstWord.updateCustomReply", transactionId);
        // Verify ownership indirectly: user owns first word, and we could check if this custom reply belongs to their first word.
        // For simplicity, we get the widget ID and could verify, though the repo might just update by id.
        logger.info({ message: "Get user first word", data: { userId } });
        const firstWord = await this.getByUserId(userId, transactionId);
        logger.info({ message: "Found user first word", data: { firstWord } });
        await this.widgetService.authorizeOwnership(userId, firstWord.widget.id, transactionId)

        const req: UpdateCustomReply = {
            ...request
        };

        if (request.twitch_chatter_id) {
            logger.info({ message: "Get twitch user", data: { twitch_chatter_id: request.twitch_chatter_id } });
            const twitchUser = await twitchAppAPI.users.getUserById(request.twitch_chatter_id)
            logger.info({ message: "Found twitch user", data: { twitchUser } });
            if (!twitchUser) {
                logger.error({ message: "Twitch user not found", data: { twitch_chatter_id: request.twitch_chatter_id } });
                throw new NotFoundError("Twitch user not found");
            }
            req.twitch_chatter_username = twitchUser.displayName;
            req.twitch_chatter_avatar_url = twitchUser.profilePictureUrl;
        }

        logger.info({ message: "Updating custom reply", data: { req } });
        await this.firstWordRepository.updateCustomReply(id, req, transactionId);
        logger.info({ message: "Clearing caches" });
        await this.clearCaches(transactionId);
        logger.info({ message: "Custom reply updated successfully" });
    }

    async deleteCustomReply(userId: string, id: number, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.firstWord.deleteCustomReply", transactionId);
        logger.info({ message: "Get user first word", data: { userId } });
        const firstWord = await this.getByUserId(userId, transactionId);
        logger.info({ message: "Found user first word", data: { firstWord } });
        await this.widgetService.authorizeOwnership(userId, firstWord.widget.id, transactionId)

        logger.info({ message: "Deleting custom reply", data: { id } });
        await this.firstWordRepository.deleteCustomReply(id, transactionId);
        logger.info({ message: "Clearing caches" });
        await this.clearCaches(transactionId);
        logger.info({ message: "Custom reply deleted successfully" });
    }

    async listChatters(userId: string, transactionId?: string): Promise<ListResponse<FirstWordChatter>> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.firstWord.listChatters", transactionId);
        logger.info({ message: "Get user first word", data: { userId } });
        const firstWord = await this.getByUserId(userId, transactionId);
        logger.info({ message: "Found user first word", data: { firstWord } });
        await this.widgetService.authorizeOwnership(userId, firstWord.widget.id, transactionId)

        const cacheKey = `first_word:chatters:${firstWord.id}`
        const cachedChatters = await redis.get(cacheKey)
        if (cachedChatters) {
            logger.info({ message: "Found cached chatters", data: { cacheKey } });
            return JSON.parse(cachedChatters)
        }

        logger.info({ message: "Listing chatters", data: { firstWord } });
        const [chatters, count] = await this.firstWordRepository.listChatters(firstWord.id, transactionId)
        logger.info({ message: "Found chatters", data: { chatters } });
        await redis.set(cacheKey, JSON.stringify({
            data: chatters,
            pagination: {
                page: 1,
                limit: count,
                total: count
            }
        }), TTL.ONE_DAY)
        logger.info({ message: "Cached chatters", data: { cacheKey } });
        return {
            data: chatters,
            pagination: {
                page: 1,
                limit: count,
                total: count
            }
        }
    }
}