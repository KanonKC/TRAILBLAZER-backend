import crypto from "crypto";
import { prisma } from "@/libs/prisma";
import redis from "@/libs/redis";
import { FastifyReply, FastifyRequest } from "fastify";
import TLogger, { Layer } from "@/logging/logger";
import { AccessToken, generateRefreshToken, signAccessToken, verifyToken } from "@/libs/jwt";
import config from "@/config";

const logger = new TLogger(Layer.MIDDLEWARE);

const REFRESH_TOKEN_EXPIRY = 60 * 60 * 24 * 30; // 30 days (seconds)
const COOKIE_MAX_AGE_ACCESS = 60 * 15; // 15 minutes (seconds)
const COOKIE_MAX_AGE_REFRESH = 60 * 60 * 24 * 30; // 30 days (seconds)

function extractToken(req: FastifyRequest): string | undefined {
    if (req.cookies.accessToken) {
        return req.cookies.accessToken;
    }
    if (req.headers.authorization) {
        return req.headers.authorization.split(" ")[1];
    }
    return undefined;
}

export function getUserFromRequest(req: FastifyRequest): AccessToken | null {
    logger.setContext("middleware.auth.getUserFromRequest");
    const token = extractToken(req);

    if (!token) return null;

    try {
        const decoded = verifyToken(token);
        if (typeof decoded === 'string') {
            logger.warn({ message: "decoded token is string", data: { decoded } });
            return null;
        }
        return decoded;
    } catch (e) {
        return null;
    }
}

export function authenticateAdmin(req: FastifyRequest): boolean {
    const token = req.headers['x-api-key'] as string
    const secret = config.admin.apiKey

    if (!token || !secret) {
        return false;
    }

    const tokenBuffer = Buffer.from(token);
    const secretBuffer = Buffer.from(secret);

    if (tokenBuffer.length !== secretBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(tokenBuffer, secretBuffer);
}

async function refresh(refreshToken: string) {
    logger.setContext("middleware.auth.refresh");
    if (!refreshToken) {
        throw new Error("No refresh token");
    }

    try {
        const userId = await redis.get(`refresh_token:${refreshToken}`);

        if (!userId) {
            throw new Error("Invalid refresh token");
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new Error("User not found");
        }


        const newAccessToken = signAccessToken({
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            avatarUrl: user.avatar_url,
            twitchId: user.twitch_id,
            tier: user.tier,
            extraWidgetQuota: user.extra_widget_quota
        });
        const newRefreshToken = generateRefreshToken();

        await redis.del(`refresh_token:${refreshToken}`);
        await redis.set(`refresh_token:${newRefreshToken}`, user.id, { EX: REFRESH_TOKEN_EXPIRY });

        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (err) {
        logger.error({ message: "Token refresh failed", error: err as string | Error });
        throw new Error("Invalid refresh token");
    }
}

export async function authenticationRequired(req: FastifyRequest, res: FastifyReply) {
    logger.setContext("middleware.auth.authenticationRequired");
    let token = extractToken(req);

    if (!token) {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            logger.warn({ message: "No access or refresh token" });
            res.status(401).send({ error: "Unauthorized" });
            return;
        }

        try {
            const newTokens = await refresh(refreshToken);

            res.setCookie('accessToken', newTokens.accessToken, {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                domain: config.rootDomain,
                maxAge: COOKIE_MAX_AGE_ACCESS
            });

            res.setCookie('refreshToken', newTokens.refreshToken, {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                domain: config.rootDomain,
                maxAge: COOKIE_MAX_AGE_REFRESH
            });

            token = newTokens.accessToken;
        } catch (e) {
            logger.error({ message: "Refresh failed", error: e as string | Error });
            res.status(401).send({ error: "Unauthorized" });
            return;
        }
    }

    try {
        const decoded = verifyToken(token!); // Token is guaranteed to be string here because of logic above
        if (typeof decoded === 'string') {
            logger.warn({ message: "decoded token is string", data: { decoded } });
            res.status(401).send({ error: "Unauthorized" });
            return;
        }
        return decoded as { id: string, twitchId: string };
    } catch (e) {
        logger.error({ message: "Token verification failed", error: e as string | Error });
        res.status(401).send({ error: "Unauthorized" });
        return;
    }
}
