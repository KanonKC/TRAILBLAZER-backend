import EndCreditRepository from "@/repositories/endCredit/endCredit.repository";
import { EndCreditWidget } from "@/repositories/endCredit/response";
import TLogger, { Layer } from "@/logging/logger";
import { CreateEndCreditServiceRequest, UpdateEndCreditServiceRequest } from "./request";
import UserRepository from "@/repositories/user/user.repository";
import { NotFoundError, BadRequestError } from "@/errors";
import WidgetService from "../widget.service";
import { randomBytes, randomUUID } from "node:crypto";
import { createESTransport, twitchAppAPI } from "@/libs/twurple";
import AuthService from "../../auth/auth.service";
import { EndCreditSubscriptionError } from "./error";
import { TwitchChannelChatNotificationEventRequest } from "@/events/twitch/channelChatNotification/request";
import { TwitchChannelFollowEventRequest } from "@/events/twitch/channelFollow/request";
import { TwitchChannelBitsUseEventRequest } from "@/events/twitch/channelBitsUse/request";
import { parseRFC3339 } from "@/utils/time";
import { EndCreditViewerRecord } from "generated/prisma/client";
import { EnrichedEndCreditViewerRecord } from "./response";

interface EndCreditEventSubscription {
    eventType: string;
    route: string;
    subscribe: (twitchId: string, transport: ReturnType<typeof createESTransport>, authService: AuthService) => Promise<unknown>;
}

const END_CREDIT_EVENT_SUBSCRIPTIONS: EndCreditEventSubscription[] = [
    {
        eventType: "channel.follow",
        route: "/webhook/v1/twitch/event-sub/channel-follow",
        subscribe: async (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelFollowEvents(twitchId, transport),
    },
    // {
    //     eventType: "channel.subscribe",
    //     route: "/webhook/v1/twitch/event-sub/channel-subscribe",
    //     subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelSubscriptionEvents(twitchId, transport),
    // },
    // {
    //     eventType: "channel.raid",
    //     route: "/webhook/v1/twitch/event-sub/channel-raid",
    //     subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelRaidEventsTo(twitchId, transport),
    // },
    {
        eventType: "channel.bits.use",
        route: "/webhook/v1/twitch/event-sub/channel-bits-use",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelBitsUseEvents(twitchId, transport),
    },
    {
        eventType: "channel.chat.notification",
        route: "/webhook/v1/twitch/event-sub/channel-chat-notification",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelChatNotificationEvents(twitchId, transport),
    }
];

export default class EndCreditService {
    private readonly logger: TLogger;

    constructor(
        private readonly endCreditRepository: EndCreditRepository,
        private readonly userRepository: UserRepository,
        private readonly widgetService: WidgetService,
        private readonly authService: AuthService
    ) {
        this.logger = new TLogger(Layer.SERVICE);
    }

    async create(request: CreateEndCreditServiceRequest): Promise<EndCreditWidget> {
        this.logger.setContext("service.endCredit.create");
        this.logger.info({ message: "Creating end credit config", data: request });
        try {
            const user = await this.userRepository.get(request.userId);
            if (!user) {
                this.logger.warn({ message: "User not found for setup", data: request });
                throw new NotFoundError("User not found");
            }

            const existing = await this.endCreditRepository.getByOwnerId(user.id);
            if (existing) {
                this.logger.warn({ message: "End credit config already exists", data: request });
                throw new BadRequestError("End credit config already exists");
            }

            await this.subscribeToEndCreditEvents(user.twitch_id, user.id);

            const res = await this.endCreditRepository.create({
                twitch_id: user.twitch_id,
                owner_id: user.id,
                overlay_key: randomBytes(16).toString("hex"),
                followers_header: request.followers_header,
                subscribes_header: request.subscribes_header,
                raids_header: request.raids_header,
                bits_header: request.bits_header,
                viewers_header: request.viewers_header,
                is_show_viewer_avatars: request.is_show_viewer_avatars,
            });
            await this.widgetService.setInitialEnabled(res.widget_id, user.id);
            return res;
        } catch (error) {
            this.logger.error({ message: "Failed to create end credit widget", error: error as Error, data: request });
            throw error;
        }
    }

    async getByUserId(userId: string): Promise<EndCreditWidget> {
        this.logger.setContext("service.endCredit.getByUserId");
        this.logger.info({ message: "Fetching end credit config for user", data: { userId } });
        try {
            const res = await this.endCreditRepository.getByOwnerId(userId);
            if (!res) {
                throw new NotFoundError("End Credit config not found");
            }
            await this.widgetService.authorizeOwnership(userId, res.widget.id);
            return res;
        } catch (error) {
            this.logger.error({ message: "Failed to get end credit widget", error: error as Error, data: { userId } });
            throw error;
        }
    }

    async update(id: string, userId: string, request: UpdateEndCreditServiceRequest): Promise<EndCreditWidget> {
        this.logger.setContext("service.endCredit.update");
        this.logger.info({ message: "Updating end credit config", data: { id, userId, request } });
        try {
            const endCredit = await this.endCreditRepository.getById(id);
            if (!endCredit) {
                this.logger.warn({ message: "EndCredit widget not found", data: { id, userId } });
                throw new NotFoundError("End Credit config not found");
            }

            await this.widgetService.authorizeOwnership(userId, endCredit.widget.id);

            return await this.endCreditRepository.update(id, request);
        } catch (error) {
            this.logger.error({ message: "Failed to update end credit widget", error: error as Error, data: request });
            throw error;
        }
    }

    async delete(userId: string): Promise<void> {
        this.logger.setContext("service.endCredit.delete");
        this.logger.info({ message: "Deleting end credit config", data: { userId } });
        try {
            const endCredit = await this.endCreditRepository.getByOwnerId(userId).catch(() => null);
            if (!endCredit) {
                this.logger.info({ message: "End credit config not found, skip delete", data: { userId } });
                return;
            }

            await this.widgetService.authorizeOwnership(userId, endCredit.widget.id);

            await this.endCreditRepository.delete(endCredit.id);
        } catch (error) {
            this.logger.error({ message: "Failed to delete end credit widget", error: error as Error, data: { userId } });
            throw error;
        }
    }

    async refreshOverlayKey(userId: string): Promise<EndCreditWidget> {
        this.logger.setContext("service.endCredit.refreshOverlayKey");
        this.logger.info({ message: "Refreshing end credit overlay key", data: { userId } });
        try {
            const endCredit = await this.endCreditRepository.getByOwnerId(userId);
            if (!endCredit) {
                this.logger.warn({ message: "EndCredit widget not found", data: { userId } });
                throw new NotFoundError("End Credit config not found");
            }

            return await this.endCreditRepository.update(endCredit.id, {
                overlay_key: randomUUID()
            });
        } catch (error) {
            this.logger.error({ message: "Failed to refresh end credit overlay key", error: error as Error, data: { userId } });
            throw error;
        }
    }

    async getViewerRecordsForOverlay(userId: string, overlayKey: string): Promise<{ records: EnrichedEndCreditViewerRecord[]; config: EndCreditWidget }> {
        this.logger.setContext("service.endCredit.getViewerRecordsForOverlay");
        this.logger.info({ message: "Fetching end credit viewer records for overlay", data: { userId } });
        try {
            const isValid = await this.widgetService.validateOverlayAccess(userId, overlayKey);
            if (!isValid) {
                throw new NotFoundError("End Credit config not found");
            }
            const endCredit = await this.endCreditRepository.getByOwnerId(userId);
            if (!endCredit) {
                throw new NotFoundError("End Credit config not found");
            }
            const records = await this.endCreditRepository.getViewerRecordsByEndCreditId(endCredit.id);
            const enriched = await this.enrichRecordsWithTwitchProfile(records);
            return { records: enriched, config: endCredit };
        } catch (error) {
            this.logger.error({ message: "Failed to get end credit viewer records", error: error as Error, data: { userId } });
            throw error;
        }
    }

    private async enrichRecordsWithTwitchProfile(records: EndCreditViewerRecord[]): Promise<EnrichedEndCreditViewerRecord[]> {
        this.logger.setContext("service.endCredit.enrichRecordsWithTwitchProfile");
        const uniqueViewerIds = [...new Set(records.map(r => r.viewer_id))];
        if (uniqueViewerIds.length === 0) {
            return [];
        }

        const profileById = new Map<string, { displayName: string; profilePictureUrl: string }>();
        try {
            const users = await twitchAppAPI.users.getUsersByIds(uniqueViewerIds);
            for (const user of users) {
                profileById.set(user.id, { displayName: user.displayName, profilePictureUrl: user.profilePictureUrl });
            }
        } catch (error) {
            this.logger.error({ message: "Failed to fetch Twitch user profiles", error: error as Error, data: { count: uniqueViewerIds.length } });
        }

        return records.map(record => {
            const profile = profileById.get(record.viewer_id);
            return {
                ...record,
                display_name: profile?.displayName ?? null,
                avatar_url: profile?.profilePictureUrl ?? null,
            };
        });
    }

    async recordViewerAction(twitchId: string, viewerId: string, type: string, value: string, platformCreatedAt: Date): Promise<void> {
        this.logger.setContext("service.endCredit.recordViewerAction");
        try {
            const endCredit = await this.endCreditRepository.getByTwitchId(twitchId);
            if (!endCredit) {
                this.logger.warn({ message: "No end credit config for twitch_id", data: { twitchId } });
                return;
            }
            await this.endCreditRepository.createViewerRecord({
                end_credit_id: endCredit.id,
                viewer_id: viewerId,
                type,
                value,
                platform_created_at: platformCreatedAt,
            });
            this.logger.info({ message: "Recorded end credit viewer action", data: { twitchId, viewerId } });
        } catch (error) {
            this.logger.error({ message: "Failed to record viewer action", error: error as Error, data: { twitchId, viewerId } });
        }
    }

    private async subscribeToEndCreditEvents(twitchId: string, userId: string): Promise<void> {
        this.logger.setContext("service.endCredit.subscribeToEndCreditEvents");

        const userSubs = await twitchAppAPI.eventSub.getSubscriptionsForUser(twitchId);
        const enabledSubs = userSubs.data.filter(sub => sub.status === "enabled");

        for (const { eventType, route, subscribe } of END_CREDIT_EVENT_SUBSCRIPTIONS) {
            const existingSub = enabledSubs.filter(sub => sub.type === eventType);
            if (existingSub.length > 0) {
                this.logger.info({ message: "Already subscribed to EventSub type, skipping", data: { userId, twitchId, eventType } });
                continue;
            }

            try {
                const transport = createESTransport(route);
                await subscribe(twitchId, transport, this.authService);
                this.logger.info({ message: "Subscribed to EventSub type", data: { userId, twitchId, eventType } });
            } catch (error) {
                this.logger.error({ message: "Failed to subscribe to EventSub type", error: error as Error, data: { userId, twitchId, eventType } });
                throw new EndCreditSubscriptionError(eventType);
            }
        }
    }

    async handleTwitchChannelChatNotificationEvent(event: TwitchChannelChatNotificationEventRequest): Promise<void> {

        const now = new Date()
        let type = ""
        let value = ""

        if (event.notice_type === "sub" || event.notice_type === "resub") {
            type = "sub"
            value = String(event.sub?.duration_months || event.resub?.cumulative_months || 0)
        } else if (event.notice_type === "raid") {
            type = "raid"
            value = String(event.raid?.viewer_count || 0)
        }

        await this.recordViewerAction(event.broadcaster_user_id, event.chatter_user_id, type, value, now)
    }

    async handleTwitchChannelFollowEvent(event: TwitchChannelFollowEventRequest): Promise<void> {
        await this.recordViewerAction(event.broadcaster_user_id, event.user_id, "follow", "", parseRFC3339(event.followed_at))
    }

    async handleTwitchChannelBitsUseEvent(event: TwitchChannelBitsUseEventRequest): Promise<void> {
        const now = new Date()
        await this.recordViewerAction(event.broadcaster_user_id, event.user_id, "bit", String(event.bits), now)
    }

}
