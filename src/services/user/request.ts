export interface LoginRequest {
    code: string;
    state: string;
    scope: string[];
    ref?: string;
}

export interface GetTierOptions {
    forceTwitch?: boolean;
}

export interface UpdateUserTierRequest {
    tier: number;
    expiredAt?: Date | null;
}