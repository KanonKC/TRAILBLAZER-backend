import DropImageRepository from "@/repositories/dropImage/dropImage.repository";
import TLogger, { Layer } from "@/logging/logger";
import { CreateDropImageServiceRequest, UpdateDropImageServiceRequest } from "./request";
import UserRepository from "@/repositories/user/user.repository";
import { NotFoundError, BadRequestError } from "@/errors";
import WidgetService from "../widget.service";
import { randomBytes, randomUUID } from "node:crypto";
import { DropImageWidget } from "@/repositories/dropImage/response";
import { TwitchChannelRedemptionAddEventRequest } from "@/events/twitch/channelRedemptionAdd/request";
import redis, { publisher } from "@/libs/redis";
import { createESTransport, twitchAppAPI } from "@/libs/twurple";
import axios from "axios";
import Sightengine from "@/providers/sightengine";
import { TwitchChannelChatMessageEventRequest } from "@/events/twitch/channelChatMessage/request";
import { HelixSendChatMessageAsAppParams } from "@twurple/api/lib/interfaces/endpoints/chat.input";

export default class DropImageService {
    private readonly logger: TLogger;

    constructor(
        private readonly dropImageRepository: DropImageRepository,
        private readonly userRepository: UserRepository,
        private readonly sightengine: Sightengine,
        private readonly widgetService: WidgetService
    ) {
        this.logger = new TLogger(Layer.SERVICE);
    }

    async getByUserId(transactionId: string, userId: string): Promise<DropImageWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.dropImage.getByUserId", transactionId);
        logger.info({ message: "Fetching drop image config for user", data: { userId } });
        try {
            const res = await this.dropImageRepository.getByOwnerId(transactionId, userId);
            if (!res) {
                throw new NotFoundError("Drop Image config not found");
            }
            await this.widgetService.authorizeOwnership(transactionId, userId, res.widget.id);
            return res;
        } catch (error) {
            logger.error({ message: "Failed to get drop image widget", error: error as Error, data: { userId } });
            throw error;
        }
    }

    async create(transactionId: string, request: CreateDropImageServiceRequest): Promise<DropImageWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.dropImage.create", transactionId);
        logger.info({ message: "Creating drop image config", data: request });
        try {
            const user = await this.userRepository.get(transactionId, request.userId);
            if (!user) {
                logger.warn({ message: "User not found for setup", data: request });
                throw new NotFoundError("User not found");
            }

            const existing = await this.dropImageRepository.getByOwnerId(transactionId, user.id).catch(() => null);
            if (existing) {
                logger.warn({ message: "Drop image config already exists", data: request });
                throw new BadRequestError("Drop image config already exists");
            }

            await this.subscribeToRedemptionEvents(transactionId, user.twitch_id, user.id);

            const res = await this.dropImageRepository.create(transactionId, {
                twitch_id: user.twitch_id,
                owner_id: user.id,
                twitch_bot_id: user.twitch_id,
                overlay_key: randomBytes(16).toString("hex"),
                invalid_message: "ข้อความที่ส่งมาไม่ใช่ URL",
                not_image_message: "ลิงก์ที่ส่งมาไม่ใช่ลิงก์ของรูปภาพ",
                contain_mature_message: "ลิงก์ที่ส่งมามีเนื้อหาที่ไม่เหมาะสม"
            });
            await this.widgetService.setInitialEnabled(transactionId, res.widget_id, user.id)
            return this.getByUserId(transactionId, user.id)
        } catch (error) {
            logger.error({ message: "Failed to create drop image widget", error: error as Error, data: request });
            throw error;
        }
    }

    async update(transactionId: string, id: string, userId: string, request: UpdateDropImageServiceRequest): Promise<DropImageWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.dropImage.update", transactionId);
        logger.info({ message: "Updating drop image config", data: { id, userId, request } });
        try {
            const dropImage = await this.dropImageRepository.findById(transactionId, id);
            if (!dropImage) {
                logger.warn({ message: "DropImage widget not found", data: { id, userId } });
                throw new NotFoundError("Drop Image config not found");
            }

            await this.widgetService.authorizeOwnership(transactionId, userId, dropImage.widget.id);

            await this.subscribeToRedemptionEvents(transactionId, dropImage.widget.twitch_id, userId);

            return await this.dropImageRepository.update(transactionId, id, request);
        } catch (error) {
            logger.error({ message: "Failed to update drop image widget", error: error as Error, data: request });
            throw error;
        }
    }

    async delete(transactionId: string, userId: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.dropImage.delete", transactionId);
        logger.info({ message: "Deleting drop image config", data: { userId } });
        try {
            const dropImage = await this.dropImageRepository.getByOwnerId(transactionId, userId).catch(() => null);
            if (!dropImage) {
                logger.info({ message: "Drop image config not found, skip delete", data: { userId } });
                return;
            }

            await this.widgetService.authorizeOwnership(transactionId, userId, dropImage.widget.id);

            await this.dropImageRepository.delete(transactionId, dropImage.id);
        } catch (error) {
            logger.error({ message: "Failed to delete drop image widget", error: error as Error, data: { userId } });
            throw error;
        }
    }

    async refreshOverlayKey(transactionId: string, userId: string): Promise<DropImageWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.dropImage.refreshOverlayKey", transactionId);
        logger.info({ message: "Refreshing drop image overlay key", data: { userId } });
        try {
            const dropImage = await this.dropImageRepository.getByOwnerId(transactionId, userId);
            if (!dropImage) {
                logger.warn({ message: "DropImage widget not found", data: { userId } });
                throw new NotFoundError("Drop Image config not found");
            }

            return await this.dropImageRepository.update(transactionId, dropImage.id, {
                overlay_key: randomUUID()
            });
        } catch (error) {
            logger.error({ message: "Failed to refresh drop image overlay key", error: error as Error, data: { userId } });
            throw error;
        }
    }

    private async subscribeToRedemptionEvents(transactionId: string, twitchId: string, userId: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.dropImage.subscribeToRedemptionEvents", transactionId);
        try {
            const userSubs = await twitchAppAPI.eventSub.getSubscriptionsForUser(twitchId);
            const enabledSubs = userSubs.data.filter(sub => sub.status === 'enabled');

            const channelRewardRedemptionSub = enabledSubs.filter(sub => sub.type === 'channel.channel_points_custom_reward_redemption.add');
            if (channelRewardRedemptionSub.length === 0) {
                const tsp = createESTransport("/webhook/v1/twitch/event-sub/channel-redemption-add");
                await twitchAppAPI.eventSub.subscribeToChannelRedemptionAddEvents(twitchId, tsp);
                logger.info({ message: "Subscribed to channel redemption add events", data: { userId, twitchId } });
            }
        } catch (error) {
            logger.error({ message: "Failed to subscribe to redemption events", error: error as Error, data: { userId, twitchId } });
        }
    }

    async handleDropImage(transactionId: string, event: TwitchChannelChatMessageEventRequest) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.dropImage.handleDropImage", transactionId);

        if (!event.channel_points_custom_reward_id) {
            return;
        }

        logger.info({ message: "Initializing drop image event", data: { event } });
        const url = event.message.text;

        const config = await this.dropImageRepository.getByTwitchRewardId(transactionId, event.channel_points_custom_reward_id);
        if (!config) {
            logger.warn({ message: "Drop image config not found", data: { event } });
            return;
        }

        logger.info({ message: "Drop image config found", data: { config } });

        const sendChatMessageOptions: HelixSendChatMessageAsAppParams = {}
        if (event.message_id.startsWith("test-message-id")) {
            sendChatMessageOptions.replyParentMessageId = undefined;
        } else {
            sendChatMessageOptions.replyParentMessageId = event.message_id;
        }


        try {
            new URL(url);
        } catch (error) {
            logger.warn({ message: "Invalid URL", error: error as Error, data: { url } });
            if (config.twitch_bot_id && config.invalid_message) {
                twitchAppAPI.chat.sendChatMessageAsApp(
                    config.twitch_bot_id,
                    config.widget.twitch_id,
                    config.invalid_message,
                    sendChatMessageOptions
                );
            }
            return;
        }


        let imageResponse;
        try {
            imageResponse = await axios.get(url, { responseType: "arraybuffer" });
        } catch (error) {
            logger.warn({ message: "Invalid URL", error: error as Error, data: { url } });
            if (config.twitch_bot_id && config.invalid_message) {
                twitchAppAPI.chat.sendChatMessageAsApp(
                    config.twitch_bot_id,
                    config.widget.twitch_id,
                    config.invalid_message,
                    sendChatMessageOptions
                );
            }
            return;
        }

        const contentType: string = imageResponse.headers["content-type"];

        if (!contentType.includes("image")) {
            logger.warn({ message: "Not an image", data: { url } });
            if (config.twitch_bot_id && config.not_image_message) {
                twitchAppAPI.chat.sendChatMessageAsApp(
                    config.twitch_bot_id,
                    config.widget.twitch_id,
                    config.not_image_message,
                    sendChatMessageOptions
                );
            }
            return;
        }

        if (config.enabled_moderation) {
            const result = await this.sightengine.detectMatureContent(url);
            logger.info({ message: "Image moderation result", data: { url, result } });
            if (result.nudity.none < 0.8 || result.gore.prob > 0.5) {
                logger.warn({ message: "Image contains mature content", data: { url, result } });
                if (config.twitch_bot_id && config.contain_mature_message) {
                    twitchAppAPI.chat.sendChatMessageAsApp(
                        config.twitch_bot_id,
                        config.widget.twitch_id,
                        config.contain_mature_message,
                        sendChatMessageOptions
                    );
                }
                return;
            }
        }

        logger.info({ message: "All check passed, triggering DropImage", data: { url, userId: config.widget.owner_id } });
        await publisher.publish(`drop-image:image-url`, JSON.stringify({
            url: url,
            userId: config.widget.owner_id,
        }));
        this.widgetService.increaseTriggeredCount(transactionId, config.widget_id)
    }
}
