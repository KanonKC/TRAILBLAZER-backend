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
}

export interface CreateEndCreditViewerRecord {
    end_credit_id: string;
    viewer_id: string;
    action: object;
    platform_created_at: Date;
}
