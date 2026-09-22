import { BadRequestError, NotFoundError } from "@/errors";
import { TwitchChannelRedemptionAddEventRequest } from "@/events/twitch/channelRedemptionAdd/request";
import redis, { publisher } from "@/libs/redis";
import { createESTransport, twitchAppAPI } from "@/libs/twurple";
import TLogger, { Layer } from "@/logging/logger";
import DBDKillerMasterRepository from "@/repositories/dbdKillerMaster/dbdKillerMaster.repository";
import RandomDBDKillerRepository from "@/repositories/randomDBDKiller/randomDBDKiller.repository";
import { CreateRandomDBDKillerInput, UpdateRandomDBDKiller } from "@/repositories/randomDBDKiller/request";
import { RandomDBDKillerWidget } from "@/repositories/randomDBDKiller/response";
import UserRepository from "@/repositories/user/user.repository";
import crypto from "crypto";
import WidgetService from "../widget.service";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { convertPrismaError } from "@/utils/error";
import OverlayQueueService from "@/services/overlayQueue/overlayQueue.service";
import {
    KILLER_CHAT_DELAY_MS,
    KILLER_DEFAULT_SPIN_MS,
    KILLER_HOLD_MS,
    KILLER_SPIN_MS,
} from "@/services/overlayQueue/constants";
import { WidgetTypeSlug } from "../constant";

interface KillerEntry {
    slug: string
    title: string
    image_url: string
}

/** What a queued killer roll carries until it is dispatched. */
interface RandomDBDKillerJobPayload {
    killer: KillerEntry
    pool: KillerEntry[]
    animationStyle: string
}

export default class RandomDBDKillerService {
    private readonly logger: TLogger;

    constructor(
        private readonly randomDBDKillerRepository: RandomDBDKillerRepository,
        private readonly dbdKillerMasterRepository: DBDKillerMasterRepository,
        private readonly userRepository: UserRepository,
        private readonly widgetService: WidgetService,
        private readonly overlayQueue: OverlayQueueService
    ) {
        this.logger = new TLogger(Layer.SERVICE);
        this.registerOverlayHandler();
    }

    /**
     * The spin animation's length lives here rather than in the overlay, so the
     * queue and the browser cannot drift apart about when a roll is over.
     */
    private registerOverlayHandler() {
        this.overlayQueue.register<RandomDBDKillerJobPayload>(WidgetTypeSlug.RANDOM_DBD_KILLER, {
            channel: "random-dbd-killer:result",
            event: "killer-result",
            resolve: async (job) => ({
                killer: job.payload.killer,
                pool: job.payload.pool,
                animationStyle: job.payload.animationStyle,
            }),
            estimateDurationMs: (job) =>
                (KILLER_SPIN_MS[job.payload.animationStyle] ?? KILLER_DEFAULT_SPIN_MS) + KILLER_HOLD_MS,
        })
    }

    async create(request: CreateRandomDBDKillerInput): Promise<RandomDBDKillerWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDBDKiller.create");
        const user = await this.userRepository.get(request.owner_id);
        if (!user) {
            throw new NotFoundError("User not found");
        }

        const existing = await this.randomDBDKillerRepository.getByOwnerId(request.owner_id);
        if (existing) {
            throw new BadRequestError("Random DBD Killer widget already exists for this user");
        }

        await this.subscribeToRedemptionEvents(user.twitch_id, user.id);

        let res;
        try {
            res = await this.randomDBDKillerRepository.create({
                ...request,
                overlay_key: crypto.randomBytes(16).toString("hex")
            });
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
                throw convertPrismaError(error);
            }
            throw error;
        }
        await this.widgetService.setInitialEnabled(res.widget_id, user.id);
        return this.getByUserId(user.id);
    }

    async update(id: string, userId: string, request: UpdateRandomDBDKiller): Promise<RandomDBDKillerWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDBDKiller.update");

        const existing = await this.randomDBDKillerRepository.findById(id);
        if (!existing) {
            throw new NotFoundError("Widget not found");
        }
        await this.widgetService.authorizeOwnership(userId, existing.widget.id);

        if (request.killer_pool) {
            request.killer_pool = [...new Set(request.killer_pool)];
            const masters = await this.dbdKillerMasterRepository.getBySlugs(request.killer_pool);
            const foundSlugs = new Set(masters.map(m => m.slug));
            const unknownSlugs = request.killer_pool.filter(slug => !foundSlugs.has(slug));
            if (unknownSlugs.length > 0) {
                throw new BadRequestError(`Unknown killer slug(s): ${unknownSlugs.join(", ")}`);
            }
        }

        const updated = await this.randomDBDKillerRepository.update(id, request);
        await redis.del(`random_dbd_killer:owner_id:${updated.widget.owner_id}`);
        await redis.del(`random_dbd_killer:twitch_id:${updated.widget.twitch_id}`);
        return updated;
    }

    async delete(userId: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDBDKiller.delete");
        const existing = await this.randomDBDKillerRepository.getByOwnerId(userId);
        if (!existing) {
            return;
        }

        await this.widgetService.authorizeOwnership(userId, existing.widget.id);

        await this.randomDBDKillerRepository.delete(existing.id);

        await redis.del(`random_dbd_killer:owner_id:${userId}`);
        await redis.del(`random_dbd_killer:twitch_id:${existing.widget.twitch_id}`);
    }

    async getByUserId(userId: string): Promise<RandomDBDKillerWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDBDKiller.getByUserId");
        const randomDBDKiller = await this.randomDBDKillerRepository.getByOwnerId(userId);
        if (!randomDBDKiller) {
            throw new NotFoundError("Random DBD Killer widget not found");
        }
        await this.widgetService.authorizeOwnership(userId, randomDBDKiller.widget.id);
        return randomDBDKiller;
    }

    async randomizeKiller(event: TwitchChannelRedemptionAddEventRequest): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDBDKiller.randomizeKiller");
        const rewardId = event.reward.id;

        const config = await this.randomDBDKillerRepository.getByTwitchRewardId(rewardId);
        if (!config) {
            logger.warn({ message: "Random DBD Killer config not found", data: { rewardId } });
            return;
        }

        if (!config.killer_pool || config.killer_pool.length === 0) {
            logger.warn({ message: "Killer pool is empty", data: { widgetId: config.widget_id } });
            try {
                await twitchAppAPI.chat.sendChatMessageAsApp(
                    event.broadcaster_user_id,
                    event.broadcaster_user_id,
                    "Random DBD Killer pool is not configured yet."
                );
            } catch (error) {
                logger.error({ message: "Failed to send empty pool notice", data: { error } });
            }
            return;
        }

        const randomSlug = config.killer_pool[Math.floor(Math.random() * config.killer_pool.length)];
        const killer = await this.dbdKillerMasterRepository.getBySlug(randomSlug);
        if (!killer) {
            logger.warn({ message: "Killer master not found for slug", data: { slug: randomSlug } });
            return;
        }

        const poolMasters = await this.dbdKillerMasterRepository.getBySlugs(config.killer_pool);

        const animationStyle = config.animation_style
        const spinMs = (KILLER_SPIN_MS[animationStyle] ?? KILLER_DEFAULT_SPIN_MS) + KILLER_HOLD_MS

        // Queued so a second redemption cannot remount the spinner mid-animation.
        // The chat message keeps its deliberate delay, now measured from the
        // moment this roll actually starts, so it never spoils the result early.
        await this.overlayQueue.enqueue<RandomDBDKillerJobPayload>({
            userId: config.widget.owner_id,
            widgetSlug: WidgetTypeSlug.RANDOM_DBD_KILLER,
            widgetId: config.widget_id,
            payload: {
                killer: { slug: killer.slug, title: killer.title, image_url: killer.image_url },
                pool: poolMasters.map(k => ({ slug: k.slug, title: k.title, image_url: k.image_url })),
                animationStyle,
            },
            effects: [{
                type: "chat",
                senderId: event.broadcaster_user_id,
                broadcasterId: event.broadcaster_user_id,
                message: `Random Killer: ${killer.title}`,
                delayMs: KILLER_CHAT_DELAY_MS,
            }],
            durationMs: spinMs,
            awaitsAck: true,
        });
    }

    private async subscribeToRedemptionEvents(twitchId: string, userId: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDBDKiller.subscribeToRedemptionEvents");
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

    async validateOverlayAccess(userId: string, key: string): Promise<boolean> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDBDKiller.validateOverlayAccess");
        return this.widgetService.validateOverlayAccess(userId, key);
    }

    async refreshKey(userId: string): Promise<{ overlay_key: string }> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDBDKiller.refreshKey");
        const widget = await this.randomDBDKillerRepository.getByOwnerId(userId);
        if (!widget) {
            throw new NotFoundError("Widget not found");
        }
        await this.widgetService.authorizeOwnership(userId, widget.widget.id);

        const newKey = crypto.randomUUID();
        await this.widgetService.updateOverlayKey(widget.widget.id, newKey);

        await redis.del(`random_dbd_killer:owner_id:${userId}`);

        return { overlay_key: newKey };
    }
}
