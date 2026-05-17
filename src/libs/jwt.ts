import crypto from "crypto";
import jwt from "jsonwebtoken";
import config from "@/config";

export interface AccessToken {
    id: string;
    twitchId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    tier: number;
    extraWidgetQuota: number;
}

const ACCESS_TOKEN_EXPIRY = "15m";

export function signAccessToken(payload: AccessToken): string {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function generateRefreshToken(): string {
    return crypto.randomBytes(40).toString("hex");
}

export function verifyToken(token: string): AccessToken {
    return jwt.verify(token, config.jwtSecret) as AccessToken;
}
