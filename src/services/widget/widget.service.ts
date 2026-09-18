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

    async authorizeOwnership(userId: string, widgetId: string, transactionId?: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.authorizeOwnership", transactionId);
        const widget = await this.get(widgetId, transactionId);
        if (widget.owner_id !== userId) {
            logger.warn({ message: "You are not the owner of this widget", data: { userId, widgetId: widget.id } });
            throw new ForbiddenError("You are not the owner of this widget");
        }
    }

    async authorizeTierUsage(userId: string, widgetId?: string, isEnabling?: boolean, transactionId?: string) {
        let logger: TLogger = this.logger;
        try {
            logger = this.logger.setContext("service.widget.authorizeTierUsage", transactionId);

            if (isEnabling === false) return; // Disabling is always allowed

            const user = await this.userService.get(userId, transactionId);
            const baseQuota = PLAN_QUOTA[user.tier >= UserTier.PRO_TIER ? UserTier.PRO_TIER : UserTier.FREE_TIER];
            const quota = baseQuota + user.extra_widget_quota;

            let currentWidgetCost = 1;
            let willBeEnabled: boolean = isEnabling ?? true;

            if (widgetId) {
                const currentWidget = await this.get(widgetId, transactionId);
                currentWidgetCost = currentWidget.widget_type?.cost ?? 1;
                willBeEnabled = isEnabling ?? currentWidget.enabled;
            }

            if (!willBeEnabled) return; // Disabling — skip quota check

            const usedQuota = await this.widgetRepository.getEnabledQuotaUsed(userId, widgetId ? [widgetId] : [], transactionId);
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

    async update(id: string, userId: string, request: UpdateWidget, transactionId?: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.update", transactionId);
        const existing = await this.widgetRepository.get(id, transactionId);
        if (!existing) {
            throw new NotFoundError("Widget not found");
        }
        await this.authorizeOwnership(userId, existing.id, transactionId);
        const res = await this.widgetRepository.update(id, request, transactionId);
        await redis.del(`widget:${id}`)
        await redis.del(`widget:total:owner:${userId}`)
        return res
    }

    async updateEnable(id: string, userId: string, value: boolean, transactionId?: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.updateEnable", transactionId);
        logger.info({ message: "Updating widget enabled status", data: { id, userId, value } });

        await this.authorizeTierUsage(userId, id, value, transactionId);
        return this.update(id, userId, { enabled: value }, transactionId);
    }

    async setInitialEnabled(id: string, userId: string, transactionId?: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.setInitialEnabled", transactionId);
        const widget = await this.get(id, transactionId);
        const cost = widget.widget_type?.cost ?? 1;
        const user = await this.userService.get(userId, transactionId);
        const baseQuota = PLAN_QUOTA[user.tier >= UserTier.PRO_TIER ? UserTier.PRO_TIER : UserTier.FREE_TIER];
        const quota = baseQuota + user.extra_widget_quota;
        const usedQuota = await this.widgetRepository.getEnabledQuotaUsed(userId, [id], transactionId);
        const isEnabled = usedQuota + cost <= quota;
        logger.info({ message: "Setting initial enabled state", data: { id, cost, usedQuota, quota, isEnabled, extraQuota: user.extra_widget_quota } });
        await this.update(id, userId, { enabled: isEnabled }, transactionId);
    }

    async delete(id: string, userId: string, transactionId?: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.delete", transactionId);
        const existing = await this.widgetRepository.get(id, transactionId);
        if (!existing) {
            throw new NotFoundError("Widget not found");
        }
        await this.authorizeOwnership(userId, existing.id, transactionId);

        return this.widgetRepository.delete(id, transactionId);
    }

    async validateOverlayAccess(userId: string, key: string, transactionId?: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.validateOverlayAccess", transactionId);
        logger.info({ message: "Validating overlay access", data: { userId } });
        try {
            const widget = await this.widgetRepository.getByOverlayKey(key, transactionId);
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

    async get(widgetId: string, transactionId?: string): Promise<ExtendedWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.get", transactionId);
        const cacheKey = `widget:${widgetId}`;
        const cachedWidget = await redis.get(cacheKey);
        if (cachedWidget) {
            return JSON.parse(cachedWidget);
        }

        const widget = await this.widgetRepository.get(widgetId, transactionId);
        if (!widget) {
            throw new NotFoundError("Widget not found");
        }

        await redis.set(cacheKey, JSON.stringify(widget), TTL.ONE_DAY);
        return widget;
    }

    async list(ownerId: string, pagination: Pagination, filters?: ListWidgetFilters, transactionId?: string): Promise<ListResponse<ExtendedWidget>> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.list", transactionId);
        logger.info({ message: "Listing widgets by owner ID", data: { ownerId } });
        const [widgets, total] = await this.widgetRepository.listByOwnerId(ownerId, pagination, filters, transactionId);
        logger.info({ message: "Widgets listed successfully", data: { widgets, total } });
        return {
            data: widgets,
            pagination: {
                ...pagination,
                total: total
            }
        };
    }

    async getTotalByOwnerId(ownerId: string, filters?: ListWidgetFilters, transactionId?: string): Promise<number> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.getTotalByOwnerId", transactionId);
        const total = await this.list(ownerId, { page: 1, limit: 1 }, filters, transactionId);

        const res = total.pagination.total || 0;
        return res
    }

    async disableAll(ownerId: string, transactionId?: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.disableAll", transactionId);
        logger.info({ message: "Disabling all widgets", data: { ownerId } });
        await this.widgetRepository.disableAll(ownerId, transactionId);
    }

    async refreshOverlayKey(widgetId: string, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.refreshOverlayKey", transactionId);
        const newKey = crypto.randomUUID();
        await this.widgetRepository.updateOverlayKey(widgetId, newKey, transactionId);
    }

    async updateOverlayKey(widgetId: string, overlayKey: string, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.updateOverlayKey", transactionId);
        await this.widgetRepository.updateOverlayKey(widgetId, overlayKey, transactionId);
    }

    async getFirstEnabled(ownerId: string, transactionId?: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.getFirstEnabled", transactionId);
        const first = await this.widgetRepository.getFirstEnabled(ownerId, transactionId)
        if (!first) {
            throw new NotFoundError("Widget not found")
        }
        return first
    }

    async getQuota(userId: string, transactionId?: string): Promise<{ total_quota: number; used_quota: number; remaining_quota: number }> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.getQuota", transactionId);
        logger.info({ message: "Fetching quota info", data: { userId } });
        const user = await this.userService.get(userId, transactionId);
        const baseQuota = PLAN_QUOTA[user.tier >= UserTier.PRO_TIER ? UserTier.PRO_TIER : UserTier.FREE_TIER];
        const total_quota = baseQuota + user.extra_widget_quota;
        const used_quota = await this.widgetRepository.getEnabledQuotaUsed(userId, undefined, transactionId);
        const remaining_quota = Math.max(0, total_quota - used_quota);
        return { total_quota, used_quota, remaining_quota };
    }

    async increaseTriggeredCount(id: string, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widget.increaseTriggeredCount", transactionId);
        try {
            await this.widgetRepository.increaseTriggeredCount(id, transactionId)
            await redis.del(`widget:${id}`)
        } catch (err) {
            logger.error({ message: "Failed to increase Widget triggered count", data: { widgetId: id }, error: err as Error });
        }
    }
}