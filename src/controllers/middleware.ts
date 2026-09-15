import { FastifyReply, FastifyRequest } from "fastify";
import TLogger, { Layer } from "@/logging/logger";
import { AccessToken, verifyToken, AdminAccessToken, verifyAdminToken } from "@/libs/jwt";
import { setAuthCookies, setAdminAuthCookies } from "@/libs/cookies";
import { UnauthorizedError } from "@/errors";
import UserService from "@/services/user/user.service";
import AdminAuthService from "@/services/adminAuth/adminAuth.service";

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

function extractAdminToken(req: FastifyRequest): string | undefined {
    if (req.cookies.adminAccessToken) {
        return req.cookies.adminAccessToken;
    }
    if (req.headers.authorization) {
        return req.headers.authorization.split(" ")[1];
    }
    return undefined;
}

export function getAdminFromRequest(req: FastifyRequest): AdminAccessToken | null {
    logger.setContext("middleware.auth.getAdminFromRequest");
    const token = extractAdminToken(req);

    if (!token) return null;

    try {
        const decoded = verifyAdminToken(token);
        if (typeof decoded === 'string') {
            logger.warn({ message: "decoded admin token is string", data: { decoded } });
            return null;
        }
        return decoded;
    } catch (e) {
        return null;
    }
}

/**
 * Admin-equivalent of AuthMiddleware — verifies the admin access token
 * (cookie or Authorization header) and transparently refreshes it via the
 * admin refresh-token cookie if missing/expired. Entirely separate token
 * namespace/secret from the regular user AuthMiddleware.
 */
export class AdminAuthMiddleware {
    private readonly adminAuthService: AdminAuthService;

    constructor(adminAuthService: AdminAuthService) {
        this.adminAuthService = adminAuthService;
    }

    private verifyAccessToken(token: string): AdminAccessToken | null {
        try {
            const decoded = verifyAdminToken(token);
            if (typeof decoded === 'string') {
                logger.warn({ message: "decoded admin token is string", data: { decoded } });
                return null;
            }
            return decoded;
        } catch (e) {
            return null;
        }
    }

    async authenticate(req: FastifyRequest, res: FastifyReply, opts?: { required?: boolean }): Promise<AdminAccessToken | null> {
        logger.setContext("middleware.auth.authenticateAdmin");
        const required = opts?.required ?? true;

        const token = extractAdminToken(req);
        const decoded = token ? this.verifyAccessToken(token) : null;
        if (decoded) return decoded;

        const refreshToken = req.cookies.adminRefreshToken;
        if (refreshToken) {
            try {
                const tokens = await this.adminAuthService.refreshToken(refreshToken);
                setAdminAuthCookies(res, tokens);
                const refreshed = this.verifyAccessToken(tokens.accessToken);
                if (refreshed) return refreshed;
            } catch (e) {
                logger.warn({ message: "Transparent admin token refresh failed", error: e as string | Error });
            }
        }

        if (required) {
            res.status(401).send(new UnauthorizedError().toJSON());
        }
        return null;
    }
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
