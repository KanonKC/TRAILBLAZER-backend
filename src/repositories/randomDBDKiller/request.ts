export enum RandomDBDKillerAnimationStyle {
    SLOT = "slot",
    FLIP = "flip",
    ROULETTE = "roulette"
}

export interface CreateRandomDBDKiller {
    twitch_id: string;
    owner_id: string;
    twitch_reward_id?: string;
    overlay_key: string;
}

export interface CreateRandomDBDKillerInput {
    twitch_id: string;
    owner_id: string;
    twitch_reward_id?: string;
}

export interface UpdateRandomDBDKiller {
    twitch_reward_id?: string;
    killer_pool?: string[];
    animation_style?: RandomDBDKillerAnimationStyle;
}
