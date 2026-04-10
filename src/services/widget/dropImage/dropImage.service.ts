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

    async getByUserId(userId: string): Promise<DropImageWidget> {
        this.logger.setContext("service.dropImage.getByUserId");
        this.logger.info({ message: "Fetching drop image config for user", data: { userId } });
        try {
            const res = await this.dropImageRepository.getByOwnerId(userId);
            if (!res) {
                throw new NotFoundError("Drop Image config not found");
            }
            await this.widgetService.authorizeOwnership(userId, res.widget.id);
            return res;
        } catch (error) {
            this.logger.error({ message: "Failed to get drop image widget", error: error as Error, data: { userId } });
            throw error;
        }
    }

    async create(request: CreateDropImageServiceRequest): Promise<DropImageWidget> {
        this.logger.setContext("service.dropImage.create");
        this.logger.info({ message: "Creating drop image config", data: request });
        try {
            const user = await this.userRepository.get(request.userId);
            if (!user) {
                this.logger.warn({ message: "User not found for setup", data: request });
                throw new NotFoundError("User not found");
            }

            const existing = await this.dropImageRepository.getByOwnerId(user.id).catch(() => null);
            if (existing) {
                this.logger.warn({ message: "Drop image config already exists", data: request });
                throw new BadRequestError("Drop image config already exists");
            }

            await this.subscribeToRedemptionEvents(user.twitch_id, user.id);

            const res = await this.dropImageRepository.create({
                twitch_id: user.twitch_id,
                owner_id: user.id,
                twitch_bot_id: user.twitch_id,
                overlay_key: randomBytes(16).toString("hex"),
                invalid_message: "ข้อความที่ส่งมาไม่ใช่ URL",
                not_image_message: "ลิงก์ที่ส่งมาไม่ใช่ลิงก์ของรูปภาพ",
                contain_mature_message: "ลิงก์ที่ส่งมามีเนื้อหาที่ไม่เหมาะสม"
            });
            await this.widgetService.setInitialEnabled(res.widget_id, user.id)
            return this.getByUserId(user.id)
        } catch (error) {
            this.logger.error({ message: "Failed to create drop image widget", error: error as Error, data: request });
            throw error;
        }
    }

    async update(id: string, userId: string, request: UpdateDropImageServiceRequest): Promise<DropImageWidget> {
        this.logger.setContext("service.dropImage.update");
        this.logger.info({ message: "Updating drop image config", data: { id, userId, request } });
        try {
            const dropImage = await this.dropImageRepository.findById(id);
            if (!dropImage) {
                this.logger.warn({ message: "DropImage widget not found", data: { id, userId } });
                throw new NotFoundError("Drop Image config not found");
            }

            await this.widgetService.authorizeOwnership(userId, dropImage.widget.id);

            await this.subscribeToRedemptionEvents(dropImage.widget.twitch_id, userId);

            return await this.dropImageRepository.update(id, request);
        } catch (error) {
            this.logger.error({ message: "Failed to update drop image widget", error: error as Error, data: request });
            throw error;
        }
    }

    async delete(userId: string): Promise<void> {
        this.logger.setContext("service.dropImage.delete");
        this.logger.info({ message: "Deleting drop image config", data: { userId } });
        try {
            const dropImage = await this.dropImageRepository.getByOwnerId(userId).catch(() => null);
            if (!dropImage) {
                this.logger.info({ message: "Drop image config not found, skip delete", data: { userId } });
                return;
            }

            await this.widgetService.authorizeOwnership(userId, dropImage.widget.id);

            await this.dropImageRepository.delete(dropImage.id);
        } catch (error) {
            this.logger.error({ message: "Failed to delete drop image widget", error: error as Error, data: { userId } });
            throw error;
        }
    }

    async refreshOverlayKey(userId: string): Promise<DropImageWidget> {
        this.logger.setContext("service.dropImage.refreshOverlayKey");
        this.logger.info({ message: "Refreshing drop image overlay key", data: { userId } });
        try {
            const dropImage = await this.dropImageRepository.getByOwnerId(userId);
            if (!dropImage) {
                this.logger.warn({ message: "DropImage widget not found", data: { userId } });
                throw new NotFoundError("Drop Image config not found");
            }

            return await this.dropImageRepository.update(dropImage.id, {
                overlay_key: randomUUID()
            });
        } catch (error) {
            this.logger.error({ message: "Failed to refresh drop image overlay key", error: error as Error, data: { userId } });
            throw error;
        }
    }

    private async subscribeToRedemptionEvents(twitchId: string, userId: string): Promise<void> {
        this.logger.setContext("service.dropImage.subscribeToRedemptionEvents");
        try {
            const userSubs = await twitchAppAPI.eventSub.getSubscriptionsForUser(twitchId);
            const enabledSubs = userSubs.data.filter(sub => sub.status === 'enabled');

            const channelRewardRedemptionSub = enabledSubs.filter(sub => sub.type === 'channel.channel_points_custom_reward_redemption.add');
            if (channelRewardRedemptionSub.length === 0) {
                const tsp = createESTransport("/webhook/v1/twitch/event-sub/channel-redemption-add");
                await twitchAppAPI.eventSub.subscribeToChannelRedemptionAddEvents(twitchId, tsp);
                this.logger.info({ message: "Subscribed to channel redemption add events", data: { userId, twitchId } });
            }
        } catch (error) {
            this.logger.error({ message: "Failed to subscribe to redemption events", error: error as Error, data: { userId, twitchId } });
        }
    }

    async handleDropImage(event: TwitchChannelChatMessageEventRequest) {
        this.logger.setContext("service.dropImage.handleDropImage");

        if (!event.channel_points_custom_reward_id) {
            return;
        }

        this.logger.info({ message: "Initializing drop image event", data: { event } });
        const url = event.message.text;

        const config = await this.dropImageRepository.getByTwitchRewardId(event.channel_points_custom_reward_id);
        if (!config) {
            this.logger.warn({ message: "Drop image config not found", data: { event } });
            return;
        }

        this.logger.info({ message: "Drop image config found", data: { config } });

        const sendChatMessageOptions: HelixSendChatMessageAsAppParams = {}
        if (event.message_id.startsWith("test-message-id")) {
            sendChatMessageOptions.replyParentMessageId = undefined;
        } else {
            sendChatMessageOptions.replyParentMessageId = event.message_id;
        }


        try {
            new URL(url);
        } catch (error) {
            this.logger.warn({ message: "Invalid URL", error: error as Error, data: { url } });
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
            this.logger.warn({ message: "Invalid URL", error: error as Error, data: { url } });
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
            this.logger.warn({ message: "Not an image", data: { url } });
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
            this.logger.info({ message: "Image moderation result", data: { url, result } });
            if (result.nudity.none < 0.8 || result.gore.prob > 0.5) {
                this.logger.warn({ message: "Image contains mature content", data: { url, result } });
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

        this.logger.info({ message: "All check passed, triggering DropImage", data: { url, userId: config.widget.owner_id } });
        publisher.publish(`drop-image:image-url`, JSON.stringify({
            url: url,
            userId: config.widget.owner_id,
        }));
    }
}
