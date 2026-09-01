export interface CreateEndCreditServiceRequest {
    userId: string;
    followers_header?: string | null;
    subscribes_header?: string | null;
    raids_header?: string | null;
    bits_header?: string | null;
    viewers_header?: string | null;
    is_show_viewer_avatars?: boolean;
    scroll_speed?: number;
    is_show_followers?: boolean;
    is_show_subs?: boolean;
    is_show_raids?: boolean;
    is_show_bits?: boolean;
    is_show_sub_months?: boolean;
    is_show_raid_count?: boolean;
    is_show_bits_amount?: boolean;
}

export interface UpdateEndCreditServiceRequest {
    followers_header?: string | null;
    subscribes_header?: string | null;
    raids_header?: string | null;
    bits_header?: string | null;
    viewers_header?: string | null;
    is_show_viewer_avatars?: boolean;
    scroll_speed?: number;
    is_show_followers?: boolean;
    is_show_subs?: boolean;
    is_show_raids?: boolean;
    is_show_bits?: boolean;
    is_show_sub_months?: boolean;
    is_show_raid_count?: boolean;
    is_show_bits_amount?: boolean;
}
