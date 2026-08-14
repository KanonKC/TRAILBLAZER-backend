enum CacheKeyPrefix {
    TWITCH_ACCESS_TOKEN = "auth:twitch_access_token:twitch_id:v2"
}

export class CacheKey {
    static generateTwitchAccessTokenKey(twitchId: string): string {
        return `${CacheKeyPrefix.TWITCH_ACCESS_TOKEN}:${twitchId}`
    }
}