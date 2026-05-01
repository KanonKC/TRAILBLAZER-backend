import Configurations from "@/config/index";
import { NotFoundError, UnauthorizedError } from "@/errors";
import redis, { TTL } from "@/libs/redis";
import { createTwitchUserAPI } from "@/libs/twurple";
import TLogger, { Layer } from "@/logging/logger";
import AuthRepository from "@/repositories/auth/auth.repository";
import UserRepository from "@/repositories/user/user.repository";
import { ApiClient } from "@twurple/api";
import { refreshUserToken } from "@twurple/auth";
import { rawDataSymbol } from "@twurple/common";
import { Auth } from "../../../generated/prisma/client";

const logger = new TLogger(Layer.SERVICE);

export default class AuthService {
    private cfg: Configurations
    private authRepository: AuthRepository;
    private userRepository: UserRepository;
    constructor(cfg: Configurations, authRepository: AuthRepository, userRepository: UserRepository) {
        this.cfg = cfg
        this.authRepository = authRepository;
        this.userRepository = userRepository;
    }

    async getTwitchAccessToken(twitchId: string): Promise<string> {
        logger.setContext("service.auth.getTwitchAccessToken");
        logger.info({ message: "getTwitchAccessToken", data: { twitchId } });
        const cacheKey = `auth:twitch_access_token:twitch_id:${twitchId}`;
        let token = await redis.get(cacheKey);
        if (token) {
            // Validate token
            const twitchUserAPI = createTwitchUserAPI(token)
            try {

                const tokenInfo = await twitchUserAPI.getTokenInfo()
                logger.info({ message: "tokenInfo", data: tokenInfo[rawDataSymbol] });
                // If valid return token
                if (!tokenInfo.expiryDate || tokenInfo.expiryDate > new Date()) {
                    return token
                }
                // Delete invalid token
            } catch (error) {
                logger.error({ message: "Error on getTwitchAccessToken", error: error as Error });
            }
            // Otherwise continue
            await redis.del(cacheKey)
        }
        // Generate token from refresh token
        const now = new Date()
        let auth: Auth | null = null
        const user = await this.userRepository.getByTwitchId(twitchId)
        logger.info({ message: "user", data: user });
        if (!user) {
            throw new NotFoundError("User not found");
        }
        auth = user.auth;
        logger.info({ message: "auth", data: auth });
        if (!auth) {
            auth = await this.authRepository.create(user.id)
        }
        if (!auth.twitch_refresh_token) {
            await this.logout(user.id)
            throw new UnauthorizedError("Refresh token not found");
        }
        const newToken = await refreshUserToken(
            this.cfg.twitch.clientId,
            this.cfg.twitch.clientSecret,
            auth.twitch_refresh_token
        )
        logger.info({ message: "newToken", data: newToken });
        try {
            if (auth.twitch_refresh_token !== newToken.refreshToken) {
                await this.authRepository.updateTwitchToken(auth.id, {
                    twitch_refresh_token: newToken.refreshToken,
                    twitch_token_expires_at: newToken.expiresIn ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null
                })
            }
        } catch (error) {
            logger.error({ message: "Error on updateTwitchToken", error: error as Error });
            throw error
        }
        await redis.set(cacheKey, newToken.accessToken, TTL.QUARTER_HOUR)
        return newToken.accessToken
    }

    async createTwitchUserAPI(userId: string): Promise<ApiClient> {
        logger.setContext("service.auth.createTwitchUserAPI");
        const token = await this.getTwitchAccessToken(userId)
        return createTwitchUserAPI(token)
    }

    async logout(userId: string): Promise<void> {
        logger.setContext("service.auth.logout");
        const user = await this.userRepository.get(userId);
        if (!user) {
            throw new NotFoundError("User not found");
        }
        const cacheKey = `auth:twitch_access_token:twitch_id:${user.twitch_id}`;
        await redis.del(cacheKey);
    }

    async updateTwitchGqlToken(userId: string, token: string): Promise<void> {
        logger.setContext("service.auth.updateTwitchGqlToken");
        await this.authRepository.updateTwitchToken(userId, {
            twitch_gql_token: token
        });
    }

    async getTwitchGqlToken(userId: string): Promise<string | null> {
        logger.setContext("service.auth.getTwitchGqlToken");
        const auth = await this.authRepository.getByUserId(userId);
        return auth?.twitch_gql_token || null;
    }
}