import crypto from "crypto";
import { FastifyReply, FastifyRequest } from "fastify";
import TLogger, { Layer } from "@/logging/logger";
import { AccessToken, verifyToken } from "@/libs/jwt";
import { setAuthCookies } from "@/libs/cookies";
import { UnauthorizedError } from "@/errors";
import UserService from "@/services/user/user.service";
import config from "@/config";

const logger = new TLogger(Layer.MIDDLEWARE);

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

/**
 * Canonical auth check: verifies the access token (cookie or Authorization
 * header) and, if it is missing/expired, transparently refreshes it using
 * the refresh-token cookie before failing. This is what makes endpoints
 * like GET /api/v1/user/me resilient to the access token's 15-minute expiry
 * instead of one-shot 401ing on it.
 */
export class AuthMiddleware {
    private readonly userService: UserService;

    constructor(userService: UserService) {
        this.userService = userService;
    }

    private verifyAccessToken(token: string): AccessToken | null {
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

    async authenticate(req: FastifyRequest, res: FastifyReply, opts?: { required?: boolean }): Promise<AccessToken | null> {
        logger.setContext("middleware.auth.authenticate");
        const required = opts?.required ?? true;

        const token = extractToken(req);
        const decoded = token ? this.verifyAccessToken(token) : null;
        if (decoded) return decoded;

        const refreshToken = req.cookies.refreshToken;
        if (refreshToken) {
            try {
                const tokens = await this.userService.refreshToken(refreshToken);
                setAuthCookies(res, tokens);
                const refreshed = this.verifyAccessToken(tokens.accessToken);
                if (refreshed) return refreshed;
            } catch (e) {
                logger.warn({ message: "Transparent token refresh failed", error: e as string | Error });
            }
        }

        if (required) {
            res.status(401).send(new UnauthorizedError().toJSON());
        }
        return null;
    }
}
