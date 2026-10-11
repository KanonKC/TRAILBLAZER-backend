import { WidgetTypeSlug } from "@/services/constant";

export enum TwitchEventType {
    STREAM_ONLINE = "stream.online",
    STREAM_OFFLINE = "stream.offline",
    CHANNEL_FOLLOW = "channel.follow",
    CHANNEL_SUBSCRIBE = "channel.subscribe",
    CHANNEL_RAID = "channel.raid",
    CHANNEL_REDEMPTION_ADD = "channel.channel_points_custom_reward_redemption.add",
    CHANNEL_BITS_USE = "channel.bits.use",
    CHANNEL_CHAT_MESSAGE = "channel.chat.message",
    CHANNEL_CHAT_NOTIFICATION = "channel.chat.notification",
}

/**
 * Single source of truth: which Twitch EventSub event types each widget needs.
 * Typed as Record<WidgetTypeSlug, ...> so adding a new widget slug fails to compile until it is mapped here.
 * Widgets without a Twitch event dependency map to an empty list.
 */
export const WIDGET_EVENT_TYPES: Record<WidgetTypeSlug, readonly TwitchEventType[]> = {
    [WidgetTypeSlug.FIRST_WORD]: [
        TwitchEventType.CHANNEL_CHAT_MESSAGE,
        TwitchEventType.STREAM_ONLINE,
        TwitchEventType.STREAM_OFFLINE,
    ],
    [WidgetTypeSlug.CLIP_SHOUTOUT]: [TwitchEventType.CHANNEL_CHAT_NOTIFICATION],
    [WidgetTypeSlug.RANDOM_DBD_PERK]: [TwitchEventType.CHANNEL_REDEMPTION_ADD],
    [WidgetTypeSlug.RANDOM_DBD_KILLER]: [TwitchEventType.CHANNEL_REDEMPTION_ADD],
    // handleDropImage runs from the chat message webhook, redemptions trigger the drop
    [WidgetTypeSlug.DROP_IMAGE]: [TwitchEventType.CHANNEL_CHAT_MESSAGE, TwitchEventType.CHANNEL_REDEMPTION_ADD],
    [WidgetTypeSlug.EXPORT_VIDEO]: [TwitchEventType.STREAM_OFFLINE],
    [WidgetTypeSlug.SPOTIFY_SONG_REQUEST]: [TwitchEventType.CHANNEL_CHAT_MESSAGE],
    [WidgetTypeSlug.END_CREDIT]: [
        TwitchEventType.CHANNEL_FOLLOW,
        TwitchEventType.STREAM_ONLINE,
        // Outgoing raid — the streamer raids someone else, which triggers the credit roll
        TwitchEventType.CHANNEL_RAID,
        TwitchEventType.CHANNEL_BITS_USE,
        TwitchEventType.CHANNEL_CHAT_NOTIFICATION,
    ],
};

/** Event types some widget can require. The health check only manages (creates/deletes) these; any other type is left alone. */
export const WIDGET_MANAGED_EVENT_TYPES: ReadonlySet<TwitchEventType> = new Set(Object.values(WIDGET_EVENT_TYPES).flat());
