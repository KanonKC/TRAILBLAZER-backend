import { createESTransport, twitchAppAPI } from "@/libs/twurple";
import { TwitchEventType } from "./constant";

export interface TwitchEventDefinition {
    type: TwitchEventType;
    route: string;
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
        route: "/webhook/v1/twitch/event-sub/channel-redemption-add",
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
