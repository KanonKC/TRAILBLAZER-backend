export interface UpdateTwitchTokenRequest {
    twitch_refresh_token?: string | null;
    twitch_token_expires_at?: Date | null;
    twitch_gql_token?: string | null;
}