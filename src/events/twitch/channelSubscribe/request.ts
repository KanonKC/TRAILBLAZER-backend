/**
 * @link https://dev.twitch.tv/docs/eventsub/eventsub-reference/#channel-subscribe-event
 */
export interface TwitchChannelSubscribeEventRequest {
    user_id: string;
    user_login: string;
    user_name: string;
    broadcaster_user_id: string;
    broadcaster_user_login: string;
    broadcaster_user_name: string;
    tier: string;
    is_gift: boolean;
}
