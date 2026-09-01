/**
 * @link https://dev.twitch.tv/docs/eventsub/eventsub-reference/#channel-follow-event
 */
export interface TwitchChannelFollowEventRequest {
    user_id: string;
    user_login: string;
    user_name: string;
    broadcaster_user_id: string;
    broadcaster_user_login: string;
    broadcaster_user_name: string;
    followed_at: string;
}
