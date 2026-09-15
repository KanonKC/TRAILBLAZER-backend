import { FastifyReply } from "fastify";
import config from "@/config";
import { TTL } from "./redis";

// Cookie lifetimes are derived from the same TTL constants backing the Redis
// refresh-token key, so the cookie can never outlive (or expire well before)
// the token it represents.
export const ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS = TTL.QUARTER_HOUR.expiration.value;
export const REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS = TTL.ONE_WEEK.expiration.value;

const baseCookieOptions = {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    domain: config.rootDomain
};

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

export function setAuthCookies(res: FastifyReply, tokens: AuthTokens): void {
    res.setCookie("accessToken", tokens.accessToken, {
        ...baseCookieOptions,
        maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS
    });

    res.setCookie("refreshToken", tokens.refreshToken, {
        ...baseCookieOptions,
        maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS
    });
}

export function clearAuthCookies(res: FastifyReply): void {
    res.clearCookie("accessToken", { path: "/" });
    res.clearCookie("refreshToken", { path: "/" });
}
