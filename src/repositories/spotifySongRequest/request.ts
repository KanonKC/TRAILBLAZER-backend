export interface CreateSpotifySongRequest {
    twitch_id: string;
    owner_id: string;
    overlay_key: string;
    twitchRewardId?: string;
    twitchBotId?: string;
    invalidMessage?: string;
    successMessage?: string;
    noActiveMessage?: string;
}

export interface UpdateSpotifySongRequest {
    twitch_reward_id?: string | null;
    twitch_bot_id?: string | null;
    invalid_message?: string | null;
    success_message?: string | null;
    noActiveMessage?: string | null;
    overlay_key?: string;
}
