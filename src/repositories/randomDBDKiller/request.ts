export interface CreateRandomDBDKiller {
    twitch_id: string;
    owner_id: string;
    twitch_reward_id: string;
}

export interface UpdateRandomDBDKiller {
    twitch_reward_id?: string;
    killer_pool?: string[];
}
