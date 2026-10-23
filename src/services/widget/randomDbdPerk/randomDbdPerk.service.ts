import { WidgetTypeSlug } from "@/services/constant";
import config from "@/config";
import EventSubReconcilerService from "@/services/twitch/eventSubReconciler/eventSubReconciler.service";
import { NotFoundError } from "@/errors";
import { TwitchChannelRedemptionAddEventRequest } from "@/events/twitch/channelRedemptionAdd/request";
import redis, { TTL } from "@/libs/redis";
import { twitchAppAPI } from "@/libs/twurple";
import TLogger, { Layer } from "@/logging/logger";
import RandomDbdPerkRepository from "@/repositories/randomDbdPerk/randomDbdPerk.repository";
import { CreateRandomDbdPerk, RandomDbdPerkClassType, UpdateRandomDbdPerk } from "@/repositories/randomDbdPerk/request";
import { RandomDbdPerkWidget } from "@/repositories/randomDbdPerk/response";
import UserRepository from "@/repositories/user/user.repository";
import { capitalize } from "@/utils/message";
import crypto from "crypto";
import WidgetService from "../widget.service";
import { DbdPerkPagination, ExtendedRandomDbdPerk } from "./response";

export default class RandomDbdPerkService {
    private readonly randomDbdPerkRepository: RandomDbdPerkRepository;
    private readonly userRepository: UserRepository;
    private readonly widgetService: WidgetService;
    private readonly logger: TLogger;

    constructor(randomDbdPerkRepository: RandomDbdPerkRepository, userRepository: UserRepository, widgetService: WidgetService) {
        this.randomDbdPerkRepository = randomDbdPerkRepository;
        this.userRepository = userRepository;
        this.widgetService = widgetService;
        this.logger = new TLogger(Layer.SERVICE);
    }

    async extend(rw: RandomDbdPerkWidget, transactionId?: string): Promise<ExtendedRandomDbdPerk> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDbdPerk.extend", transactionId);
        const totalKillerPerks = await this.getTotalPerkCount(RandomDbdPerkClassType.KILLER, transactionId)
        const totalSurvivorPerks = await this.getTotalPerkCount(RandomDbdPerkClassType.SURVIVOR, transactionId)
        return {
            ...rw,
            totalKillerPerks,
            totalSurvivorPerks
        }
    }

    async create(request: CreateRandomDbdPerk, transactionId?: string): Promise<ExtendedRandomDbdPerk> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDbdPerk.create", transactionId);
        const user = await this.userRepository.get(request.owner_id, transactionId);
        if (!user) {
            throw new NotFoundError("User not found");
        }

        await this.widgetService.authorizeWidgetType(user.id, WidgetTypeSlug.RANDOM_DBD_PERK, transactionId);
        await EventSubReconcilerService.ensureEventSubs(user.twitch_id, EventSubReconcilerService.getRequiredEventTypes([WidgetTypeSlug.RANDOM_DBD_PERK]));

        const res = await this.randomDbdPerkRepository.create(request, transactionId)
        await this.widgetService.setInitialEnabled(res.widget_id, user.id, transactionId);
        return this.getByUserId(user.id, transactionId);
    }

    async update(id: string, userId: string, request: UpdateRandomDbdPerk, transactionId?: string): Promise<ExtendedRandomDbdPerk> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDbdPerk.update", transactionId);

        const survivorCount = await this.getTotalPerkCount(RandomDbdPerkClassType.SURVIVOR, transactionId)
        const killerCount = await this.getTotalPerkCount(RandomDbdPerkClassType.KILLER, transactionId)

        if (request.classes) {
            for (let i = 0; i < request.classes.length; i++) {
                let maxCount = killerCount
                if (request.classes[i].type === RandomDbdPerkClassType.SURVIVOR) {
                    maxCount = survivorCount
                }

                if (!request.classes[i].maximum_random_size || request.classes[i].maximum_random_size! >= maxCount) {
                    request.classes[i].maximum_random_size = 999
                }

            }
        }

        const existing = await this.randomDbdPerkRepository.findById(id, transactionId);
        if (!existing) {
            throw new NotFoundError("Widget not found");
        }
        await this.widgetService.authorizeOwnership(userId, existing.widget.id, transactionId);

        const updated = await this.randomDbdPerkRepository.update(id, request, transactionId);
        if (updated) {
            await redis.del(`random_dbd_perk:owner_id:${updated.widget.owner_id}`);
            await redis.del(`random_dbd_perk:twitch_id:${updated.widget.twitch_id}`);
        }
        return this.extend(updated, transactionId);
    }

    async delete(userId: string, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDbdPerk.delete", transactionId);
        const existing = await this.randomDbdPerkRepository.getByOwnerId(userId, transactionId);
        if (!existing) {
            return;
        }

        await this.widgetService.authorizeOwnership(userId, existing.widget.id, transactionId);

        await this.randomDbdPerkRepository.delete(existing.id, transactionId);

        await redis.del(`random_dbd_perk:twitch_id:${existing.widget.twitch_id}`);
        await redis.del(`random_dbd_perk:owner_id:${userId}`);
    }

    async getByUserId(userId: string, transactionId?: string): Promise<ExtendedRandomDbdPerk> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDbdPerk.getByUserId", transactionId);
        const randomDbdPerk = await this.randomDbdPerkRepository.getByOwnerId(userId, transactionId);
        if (!randomDbdPerk) {
            throw new NotFoundError("Random Dbd Perk widget not found");
        }
        await this.widgetService.authorizeOwnership(userId, randomDbdPerk.widget.id, transactionId);
        return this.extend(randomDbdPerk, transactionId);
    }

    async randomPerk(event: TwitchChannelRedemptionAddEventRequest, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDbdPerk.randomPerk", transactionId);
        const rewardId = event.reward.id

        const config = await this.randomDbdPerkRepository.getByTwitchId(event.broadcaster_user_id, transactionId)
        if (!config) {
            logger.warn({ message: "Random Dbd Perk widget not found", data: { twitchId: event.broadcaster_user_id } });
            return;
        }
        if (!config.widget.enabled || !await this.widgetService.isAvailable(config.widget.owner_id, config.widget_id, transactionId)) return;
        const randomClass = await this.randomDbdPerkRepository.getClassByRewardId(rewardId, transactionId)

        if (!randomClass) {
            logger.warn({ message: "Random class not found", data: { rewardId } });
            return;
        }

        const maxPerkCount = await this.getTotalPerkCount(randomClass.type, transactionId)
        const randomSize = Math.min(maxPerkCount, randomClass.maximum_random_size)

        const randomResult: number[] = []
        const perkCount = Math.min(4, randomSize)
        let i = 0
        while (i < perkCount) {
            const randomPerk = (Math.floor(Math.random() * randomSize)) + 1
            if (randomResult.includes(randomPerk)) {
                continue
            }
            randomResult.push(randomPerk)
            i++
        }
        const pagination = randomResult.map(this.paginateDbdPerk)
        const randomPerkMessage = pagination.map(p => ` ${p.page}/${(p.row - 1) * 5 + p.perk}`).join(" |")
        const message = `Random ${capitalize(randomClass.type)} Perks [${randomPerkMessage} ]`

        const senderId = event.broadcaster_user_id
        // TODO(overlay-queue): this widget has no working overlay yet — no SSE
        // route, nothing published — so a chat message is all it produces and
        // there is nothing for events to cut each other off over. If an overlay
        // is added, route this through overlayQueue.enqueue() like the other
        // widgets so the chat line and the overlay stay together.
        try {
            logger.info({ message: "Sending chat message", data: { message } });
            await twitchAppAPI.chat.sendChatMessageAsApp(senderId, senderId, message)
            await this.widgetService.increaseTriggeredCount(config.widget_id, transactionId)
        } catch (error) {
            logger.error({ message: "Failed to send chat message", data: { error } });
        }
    }

    async getTotalPerkCount(type: string, transactionId?: string): Promise<number> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDbdPerk.getTotalPerkCount", transactionId);
        if (type === RandomDbdPerkClassType.KILLER) {
            return config.randomDbdPerk.totalKillerPerkCount
        } else {
            return config.randomDbdPerk.totalSurvivorPerkCount
        }
    }

    paginateDbdPerk(sequence: number): DbdPerkPagination {
        sequence -= 1
        const page = (Math.floor(sequence / 15)) + 1
        let perk = sequence % 15
        const row = (Math.floor(perk / 5)) + 1
        perk = (perk % 5) + 1
        return { page, row, perk }
    }

    async validateOverlayAccess(userId: string, key: string, transactionId?: string): Promise<boolean> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDbdPerk.validateOverlayAccess", transactionId);
        const cacheKey = `random_dbd_perk:owner_id:${userId}`;
        let widget: RandomDbdPerkWidget | null = null;

        const cached = await redis.get(cacheKey);
        if (cached) {
            widget = JSON.parse(cached);
        } else {
            widget = await this.randomDbdPerkRepository.getByOwnerId(userId, transactionId);
            if (widget) {
                await redis.set(cacheKey, JSON.stringify(widget), TTL.ONE_DAY);
            }
        }

        if (!widget) return false;

        return widget.widget.overlay_key === key && await this.widgetService.validateOverlayAccess(userId, key, transactionId);
    }



    async trigger(userId: string, transactionId?: string) {
        const widget = await this.getByUserId(userId, transactionId);
        if (!widget) {
            throw new NotFoundError("Widget not found");
        }
    }

    async refreshKey(userId: string, transactionId?: string): Promise<{ overlay_key: string }> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.randomDbdPerk.refreshKey", transactionId);
        const widget = await this.randomDbdPerkRepository.getByOwnerId(userId, transactionId);
        if (!widget) {
            throw new NotFoundError("Widget not found");
        }
        await this.widgetService.authorizeOwnership(userId, widget.widget.id, transactionId);

        const newKey = crypto.randomUUID();
        await this.widgetService.updateOverlayKey(widget.widget.id, newKey, transactionId);

        const cacheKey = `random_dbd_perk:owner_id:${userId}`;
        await redis.del(cacheKey);

        return { overlay_key: newKey };
    }
}
