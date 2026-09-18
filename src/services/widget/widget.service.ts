import crypto from "crypto";
import { ForbiddenError, NotFoundError } from "@/errors";
import redis, { TTL } from "@/libs/redis";
import TLogger, { Layer } from "@/logging/logger";
import { ListWidgetFilters, UpdateWidget } from "@/repositories/widget/request";
import WidgetRepository from "@/repositories/widget/widget.repository";
import UserService from "../user/user.service";
import { ListResponse, Pagination } from "../response";
import { ExtendedWidget } from "@/repositories/widget/response";
import UserRepository from "@/repositories/user/user.repository";
import { UserTier, PLAN_QUOTA } from "../user/constant";
import { WidgetQuotaLimitError } from "./error";


export default class WidgetService {
    private readonly widgetRepository: WidgetRepository;
    private readonly userService: UserService
    private readonly userRepository: UserRepository
    private logger: TLogger;

    constructor(
        widgetRepository: WidgetRepository,
        userService: UserService,
        userRepository: UserRepository
    ) {
        this.widgetRepository = widgetRepository;
        this.userService = userService;
        this.userRepository = userRepository;
        this.logger = new TLogger(Layer.SERVICE);
    }

    async authorizeOwnership(transactionId: string, userId: string, widgetId: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.authorizeOwnership", transactionId);
        const widget = await this.get(transactionId, widgetId);
        if (widget.owner_id !== userId) {
            logger.warn({ message: "You are not the owner of this widget", data: { userId, widgetId: widget.id } });
            throw new ForbiddenError("You are not the owner of this widget");
        }
    }

    async authorizeTierUsage(transactionId: string, userId: string, widgetId?: string, isEnabling?: boolean) {
        let logger: TLogger = this.logger;
        try {
            logger = this.logger.setContext("service.widget.authorizeTierUsage", transactionId);

            if (isEnabling === false) return; // Disabling is always allowed

            const user = await this.userService.get(transactionId, userId);
            const baseQuota = PLAN_QUOTA[user.tier >= UserTier.PRO_TIER ? UserTier.PRO_TIER : UserTier.FREE_TIER];
            const quota = baseQuota + user.extra_widget_quota;

            let currentWidgetCost = 1;
            let willBeEnabled: boolean = isEnabling ?? true;

            if (widgetId) {
                const currentWidget = await this.get(transactionId, widgetId);
                currentWidgetCost = currentWidget.widget_type?.cost ?? 1;
                willBeEnabled = isEnabling ?? currentWidget.enabled;
            }

            if (!willBeEnabled) return; // Disabling — skip quota check

            const usedQuota = await this.widgetRepository.getEnabledQuotaUsed(transactionId, userId, widgetId ? [widgetId] : []);
            const resultingQuota = usedQuota + currentWidgetCost;

            if (resultingQuota > quota) {
                logger.warn({
                    message: `Quota exceeded`,
                    data: { userId, widgetId, usedQuota, currentWidgetCost, quota, extraQuota: user.extra_widget_quota }
                });
                throw new WidgetQuotaLimitError();
            }
        } catch (error) {
            logger.error({ message: `Error authorizing tier usage`, error: error as Error });
            throw error;
        }
    }

    async update(transactionId: string, id: string, userId: string, request: UpdateWidget) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.update", transactionId);
        const existing = await this.widgetRepository.get(transactionId, id);
        if (!existing) {
            throw new NotFoundError("Widget not found");
        }
        await this.authorizeOwnership(transactionId, userId, existing.id);
        const res = await this.widgetRepository.update(transactionId, id, request);
        await redis.del(`widget:${id}`)
        await redis.del(`widget:total:owner:${userId}`)
        return res
    }

    async updateEnable(transactionId: string, id: string, userId: string, value: boolean) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.updateEnable", transactionId);
        logger.info({ message: "Updating widget enabled status", data: { id, userId, value } });

        await this.authorizeTierUsage(transactionId, userId, id, value);
        return this.update(transactionId, id, userId, { enabled: value });
    }

    async setInitialEnabled(transactionId: string, id: string, userId: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.setInitialEnabled", transactionId);
        const widget = await this.get(transactionId, id);
        const cost = widget.widget_type?.cost ?? 1;
        const user = await this.userService.get(transactionId, userId);
        const baseQuota = PLAN_QUOTA[user.tier >= UserTier.PRO_TIER ? UserTier.PRO_TIER : UserTier.FREE_TIER];
        const quota = baseQuota + user.extra_widget_quota;
        const usedQuota = await this.widgetRepository.getEnabledQuotaUsed(transactionId, userId, [id]);
        const isEnabled = usedQuota + cost <= quota;
        logger.info({ message: "Setting initial enabled state", data: { id, cost, usedQuota, quota, isEnabled, extraQuota: user.extra_widget_quota } });
        await this.update(transactionId, id, userId, { enabled: isEnabled });
    }

    async delete(transactionId: string, id: string, userId: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.delete", transactionId);
        const existing = await this.widgetRepository.get(transactionId, id);
        if (!existing) {
            throw new NotFoundError("Widget not found");
        }
        await this.authorizeOwnership(transactionId, userId, existing.id);

        return this.widgetRepository.delete(transactionId, id);
    }

    async validateOverlayAccess(transactionId: string, userId: string, key: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.validateOverlayAccess", transactionId);
        logger.info({ message: "Validating overlay access", data: { userId } });
        try {
            const widget = await this.widgetRepository.getByOverlayKey(transactionId, key);
            if (!widget) {
                logger.warn({ message: "Widget not found", data: { userId } });
                return false;
            }
            if (widget.owner_id !== userId) {
                logger.warn({ message: "Unauthorized access attempt", data: { userId, widgetId: widget.id } });
                return false;
            }

            logger.info({ message: "Validating overlay access", data: { widget, key } });
            return widget.overlay_key === key;
        } catch (error) {
            logger.error({ message: "Failed to validate overlay access", error: error as Error, data: { userId } });
            return false;
        }
    }

    async get(transactionId: string, widgetId: string): Promise<ExtendedWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.get", transactionId);
        const cacheKey = `widget:${widgetId}`;
        const cachedWidget = await redis.get(cacheKey);
        if (cachedWidget) {
            return JSON.parse(cachedWidget);
        }

        const widget = await this.widgetRepository.get(transactionId, widgetId);
        if (!widget) {
            throw new NotFoundError("Widget not found");
        }

        await redis.set(cacheKey, JSON.stringify(widget), TTL.ONE_DAY);
        return widget;
    }

    async list(transactionId: string, ownerId: string, pagination: Pagination, filters?: ListWidgetFilters): Promise<ListResponse<ExtendedWidget>> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.list", transactionId);
        logger.info({ message: "Listing widgets by owner ID", data: { ownerId } });
        const [widgets, total] = await this.widgetRepository.listByOwnerId(transactionId, ownerId, pagination, filters);
        logger.info({ message: "Widgets listed successfully", data: { widgets, total } });
        return {
            data: widgets,
            pagination: {
                ...pagination,
                total: total
            }
        };
    }

    async getTotalByOwnerId(transactionId: string, ownerId: string, filters?: ListWidgetFilters): Promise<number> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.getTotalByOwnerId", transactionId);
        const total = await this.list(transactionId, ownerId, { page: 1, limit: 1 }, filters);

        const res = total.pagination.total || 0;
        return res
    }

    async disableAll(transactionId: string, ownerId: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.disableAll", transactionId);
        logger.info({ message: "Disabling all widgets", data: { ownerId } });
        await this.widgetRepository.disableAll(transactionId, ownerId);
    }

    async refreshOverlayKey(transactionId: string, widgetId: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.refreshOverlayKey", transactionId);
        const newKey = crypto.randomUUID();
        await this.widgetRepository.updateOverlayKey(transactionId, widgetId, newKey);
    }

    async updateOverlayKey(transactionId: string, widgetId: string, overlayKey: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.updateOverlayKey", transactionId);
        await this.widgetRepository.updateOverlayKey(transactionId, widgetId, overlayKey);
    }

    async getFirstEnabled(transactionId: string, ownerId: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.getFirstEnabled", transactionId);
        const first = await this.widgetRepository.getFirstEnabled(transactionId, ownerId)
        if (!first) {
            throw new NotFoundError("Widget not found")
        }
        return first
    }

    async getQuota(transactionId: string, userId: string): Promise<{ total_quota: number; used_quota: number; remaining_quota: number }> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.getQuota", transactionId);
        logger.info({ message: "Fetching quota info", data: { userId } });
        const user = await this.userService.get(transactionId, userId);
        const baseQuota = PLAN_QUOTA[user.tier >= UserTier.PRO_TIER ? UserTier.PRO_TIER : UserTier.FREE_TIER];
        const total_quota = baseQuota + user.extra_widget_quota;
        const used_quota = await this.widgetRepository.getEnabledQuotaUsed(transactionId, userId);
        const remaining_quota = Math.max(0, total_quota - used_quota);
        return { total_quota, used_quota, remaining_quota };
    }

    async increaseTriggeredCount(transactionId: string, id: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.increaseTriggeredCount", transactionId);
        try {
            await this.widgetRepository.increaseTriggeredCount(transactionId, id)
            await redis.del(`widget:${id}`)
        } catch (err) {
            logger.error({ message: "Failed to increase Widget triggered count", data: { widgetId: id }, error: err as Error });
        }
    }
}