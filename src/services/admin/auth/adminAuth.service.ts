import Configurations from "@/config/index";
import redis, { TTL } from "@/libs/redis";
import TLogger, { Layer } from "@/logging/logger";
import { generateRefreshToken, signAdminAccessToken } from "@/libs/jwt";
import { ForbiddenError, UnauthorizedError } from "@/errors";
import AdminAuthRepository from "@/repositories/adminAuth/adminAuth.repository";
import { AdminUser } from "generated/prisma/client";
import { Google, OAuth2RequestError, ArcticFetchError, decodeIdToken, generateState, generateCodeVerifier } from "arctic";

const GOOGLE_SCOPES = ["openid", "email", "profile"];

interface GoogleIdTokenClaims {
    sub: string;
    email: string;
    name: string;
    picture?: string;
}

export default class AdminAuthService {
    private readonly cfg: Configurations;
    private readonly adminAuthRepository: AdminAuthRepository;
    private readonly googleOAuth: Google;
    private readonly logger: TLogger;

    constructor(cfg: Configurations, adminAuthRepository: AdminAuthRepository, googleOAuth: Google) {
        this.cfg = cfg;
        this.adminAuthRepository = adminAuthRepository;
        this.googleOAuth = googleOAuth;
        this.logger = new TLogger(Layer.SERVICE);
    }

    async buildGoogleAuthUrl(transactionId: string): Promise<string> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.adminAuth.buildGoogleAuthUrl", transactionId);
        const state = generateState();
        const codeVerifier = generateCodeVerifier();

        await redis.set(`admin_oauth_state:${state}`, codeVerifier, TTL.FIVE_MINUTES);

        const url = this.googleOAuth.createAuthorizationURL(state, codeVerifier, GOOGLE_SCOPES);
        url.searchParams.set("access_type", "offline");
        return url.toString();
    }

    async handleGoogleCallback(transactionId: string, code: string, state: string): Promise<{ admin: AdminUser, accessToken: string, refreshToken: string }> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.adminAuth.handleGoogleCallback", transactionId);

        const codeVerifier = await redis.get(`admin_oauth_state:${state}`);
        if (!codeVerifier) {
            logger.warn({ message: "Missing or expired OAuth state" });
            throw new UnauthorizedError("Invalid or expired login attempt, please try again");
        }
        await redis.del(`admin_oauth_state:${state}`);

        let claims: GoogleIdTokenClaims;
        try {
            const tokens = await this.googleOAuth.validateAuthorizationCode(code, codeVerifier);
            claims = decodeIdToken(tokens.idToken()) as GoogleIdTokenClaims;
        } catch (error) {
            if (error instanceof OAuth2RequestError) {
                logger.error({ message: "OAuth2 request error", data: { code: error.code }, error: error as Error });
                throw new UnauthorizedError("Invalid OAuth code, credentials, or redirect URI");
            }
            if (error instanceof ArcticFetchError) {
                logger.error({ message: "Arctic fetch error", error: error as Error });
                throw new UnauthorizedError("Failed to communicate with Google");
            }
            logger.error({ message: "Failed to exchange Google OAuth code", error: error as Error });
            throw new UnauthorizedError("Failed to complete Google login");
        }

        let admin = await this.adminAuthRepository.findByGoogleId(transactionId, claims.sub);
        if (!admin) {
            admin = await this.adminAuthRepository.findByEmail(transactionId, claims.email);
            if (!admin) {
                logger.warn({ message: "Admin account not found", data: { email: claims.email } });
                throw new ForbiddenError("Admin account not found — contact an administrator");
            }
            admin = await this.adminAuthRepository.updateGoogleIdAndLastLogin(transactionId, admin.id, claims.sub);
        } else {
            admin = await this.adminAuthRepository.updateLastLogin(transactionId, admin.id);
        }

        if (!admin.is_active) {
            logger.warn({ message: "Admin account disabled", data: { adminId: admin.id } });
            throw new ForbiddenError("This admin account has been disabled");
        }

        const { accessToken, refreshToken } = await this.mintTokens(admin);
        return { admin, accessToken, refreshToken };
    }

    async refreshToken(transactionId: string, refreshToken: string): Promise<{ accessToken: string, refreshToken: string }> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.adminAuth.refreshToken", transactionId);
        const adminId = await redis.get(`admin_refresh_token:${refreshToken}`);
        if (!adminId) {
            throw new UnauthorizedError("Invalid refresh token");
        }

        const admin = await this.adminAuthRepository.get(transactionId, adminId);
        if (!admin || !admin.is_active) {
            throw new UnauthorizedError("Admin account not found or disabled");
        }

        await redis.del(`admin_refresh_token:${refreshToken}`);
        return this.mintTokens(admin);
    }

    async logout(transactionId: string, refreshToken?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.adminAuth.logout", transactionId);
        if (refreshToken) {
            await redis.del(`admin_refresh_token:${refreshToken}`);
        }
    }

    private async mintTokens(admin: AdminUser): Promise<{ accessToken: string, refreshToken: string }> {
        const accessToken = signAdminAccessToken({
            id: admin.id,
            email: admin.email,
            name: admin.name,
            avatarUrl: admin.avatar_url,
            role: admin.role
        });
        const refreshToken = generateRefreshToken();

        await redis.set(`admin_refresh_token:${refreshToken}`, admin.id, TTL.ONE_WEEK);

        return { accessToken, refreshToken };
    }
}
