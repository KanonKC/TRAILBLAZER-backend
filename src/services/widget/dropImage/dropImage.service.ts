import DropImageRepository from "@/repositories/dropImage/dropImage.repository";
import EventSubReconcilerService from "@/services/twitch/eventSubReconciler/eventSubReconciler.service";
import TLogger, { Layer } from "@/logging/logger";
import { CreateDropImageServiceRequest, UpdateDropImageServiceRequest } from "./request";
import UserRepository from "@/repositories/user/user.repository";
import { NotFoundError, BadRequestError } from "@/errors";
import WidgetService from "../widget.service";
import { randomBytes, randomUUID } from "node:crypto";
import { DropImageWidget } from "@/repositories/dropImage/response";
import { TwitchChannelRedemptionAddEventRequest } from "@/events/twitch/channelRedemptionAdd/request";
import redis, { publisher } from "@/libs/redis";
import { twitchAppAPI } from "@/libs/twurple";
import axios from "axios";
import Sightengine from "@/providers/sightengine";
import { TwitchChannelChatMessageEventRequest } from "@/events/twitch/channelChatMessage/request";
import { HelixSendChatMessageAsAppParams } from "@twurple/api/lib/interfaces/endpoints/chat.input";
import OverlayQueueService from "@/services/overlayQueue/overlayQueue.service";
import { WidgetTypeSlug } from "@/services/constant";

/** What a queued image drop carries until it is dispatched. */
interface DropImageJobPayload {
    url: string
}

export default class DropImageService {
    private readonly logger: TLogger;

    constructor(
        private readonly dropImageRepository: DropImageRepository,
        private readonly userRepository: UserRepository,
        private readonly sightengine: Sightengine,
        private readonly widgetService: WidgetService,
        private readonly overlayQueue: OverlayQueueService
    ) {
        this.logger = new TLogger(Layer.SERVICE);
        this.registerOverlayHandler();
    }

    /**
     * The display duration is the streamer's own setting, and it travels with
     * the event so the overlay and the queue agree on when this image is done.
     */
    private registerOverlayHandler() {
        this.overlayQueue.register<DropImageJobPayload>(WidgetTypeSlug.DROP_IMAGE, {
            channel: "drop-image:image-url",
            event: "image-url",
            resolve: async (job) => ({ url: job.payload.url }),
            estimateDurationMs: (job) => job.durationMs ?? 5_000,
        })
    }

    async getByUserId(userId: string, transactionId?: string): Promise<DropImageWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.dropImage.getByUserId", transactionId);
        logger.info({ message: "Fetching drop image config for user", data: { userId } });
        try {
            const res = await this.dropImageRepository.getByOwnerId(userId, transactionId);
            if (!res) {
                throw new NotFoundError("Drop Image config not found");
            }
            await this.widgetService.authorizeOwnership(userId, res.widget.id, transactionId);
            return res;
        } catch (error) {
            logger.error({ message: "Failed to get drop image widget", error: error as Error, data: { userId } });
            throw error;
        }
    }

    async create(request: CreateDropImageServiceRequest, transactionId?: string): Promise<DropImageWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.dropImage.create", transactionId);
        logger.info({ message: "Creating drop image config", data: request });
        try {
            const user = await this.userRepository.get(request.userId, transactionId);
            if (!user) {
                logger.warn({ message: "User not found for setup", data: request });
                throw new NotFoundError("User not found");
            }

            const existing = await this.dropImageRepository.getByOwnerId(user.id, transactionId).catch(() => null);
            if (existing) {
                logger.warn({ message: "Drop image config already exists", data: request });
                throw new BadRequestError("Drop image config already exists");
            }

            await this.subscribeToRedemptionEvents(user.twitch_id, user.id, transactionId);

            const res = await this.dropImageRepository.create({
                twitch_id: user.twitch_id,
                owner_id: user.id,
                twitch_bot_id: user.twitch_id,
                overlay_key: randomBytes(16).toString("hex"),
                invalid_message: "ข้อความที่ส่งมาไม่ใช่ URL",
                not_image_message: "ลิงก์ที่ส่งมาไม่ใช่ลิงก์ของรูปภาพ",
                contain_mature_message: "ลิงก์ที่ส่งมามีเนื้อหาที่ไม่เหมาะสม"
            }, transactionId);
            await this.widgetService.setInitialEnabled(res.widget_id, user.id, transactionId)
            return this.getByUserId(user.id, transactionId)
        } catch (error) {
            logger.error({ message: "Failed to create drop image widget", error: error as Error, data: request });
            throw error;
        }
    }

    async update(id: string, userId: string, request: UpdateDropImageServiceRequest, transactionId?: string): Promise<DropImageWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.dropImage.update", transactionId);
        logger.info({ message: "Updating drop image config", data: { id, userId, request } });
        try {
            const dropImage = await this.dropImageRepository.findById(id, transactionId);
            if (!dropImage) {
                logger.warn({ message: "DropImage widget not found", data: { id, userId } });
                throw new NotFoundError("Drop Image config not found");
            }

            await this.widgetService.authorizeOwnership(userId, dropImage.widget.id, transactionId);

            await this.subscribeToRedemptionEvents(dropImage.widget.twitch_id, userId, transactionId);

            return await this.dropImageRepository.update(id, request, transactionId);
        } catch (error) {
            logger.error({ message: "Failed to update drop image widget", error: error as Error, data: request });
            throw error;
        }
    }

    async delete(userId: string, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.dropImage.delete", transactionId);
        logger.info({ message: "Deleting drop image config", data: { userId } });
        try {
            const dropImage = await this.dropImageRepository.getByOwnerId(userId, transactionId).catch(() => null);
            if (!dropImage) {
                logger.info({ message: "Drop image config not found, skip delete", data: { userId } });
                return;
            }

            await this.widgetService.authorizeOwnership(userId, dropImage.widget.id, transactionId);

            await this.dropImageRepository.delete(dropImage.id, transactionId);
        } catch (error) {
            logger.error({ message: "Failed to delete drop image widget", error: error as Error, data: { userId } });
            throw error;
        }
    }

    async refreshOverlayKey(userId: string, transactionId?: string): Promise<DropImageWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.dropImage.refreshOverlayKey", transactionId);
        logger.info({ message: "Refreshing drop image overlay key", data: { userId } });
        try {
            const dropImage = await this.dropImageRepository.getByOwnerId(userId, transactionId);
            if (!dropImage) {
                logger.warn({ message: "DropImage widget not found", data: { userId } });
                throw new NotFoundError("Drop Image config not found");
            }

            return await this.dropImageRepository.update(dropImage.id, {
                overlay_key: randomUUID()
            }, transactionId);
        } catch (error) {
            logger.error({ message: "Failed to refresh drop image overlay key", error: error as Error, data: { userId } });
            throw error;
        }
    }

    private async subscribeToRedemptionEvents(twitchId: string, userId: string, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.dropImage.subscribeToRedemptionEvents", transactionId);
        try {
            await EventSubReconcilerService.ensureEventSubs(twitchId, EventSubReconcilerService.getRequiredEventTypes([WidgetTypeSlug.DROP_IMAGE]));
        } catch (error) {
            logger.error({ message: "Failed to subscribe to redemption events", error: error as Error, data: { userId, twitchId } });
        }
    }

    async handleDropImage(event: TwitchChannelChatMessageEventRequest, transactionId?: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.dropImage.handleDropImage", transactionId);

        if (!event.channel_points_custom_reward_id) {
            return;
        }

        logger.info({ message: "Initializing drop image event", data: { event } });
        const url = event.message.text;

        const config = await this.dropImageRepository.getByTwitchRewardId(event.channel_points_custom_reward_id, transactionId);
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

        logger.info({ message: "All check passed, queueing DropImage", data: { url, userId: config.widget.owner_id } });
        // Queued so a second redemption cannot replace an image that is still up.
        await this.overlayQueue.enqueue<DropImageJobPayload>({
            userId: config.widget.owner_id,
            widgetSlug: WidgetTypeSlug.DROP_IMAGE,
            widgetId: config.widget_id,
            payload: { url },
            durationMs: (config.display_duration ?? 5) * 1000,
            awaitsAck: true,
            transactionId,
        })
    }
}
