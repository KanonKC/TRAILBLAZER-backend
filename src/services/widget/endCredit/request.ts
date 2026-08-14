export interface CreateEndCreditServiceRequest {
    userId: string;
    followers_header?: string | null;
    subscribes_header?: string | null;
    raids_header?: string | null;
    bits_header?: string | null;
    viewers_header?: string | null;
    is_show_viewer_avatars?: boolean;
}

export interface UpdateEndCreditServiceRequest {
    followers_header?: string | null;
    subscribes_header?: string | null;
    raids_header?: string | null;
    bits_header?: string | null;
    viewers_header?: string | null;
    is_show_viewer_avatars?: boolean;
}
