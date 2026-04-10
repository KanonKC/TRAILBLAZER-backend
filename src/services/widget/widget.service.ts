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
import { UserTier } from "../user/constant";
import { WidgetQuotaLimitError } from "./error";
import { UpdateEnableOptions } from "./request";

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

    async authorizeOwnership(userId: string, widgetId: string) {
        const widget = await this.get(widgetId);
        if (widget.owner_id !== userId) {
            this.logger.warn({ message: "You are not the owner of this widget", data: { userId, widgetId: widget.id } });
            throw new ForbiddenError("You are not the owner of this widget");
        }
    }

    async authorizeTierUsage(userId: string, widgetId?: string, isEnabling?: boolean) {
        try {
            this.logger.setContext("WidgetService.authorizeTierUsage");

            if (isEnabling === false) return; // Disabling is always allowed

            const tier = await this.userService.getTier(userId);
            const limit = tier >= UserTier.PRO_TIER ? 9999 : 1;

            let otherActiveWidgetsCount = 0;

            if (widgetId) {
                // Modifying existing widget
                const currentWidget = await this.get(widgetId);
                if (!currentWidget) {
                    throw new NotFoundError(`Widget not found`);
                }

                const otherWidgetsFilter: ListWidgetFilters = { enabled: true, excludeIds: [widgetId] };
                const [_, count] = await this.widgetRepository.listByOwnerId(userId, { page: 1, limit: 1 }, otherWidgetsFilter);
                otherActiveWidgetsCount = count;

                const willBeEnabled = isEnabling ?? currentWidget.enabled;
                const resultingActiveWidgets = otherActiveWidgetsCount + (willBeEnabled ? 1 : 0);

                if (resultingActiveWidgets > limit) {
                    this.logger.warn({ message: `You need to upgrade your tier to use more widgets`, data: { userId, widgetId } });
                    throw new ForbiddenError(`You need to upgrade your tier to use more widgets`);
                }
            } else {
                // Creating new widget (defaults to enabled)
                const [_, count] = await this.widgetRepository.listByOwnerId(userId, { page: 1, limit: 1 }, { enabled: true });
                const resultingActiveWidgets = count + 1;

                if (resultingActiveWidgets > limit) {
                    this.logger.warn({ message: `You need to upgrade your tier to use more widgets`, data: { userId } });
                    throw new ForbiddenError(`You need to upgrade your tier to use more widgets`);
                }
            }
        } catch (error) {
            this.logger.error({ message: `Error authorizing tier usage`, error: error as Error });
            throw error;
        }
    }

    async update(id: string, userId: string, request: UpdateWidget) {
        this.logger.setContext("service.widget.update");
        const existing = await this.widgetRepository.get(id);
        if (!existing) {
            throw new NotFoundError("Widget not found");
        }
        await this.authorizeOwnership(userId, existing.id);
        const res = await this.widgetRepository.update(id, request);
        await redis.del(`widget:${id}`)
        await redis.del(`widget:total:owner:${userId}`)
        return res
    }

    async updateEnable(id: string, userId: string, value: boolean, options: UpdateEnableOptions) {
        this.logger.setContext("service.widget.updateEnable");
        this.logger.info({ message: "Updating widget enabled status", data: { id, userId, value, options } });

        if (options.forceUpdate && value === true) {
            await this.disableAll(userId)
        } else {
            try {
                await this.authorizeTierUsage(userId, id, value);
            } catch (error) {
                this.logger.error({ message: "Error authorizing tier usage", error: error as Error });
                if (error instanceof ForbiddenError) {
                    throw new WidgetQuotaLimitError();
                }
                throw error;
            }

        }
        return this.update(id, userId, { enabled: value });
    }

    async setInitialEnabled(id: string, userId: string) {
        this.logger.setContext("service.widget.setInitialEnabled");
        const activeCount = await this.getTotalByOwnerId(userId, { enabled: true, excludeIds: [id] })
        const user = await this.userService.get(userId)
        let isEnabled = !(user.tier === UserTier.FREE_TIER && activeCount >= 1)
        await this.update(id, userId, { enabled: isEnabled })
    }

    async delete(id: string, userId: string) {
        this.logger.setContext("service.widget.delete");
        const existing = await this.widgetRepository.get(id);
        if (!existing) {
            throw new NotFoundError("Widget not found");
        }
        await this.authorizeOwnership(userId, existing.id);

        return this.widgetRepository.delete(id);
    }

    async validateOverlayAccess(userId: string, key: string) {
        this.logger.setContext("service.widget.validateOverlayAccess");
        this.logger.info({ message: "Validating overlay access", data: { userId } });
        try {
            const widget = await this.widgetRepository.getByOverlayKey(key);
            if (!widget) {
                this.logger.warn({ message: "Widget not found", data: { userId } });
                return false;
            }
            if (widget.owner_id !== userId) {
                this.logger.warn({ message: "Unauthorized access attempt", data: { userId, widgetId: widget.id } });
                return false;
            }

            this.logger.info({ message: "Validating overlay access", data: { widget, key } });
            return widget.overlay_key === key;
        } catch (error) {
            this.logger.error({ message: "Failed to validate overlay access", error: error as Error, data: { userId } });
            return false;
        }
    }

    async get(widgetId: string) {
        this.logger.setContext("service.widget.get");
        const cacheKey = `widget:${widgetId}`;
        const cachedWidget = await redis.get(cacheKey);
        if (cachedWidget) {
            return JSON.parse(cachedWidget);
        }

        const widget = await this.widgetRepository.get(widgetId);
        if (!widget) {
            throw new NotFoundError("Widget not found");
        }

        await redis.set(cacheKey, JSON.stringify(widget), TTL.ONE_DAY);
        return widget;
    }

    async list(ownerId: string, pagination: Pagination, filters?: ListWidgetFilters): Promise<ListResponse<ExtendedWidget>> {
        this.logger.setContext("service.widget.list");
        this.logger.info({ message: "Listing widgets by owner ID", data: { ownerId } });
        const [widgets, total] = await this.widgetRepository.listByOwnerId(ownerId, pagination, filters);
        this.logger.info({ message: "Widgets listed successfully", data: { widgets, total } });
        return {
            data: widgets,
            pagination: {
                ...pagination,
                total: total
            }
        };
    }

    async getTotalByOwnerId(ownerId: string, filters?: ListWidgetFilters): Promise<number> {
        const total = await this.list(ownerId, { page: 1, limit: 1 }, filters);

        const res = total.pagination.total || 0;
        return res
    }

    async disableAll(ownerId: string) {
        this.logger.setContext("service.widget.disableAll");
        this.logger.info({ message: "Disabling all widgets", data: { ownerId } });
        await this.widgetRepository.disableAll(ownerId);
    }

    async refreshOverlayKey(widgetId: string): Promise<void> {
        const newKey = crypto.randomUUID();
        await this.widgetRepository.updateOverlayKey(widgetId, newKey);
    }

    async updateOverlayKey(widgetId: string, overlayKey: string): Promise<void> {
        await this.widgetRepository.updateOverlayKey(widgetId, overlayKey);
    }

    async getFirstEnabled(ownerId: string) {
        const first = await this.widgetRepository.getFirstEnabled(ownerId)
        if (!first) {
            throw new NotFoundError("Widget not found")
        }
        return first
    }
}