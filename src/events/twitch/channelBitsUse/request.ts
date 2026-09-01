/**
 * @link https://dev.twitch.tv/docs/eventsub/eventsub-reference/#channel-bits-use-event
 */
export interface TwitchChannelBitsUseEventRequest {
    user_id: string;
    user_login: string;
    user_name: string;
    broadcaster_user_id: string;
    broadcaster_user_login: string;
    broadcaster_user_name: string;
    bits: number;
    type: string;
    message?: unknown;
}
