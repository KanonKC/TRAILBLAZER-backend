import { WidgetTypeSlug } from "@/services/widget/constant";

export interface CreateFirstWord {
    twitch_id: string;
    owner_id: string;
    reply_message?: string | null;
    overlay_key: string;
    twitch_bot_id?: string | null;
}

export interface UpdateFirstWord {
    reply_message?: string | null;
    enabled?: boolean;
    audio_key?: string | null;
    overlay_key?: string;
    twitch_bot_id?: string | null;
    audio_volume?: number;
}

export interface AddChatter {
    first_word_id: string;
    twitch_chatter_id: string;
    twitch_channel_id: string;
}

export interface CreateCustomReply {
    first_word_id: string;
    twitch_chatter_id: string;
    twitch_chatter_username: string;
    twitch_chatter_avatar_url: string;
    reply_message?: string | null;
    audio_key?: string | null;
    audio_volume?: number;
}

export interface UpdateCustomReply {
    twitch_chatter_id?: string;
    twitch_chatter_username?: string;
    twitch_chatter_avatar_url?: string;
    reply_message?: string | null;
    audio_key?: string | null;
    audio_volume?: number;
}

export interface ListCustomerReplyRequest {
    first_word_id: string;
    search?: string;
}