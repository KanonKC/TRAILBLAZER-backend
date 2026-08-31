export interface CreateEndCredit {
    twitch_id: string;
    overlay_key: string;
    owner_id: string;
    followers_header?: string | null;
    subscribes_header?: string | null;
    raids_header?: string | null;
    bits_header?: string | null;
    viewers_header?: string | null;
    is_show_viewer_avatars?: boolean;
    scroll_speed?: number;
    is_show_sub_months?: boolean;
    is_show_raid_count?: boolean;
    is_show_bits_amount?: boolean;
}

export interface CreateEndCreditViewerRecord {
    end_credit_id: string;
    viewer_id: string;
    type: string;
    value: string;
    platform_created_at: Date;
}

export interface UpdateEndCredit {
    followers_header?: string | null;
    subscribes_header?: string | null;
    raids_header?: string | null;
    bits_header?: string | null;
    viewers_header?: string | null;
    is_show_viewer_avatars?: boolean;
    scroll_speed?: number;
    is_show_sub_months?: boolean;
    is_show_raid_count?: boolean;
    is_show_bits_amount?: boolean;
    overlay_key?: string;
}
