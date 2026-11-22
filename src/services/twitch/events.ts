import config from "@/config";
import { createESTransport, twitchAppAPI } from "@/libs/twurple";
import { CHANNEL_REDEMPTION_ADD_V1_ROUTE, CHANNEL_REDEMPTION_ADD_V2_ROUTE } from "@/events/twitch/routePaths";
import { TwitchEventType } from "./constant";

export interface TwitchEventDefinition {
    type: TwitchEventType;
    /** The route new subscriptions are created with. */
    route: string;
    /**
     * Routes this event type used before `route`. Subscriptions still pointing at one are being migrated away from:
     * they never count as the current subscription, are kept until the current one is healthy, and are then deleted.
     */
    legacyRoutes?: readonly string[];
    subscribe: (twitchId: string, transport: ReturnType<typeof createESTransport>) => Promise<unknown>;
}

export const TWITCH_EVENT_DEFINITIONS: TwitchEventDefinition[] = [
    {
        type: TwitchEventType.STREAM_ONLINE,
        route: "/webhook/v1/twitch/event-sub/stream-online",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToStreamOnlineEvents(twitchId, transport),
    },
    {
        type: TwitchEventType.STREAM_OFFLINE,
        route: "/webhook/v1/twitch/event-sub/stream-offline",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToStreamOfflineEvents(twitchId, transport),
    },
    {
        type: TwitchEventType.CHANNEL_FOLLOW,
        route: "/webhook/v1/twitch/event-sub/channel-follow",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelFollowEvents(twitchId, transport),
    },
    {
        type: TwitchEventType.CHANNEL_SUBSCRIBE,
        route: "/webhook/v1/twitch/event-sub/channel-subscribe",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelSubscriptionEvents(twitchId, transport),
    },
    {
        type: TwitchEventType.CHANNEL_RAID,
        route: "/webhook/v1/twitch/event-sub/channel-raid",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelRaidEventsFrom(twitchId, transport),
    },
    {
        type: TwitchEventType.CHANNEL_REDEMPTION_ADD,
        // v2 verifies the Twitch signature. v1 is unverified and stays registered only until no subscription uses it.
        route: CHANNEL_REDEMPTION_ADD_V2_ROUTE,
        legacyRoutes: [CHANNEL_REDEMPTION_ADD_V1_ROUTE],
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelRedemptionAddEvents(twitchId, transport),
    },
    {
        type: TwitchEventType.CHANNEL_BITS_USE,
        route: "/webhook/v1/twitch/event-sub/channel-bits-use",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelBitsUseEvents(twitchId, transport),
    },
    {
        type: TwitchEventType.CHANNEL_CHAT_MESSAGE,
        route: "/webhook/v1/twitch/event-sub/channel-chat-message",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelChatMessageEvents(twitchId, transport),
    },
    {
        type: TwitchEventType.CHANNEL_CHAT_NOTIFICATION,
        route: "/webhook/v1/twitch/event-sub/channel-chat-notification",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelChatNotificationEvents(twitchId, transport),
    },
];

/** The callback URL Twitch is told to call, as stored on the subscription. */
export function getSubscriptionCallback(subscription: { _transport: unknown }): string {
    return (subscription._transport as { callback?: string } | undefined)?.callback ?? "";
}

/**
 * True when this deployment's subscription of `eventType` still calls a route that has since been replaced.
 * Subscriptions of other deployments (a different origin) are never legacy from our point of view.
 */
export function isLegacySubscription(subscription: { type: string; _transport: unknown }): boolean {
    const definition = TWITCH_EVENT_DEFINITIONS.find(candidate => candidate.type === subscription.type);
    if (!definition?.legacyRoutes) return false;
    const callback = getSubscriptionCallback(subscription);
    return definition.legacyRoutes.some(legacyRoute => callback === `${config.origin}${legacyRoute}`);
}
