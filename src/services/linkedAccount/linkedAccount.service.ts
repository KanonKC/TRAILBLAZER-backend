import Configurations from "@/config/index";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/errors";
import redis, { TTL } from "@/libs/redis";
import TLogger, { Layer } from "@/logging/logger";
import LinkedAccountRepository from "@/repositories/linkedAccount/linkedAccount.repository";
import { Google, Discord, OAuth2RequestError, ArcticFetchError } from "arctic";
import axios from "axios";
import { Platform, SUPPORTED_PLATFORMS } from "./constant";

interface PlatformUserProfile {
    platform_user_id: string;
    platform_username: string;
    platform_avatar_url: string | null;
}

export default class LinkedAccountService {
    private readonly cfg: Configurations;
    private readonly linkedAccountRepository: LinkedAccountRepository;
    private readonly googleOAuth: Google;
    private readonly discordOAuth: Discord;
    private readonly logger: TLogger;

    constructor(
        cfg: Configurations,
        linkedAccountRepository: LinkedAccountRepository,
        googleOAuth: Google,
        discordOAuth: Discord
    ) {
        this.cfg = cfg;
        this.linkedAccountRepository = linkedAccountRepository;
        this.googleOAuth = googleOAuth;
        this.discordOAuth = discordOAuth;
        this.logger = new TLogger(Layer.SERVICE);
    }

    async listByUserId(userId: string) {
        this.logger.setContext("service.linkedAccount.listByUserId");
        this.logger.info({ message: "Listing linked accounts", data: { userId } });

        const accounts = await this.linkedAccountRepository.listByUserId(userId);

        return accounts.map((account) => ({
            id: account.id,
            platform: account.platform,
            platform_user_id: account.platform_user_id,
            platform_username: account.platform_username,
            platform_avatar_url: account.platform_avatar_url,
            created_at: account.created_at,
        }));
    }

    async bindAccount(userId: string, platform: string, code: string, codeVerifier?: string) {
        this.logger.setContext("service.linkedAccount.bindAccount");
        this.logger.info({ message: "Binding account", data: { userId, platform } });

        this.validatePlatform(platform);

        const existing = await this.linkedAccountRepository.getByUserIdAndPlatform(userId, platform);
        if (existing) {
            throw new BadRequestError(`Account already bound to ${platform}`);
        }

        const { accessToken, refreshToken, expiresAt } = await this.exchangeCode(platform as Platform, code, codeVerifier);

        const redisKey = `linked_account:access_token:${platform}:${userId}`;
        await redis.set(redisKey, accessToken, TTL.ONE_HOUR);

        const profile = await this.fetchPlatformProfile(platform as Platform, accessToken);

        const linkedAccount = await this.linkedAccountRepository.create({
            user_id: userId,
            platform,
            platform_user_id: profile.platform_user_id,
            platform_username: profile.platform_username,
            platform_avatar_url: profile.platform_avatar_url,
            refresh_token: refreshToken,
            token_expires_at: expiresAt,
        });

        this.logger.info({ message: "Account bound successfully", data: { userId, platform, platformUserId: profile.platform_user_id } });

        return {
            id: linkedAccount.id,
            platform: linkedAccount.platform,
            platform_user_id: linkedAccount.platform_user_id,
            platform_username: linkedAccount.platform_username,
            platform_avatar_url: linkedAccount.platform_avatar_url,
            created_at: linkedAccount.created_at,
        };
    }

    async unbindAccount(userId: string, platform: string) {
        this.logger.setContext("service.linkedAccount.unbindAccount");
        this.logger.info({ message: "Unbinding account", data: { userId, platform } });

        this.validatePlatform(platform);

        if (platform === "twitch") {
            throw new ForbiddenError("Cannot unbind Twitch account");
        }

        const existing = await this.linkedAccountRepository.getByUserIdAndPlatform(userId, platform);
        if (!existing) {
            throw new NotFoundError(`No linked account found for ${platform}`);
        }

        await this.linkedAccountRepository.delete(userId, platform);

        const redisKey = `linked_account:access_token:${platform}:${userId}`;
        await redis.del(redisKey);

        this.logger.info({ message: "Account unbound successfully", data: { userId, platform } });
    }

    async getAccessToken(userId: string, platform: string): Promise<string> {
        this.logger.setContext("service.linkedAccount.getAccessToken");

        const redisKey = `linked_account:access_token:${platform}:${userId}`;
        const cachedToken = await redis.get(redisKey);
        if (cachedToken) {
            return cachedToken;
        }

        const account = await this.linkedAccountRepository.getByUserIdAndPlatform(userId, platform);
        if (!account || !account.refresh_token) {
            throw new NotFoundError(`No linked account found for ${platform}`);
        }

        const { accessToken, expiresAt } = await this.refreshAccessToken(platform as Platform, account.refresh_token);

        await redis.set(redisKey, accessToken, TTL.ONE_HOUR);

        // Update token expiry in DB if changed
        if (expiresAt) {
            this.logger.info({ message: "Refreshed access token", data: { userId, platform } });
            await this.linkedAccountRepository.update(account.id, {
                token_expires_at: expiresAt
            });
        }

        return accessToken;
    }

    private validatePlatform(platform: string): void {
        if (!SUPPORTED_PLATFORMS.includes(platform as Platform)) {
            throw new BadRequestError(`Unsupported platform: ${platform}. Supported: ${SUPPORTED_PLATFORMS.join(", ")}`);
        }
    }

    private async exchangeCode(platform: Platform, code: string, codeVerifier?: string): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: Date | null }> {
        this.logger.setContext("service.linkedAccount.exchangeCode");

        try {
            if (platform === "youtube") {
                const tokens = await this.googleOAuth.validateAuthorizationCode(code, codeVerifier || "");
                return {
                    accessToken: tokens.accessToken(),
                    refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : null,
                    expiresAt: tokens.accessTokenExpiresAt(),
                };
            }

            if (platform === "discord") {
                const tokens = await this.discordOAuth.validateAuthorizationCode(code, null);
                return {
                    accessToken: tokens.accessToken(),
                    refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : null,
                    expiresAt: tokens.accessTokenExpiresAt(),
                };
            }

            throw new BadRequestError(`Unsupported platform: ${platform}`);
        } catch (error) {
            if (error instanceof OAuth2RequestError) {
                this.logger.error({ message: "OAuth2 request error", data: { code: error.code }, error: error as Error });
                throw new BadRequestError("Invalid OAuth code, credentials, or redirect URI");
            }
            if (error instanceof ArcticFetchError) {
                this.logger.error({ message: "Arctic fetch error", error: error as Error });
                throw new BadRequestError("Failed to communicate with OAuth provider");
            }
            if (error instanceof BadRequestError) throw error;
            this.logger.error({ message: "Failed to exchange OAuth code", error: error as Error });
            throw new BadRequestError("Failed to exchange OAuth code. The code may be expired or invalid.");
        }
    }

    private async refreshAccessToken(platform: Platform, refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
        this.logger.setContext("service.linkedAccount.refreshAccessToken");

        try {
            if (platform === "youtube") {
                const tokens = await this.googleOAuth.refreshAccessToken(refreshToken);
                return {
                    accessToken: tokens.accessToken(),
                    expiresAt: tokens.accessTokenExpiresAt(),
                };
            }

            if (platform === "discord") {
                const tokens = await this.discordOAuth.refreshAccessToken(refreshToken);
                return {
                    accessToken: tokens.accessToken(),
                    expiresAt: tokens.accessTokenExpiresAt(),
                };
            }

            throw new BadRequestError(`Unsupported platform: ${platform}`);
        } catch (error) {
            if (error instanceof BadRequestError) throw error;
            this.logger.error({ message: "Failed to refresh access token", error: error as Error });
            throw new BadRequestError("Failed to refresh access token");
        }
    }

    private async fetchPlatformProfile(platform: Platform, accessToken: string): Promise<PlatformUserProfile> {
        this.logger.setContext("service.linkedAccount.fetchPlatformProfile");

        if (platform === "youtube") {
            return await this.fetchYouTubeProfile(accessToken);
        }

        if (platform === "discord") {
            return await this.fetchDiscordProfile(accessToken);
        }

        throw new BadRequestError(`Unsupported platform: ${platform}`);
    }

    private async fetchYouTubeProfile(accessToken: string): Promise<PlatformUserProfile> {
        try {
            const response = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
                params: { part: "snippet", mine: true },
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            const channel = response.data.items?.[0];
            if (!channel) {
                throw new BadRequestError("No YouTube channel found for this account");
            }

            return {
                platform_user_id: channel.id,
                platform_username: channel.snippet.title,
                platform_avatar_url: channel.snippet.thumbnails?.default?.url || null,
            };
        } catch (error: any) {
            this.logger.error({ 
                message: "Failed to fetch YouTube profile", 
                data: error.response?.data, 
                error: error as Error 
            });
            throw new BadRequestError("Failed to fetch user profile from YouTube");
        }
    }

    private async fetchDiscordProfile(accessToken: string): Promise<PlatformUserProfile> {
        try {
            const response = await axios.get("https://discord.com/api/v10/users/@me", {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            const user = response.data;
            const avatarUrl = user.avatar
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                : null;

            return {
                platform_user_id: user.id,
                platform_username: user.global_name || user.username,
                platform_avatar_url: avatarUrl,
            };
        } catch (error: any) {
            this.logger.error({ 
                message: "Failed to fetch Discord profile", 
                data: error.response?.data, 
                error: error as Error 
            });
            throw new BadRequestError("Failed to fetch user profile from Discord");
        }
    }
}
