import { createESTransport, twitchAppAPI } from "@/libs/twurple";

export interface TwitchEventDefinition {
    type: string;
    route: string;
    subscribe: (twitchId: string, transport: ReturnType<typeof createESTransport>) => Promise<unknown>;
}

export const TWITCH_EVENT_DEFINITIONS: TwitchEventDefinition[] = [
    {
        type: "stream.online",
        route: "/webhook/v1/twitch/event-sub/stream-online",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToStreamOnlineEvents(twitchId, transport),
    },
    {
        type: "stream.offline",
        route: "/webhook/v1/twitch/event-sub/stream-offline",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToStreamOfflineEvents(twitchId, transport),
    },
    {
        type: "channel.follow",
        route: "/webhook/v1/twitch/event-sub/channel-follow",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelFollowEvents(twitchId, transport),
    },
    {
        type: "channel.subscribe",
        route: "/webhook/v1/twitch/event-sub/channel-subscribe",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelSubscriptionEvents(twitchId, transport),
    },
    {
        type: "channel.raid",
        route: "/webhook/v1/twitch/event-sub/channel-raid",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelRaidEventsFrom(twitchId, transport),
    },
    {
        type: "channel.channel_points_custom_reward_redemption.add",
        route: "/webhook/v1/twitch/event-sub/channel-redemption-add",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelRedemptionAddEvents(twitchId, transport),
    },
    {
        type: "channel.bits.use",
        route: "/webhook/v1/twitch/event-sub/channel-bits-use",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelBitsUseEvents(twitchId, transport),
    },
    {
        type: "channel.chat.message",
        route: "/webhook/v1/twitch/event-sub/channel-chat-message",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelChatMessageEvents(twitchId, transport),
    },
    {
        type: "channel.chat.notification",
        route: "/webhook/v1/twitch/event-sub/channel-chat-notification",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelChatNotificationEvents(twitchId, transport),
    },
];
