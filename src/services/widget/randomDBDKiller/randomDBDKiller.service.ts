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

export default class RandomDBDKillerService {
    private readonly logger: TLogger;

    constructor(
        private readonly randomDBDKillerRepository: RandomDBDKillerRepository,
        private readonly dbdKillerMasterRepository: DBDKillerMasterRepository,
        private readonly userRepository: UserRepository,
        private readonly widgetService: WidgetService
    ) {
        this.logger = new TLogger(Layer.SERVICE);
    }

    async create(request: CreateRandomDBDKillerInput): Promise<RandomDBDKillerWidget> {
        this.logger.setContext("service.randomDBDKiller.create");
        const user = await this.userRepository.get(request.owner_id);
        if (!user) {
            throw new NotFoundError("User not found");
        }

        await this.subscribeToRedemptionEvents(user.twitch_id, user.id);

        const res = await this.randomDBDKillerRepository.create({
            ...request,
            overlay_key: crypto.randomBytes(16).toString("hex")
        });
        await this.widgetService.setInitialEnabled(res.widget_id, user.id);
        return this.getByUserId(user.id);
    }

    async update(id: string, userId: string, request: UpdateRandomDBDKiller): Promise<RandomDBDKillerWidget> {
        this.logger.setContext("service.randomDBDKiller.update");

        const existing = await this.randomDBDKillerRepository.findById(id);
        if (!existing) {
            throw new NotFoundError("Widget not found");
        }
        await this.widgetService.authorizeOwnership(userId, existing.widget.id);

        if (request.killer_pool) {
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
        this.logger.setContext("service.randomDBDKiller.delete");
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
        this.logger.setContext("service.randomDBDKiller.getByUserId");
        const randomDBDKiller = await this.randomDBDKillerRepository.getByOwnerId(userId);
        if (!randomDBDKiller) {
            throw new NotFoundError("Random DBD Killer widget not found");
        }
        await this.widgetService.authorizeOwnership(userId, randomDBDKiller.widget.id);
        return randomDBDKiller;
    }

    async randomizeKiller(event: TwitchChannelRedemptionAddEventRequest): Promise<void> {
        this.logger.setContext("service.randomDBDKiller.randomizeKiller");
        const rewardId = event.reward.id;

        const config = await this.randomDBDKillerRepository.getByTwitchRewardId(rewardId);
        if (!config) {
            this.logger.warn({ message: "Random DBD Killer config not found", data: { rewardId } });
            return;
        }

        if (!config.killer_pool || config.killer_pool.length === 0) {
            this.logger.warn({ message: "Killer pool is empty", data: { widgetId: config.widget_id } });
            return;
        }

        const randomSlug = config.killer_pool[Math.floor(Math.random() * config.killer_pool.length)];
        const killer = await this.dbdKillerMasterRepository.getBySlug(randomSlug);
        if (!killer) {
            this.logger.warn({ message: "Killer master not found for slug", data: { slug: randomSlug } });
            return;
        }

        console.log("Publish", {
            userId: config.widget.owner_id,
            killer: {
                slug: killer.slug,
                title: killer.title,
                image_url: killer.image_url
            }
        })

        await publisher.publish("random-dbd-killer:result", JSON.stringify({
            userId: config.widget.owner_id,
            killer: {
                slug: killer.slug,
                title: killer.title,
                image_url: killer.image_url
            }
        }));
        this.widgetService.increaseTriggeredCount(config.widget_id);
    }

    private async subscribeToRedemptionEvents(twitchId: string, userId: string): Promise<void> {
        this.logger.setContext("service.randomDBDKiller.subscribeToRedemptionEvents");
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

    async validateOverlayAccess(userId: string, key: string): Promise<boolean> {
        this.logger.setContext("service.randomDBDKiller.validateOverlayAccess");
        return this.widgetService.validateOverlayAccess(userId, key);
    }

    async refreshKey(userId: string): Promise<{ overlay_key: string }> {
        this.logger.setContext("service.randomDBDKiller.refreshKey");
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
