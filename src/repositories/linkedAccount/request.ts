export interface CreateLinkedAccountRequest {
    user_id: string;
    platform: string;
    platform_user_id: string;
    platform_username: string;
    platform_avatar_url: string | null;
    refresh_token: string | null;
    token_expires_at: Date | null;
}
