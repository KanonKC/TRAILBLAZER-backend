/**
 * @link https://dev.twitch.tv/docs/eventsub/eventsub-reference/#channel-raid-event
 */
export interface TwitchChannelRaidEventRequest {
    from_broadcaster_user_id: string;
    from_broadcaster_user_login: string;
    from_broadcaster_user_name: string;
    to_broadcaster_user_id: string;
    to_broadcaster_user_login: string;
    to_broadcaster_user_name: string;
    viewers: number;
}
