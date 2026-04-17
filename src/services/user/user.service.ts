import Configurations from "@/config/index";
import redis, { TTL } from "@/libs/redis";
import { twitchAppAPI } from "@/libs/twurple";
import AuthRepository from "@/repositories/auth/auth.repository";
import { CreateUserRequest } from "@/repositories/user/request";
import UserRepository from "@/repositories/user/user.repository";
import { exchangeCode, getTokenInfo } from "@twurple/auth";
import { User } from "generated/prisma/client";
import TLogger, { Layer } from "@/logging/logger";
import { GetTierOptions, LoginRequest } from "./request";
import { generateRefreshToken, signAccessToken } from "@/libs/jwt";
import { ForbiddenError, NotFoundError, TError, UnauthorizedError } from "@/errors";
import AuthService from "../auth/auth.service";
import WidgetService from "../widget/widget.service";
import { UserTier } from "./constant";
import { generateTierExpireDate } from "@/utils/time";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { convertPrismaError } from "@/utils/error";

export default class UserService {
    private readonly cfg: Configurations
    private readonly userRepository: UserRepository
    private readonly authRepository: AuthRepository
    private readonly logger: TLogger
    private readonly authService: AuthService
    private widgetService?: WidgetService;

    constructor(cfg: Configurations, userRepository: UserRepository, authRepository: AuthRepository, authService: AuthService) {
        this.cfg = cfg
        this.userRepository = userRepository
        this.authRepository = authRepository
        this.logger = new TLogger(Layer.SERVICE)
        this.authService = authService
    }

    public setWidgetService(widgetService: WidgetService) {
        this.widgetService = widgetService;
    }

    async login(request: LoginRequest): Promise<{ accessToken: string, refreshToken: string, user: User }> {
        this.logger.setContext("service.user.login")
        const token = await exchangeCode(
            this.cfg.twitch.clientId,
            this.cfg.twitch.clientSecret,
            request.code,
            this.cfg.twitch.redirectUrl
        )
        this.logger.debug({ message: "Received twitch token" });

        const tokenInfo = await getTokenInfo(token.accessToken, this.cfg.twitch.clientId)

        if (!tokenInfo.userId) {
            throw new UnauthorizedError("Invalid token info")
        }

        const twitchUser = await twitchAppAPI.users.getUserById(tokenInfo.userId)
        if (!twitchUser) {
            throw new UnauthorizedError("Invalid Twitch user")
        }

        const cr: CreateUserRequest = {
            twitch_id: twitchUser.id,
            username: twitchUser.name,
            display_name: twitchUser.displayName,
            avatar_url: twitchUser.profilePictureUrl
        }
        this.logger.debug({ message: "Creating user request", data: cr });
        const user = await this.userRepository.upsert(cr)
        this.logger.info({ message: "User logged in/created", data: { userId: user.id, username: user.username } });
        await this.authRepository.updateTwitchToken(user.id, {
            twitch_refresh_token: token.refreshToken,
            twitch_token_expires_at: token.expiresIn ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
        })

        // Create access token
        const accessToken = signAccessToken({
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            avatarUrl: user.avatar_url,
            twitchId: user.twitch_id,
            tier: user.tier
        });
        const refreshToken = generateRefreshToken();

        await redis.set(`refresh_token:${refreshToken}`, user.id, TTL.ONE_WEEK);
        await redis.set(`auth:twitch_access_token:twitch_id:${user.twitch_id}`, token.accessToken, TTL.ONE_WEEK)

        return { accessToken, refreshToken, user };
    }

    async getByTwitchId(twitchId: string): Promise<User> {
        this.logger.setContext("service.user.getByTwitchId");
        const cacheKey = `user:twitch_id:${twitchId}`;
        const cachedUser = await redis.get(cacheKey);
        if (cachedUser) {
            return JSON.parse(cachedUser);
        }
        const user = await this.userRepository.getByTwitchId(twitchId);
        if (!user) {
            throw new NotFoundError("User not found");
        }
        await redis.set(cacheKey, JSON.stringify(user), TTL.ONE_DAY);
        return user;
    }

    async refreshToken(refreshToken: string): Promise<{ accessToken: string, refreshToken: string }> {
        this.logger.setContext("service.user.refreshToken");
        const userId = await redis.get(`refresh_token:${refreshToken}`);

        if (!userId) {
            throw new UnauthorizedError("Invalid refresh token");
        }

        const user = await this.userRepository.get(userId);
        if (!user) {
            throw new NotFoundError("User not found");
        }


        const newAccessToken = signAccessToken({
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            avatarUrl: user.avatar_url,
            twitchId: user.twitch_id,
            tier: user.tier
        });
        const newRefreshToken = generateRefreshToken();

        await redis.del(`refresh_token:${refreshToken}`);
        await redis.set(`refresh_token:${newRefreshToken}`, user.id, { EX: 60 * 60 * 24 * 7 });

        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    }

    async get(userId: string): Promise<User> {
        this.logger.setContext("service.user.get");
        const cacheKey = `user:id:${userId}`;
        const cachedUser = await redis.get(cacheKey);
        if (cachedUser) {
            return JSON.parse(cachedUser);
        }
        const user = await this.userRepository.get(userId);
        if (!user) {
            throw new NotFoundError("User not found");
        }
        await redis.set(cacheKey, JSON.stringify(user), TTL.ONE_DAY);
        return user;
    }

    async update(id: string, request: Partial<User>) {
        this.logger.setContext("service.user.update");
        try {
            const user = await this.userRepository.update(id, request)
            await redis.del(`user:id:${id}`)
            await redis.del(`user:tier:${id}`)
            await redis.del(`user:twitch_id:${user.twitch_id}`)
            return user
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                throw convertPrismaError(error)
            }
            throw error
        }
    }

    async getTier(userId: string, options?: GetTierOptions): Promise<number> {
        this.logger.setContext("service.user.getTier");
        const cacheKey = `user:tier:${userId}`;
        const cachedTier = await redis.get(cacheKey);
        const forceTwitch = options?.forceTwitch ?? false

        // Get tier from cache
        if (cachedTier && !forceTwitch) {
            return parseInt(cachedTier);
        }

        // Get tier from repository
        const user = await this.get(userId);
        let tier = 0
        if (user.tier_expire_at && !forceTwitch) {
            tier = user.tier
        } else {
            tier = await this.getTierFromTwitch(user.twitch_id)
            const tierExpireDate = generateTierExpireDate()
            await this.update(user.id, {
                tier: tier,
            })
            if (tier === 0) {
                await this.update(user.id, { tier_expire_at: null })
            }
            else if (user.tier_expire_at && user.tier_expire_at < tierExpireDate) {
                await this.update(user.id, { tier_expire_at: tierExpireDate })
            }
        }

        await redis.set(cacheKey, tier, TTL.ONE_DAY);
        return tier;
    }

    async getTierFromTwitch(twitchId: string): Promise<number> {
        this.logger.setContext("service.user.getTierFromTwitch");
        try {
            const twitchUserAPI = await this.authService.createTwitchUserAPI(twitchId)
            const subscription = await twitchUserAPI.subscriptions.checkUserSubscription(twitchId, this.cfg.twitch.paymentChannelId)
            if (!subscription) return 0
            const tier = parseInt(subscription.tier) / 1000
            return tier
        } catch (err) {
            if (String(err).includes("user:read:subscriptions")) {
                throw new ForbiddenError("This token does not have any of the requested scopes (user:read:subscriptions)")
            }
            throw err
        }
    }

    createAccessToken(user: User): string {
        this.logger.setContext("service.user.createAccessToken");
        const accessToken = signAccessToken({
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            avatarUrl: user.avatar_url,
            twitchId: user.twitch_id,
            tier: user.tier
        });
        return accessToken;
    }

    async adjustTierAndWidgets(userId: string) {
        this.logger.setContext("service.user.adjustTierAndWidgets");
        if (!this.widgetService) {
            this.logger.error({ message: "WidgetService is not initialized" });
            throw new Error("WidgetService is not initialized");
        }
        try {
            const user = await this.get(userId)
            const tier = await this.getTierFromTwitch(user.twitch_id)
            const activeWidgets = await this.widgetService.getTotalByOwnerId(userId, { enabled: true })
            this.logger.info({ message: "Adjusting tier and widgets", data: { userId, tier, activeWidgets } });
            if (activeWidgets > 1 && tier < 1) {
                this.logger.info({ message: "Disabling all widgets", data: { userId } });
                await this.widgetService.disableAll(userId)
                await redis.del(`user:tier:${userId}`)
            }
            const tierExpireDate = generateTierExpireDate()
            await this.update(userId, {
                tier: tier,
                tier_expire_at: tier === 0 ? null : tierExpireDate
            })
        } catch (err) {
            if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
                this.logger.error({ message: "Error on adjustTierAndWidgets, disableing all widgets and set tier to 0", data: { userId }, error: err as Error });
                await this.widgetService.disableAll(userId)
                await this.update(userId, {
                    tier: 0,
                    tier_expire_at: null
                })
            } else {
                throw err
            }
        }
    }

    async bulkAdjustTierAndWidgets() {
        this.logger.setContext("service.user.bulkAdjustTierAndWidgets");
        // TODO: For very large user bases, consider implementing a queue-based system 
        // or more optimized batching to prevent long-running process issues.
        if (!this.widgetService) {
            this.logger.error({ message: "WidgetService is not initialized" });
            throw new Error("WidgetService is not initialized");
        }

        const limit = 10;

        try {
            this.logger.info({ message: "Starting bulk user tier adjustment" });

            const processedIds: string[] = [];
            while (true) {
                // Since adjusting the tier removes the user from the "expired" list,
                // we continually query page 1 until no more expired users remain.
                // We exclude processedIds to avoid infinite loops if some persistent failures occur.
                const users = await this.userRepository.listExpired({ page: 1, limit }, processedIds);

                if (users.length === 0) {
                    break;
                }
                await Promise.all(users.map(async (u) => {
                    try {

                        await this.adjustTierAndWidgets(u.id);
                    } catch (err) {
                        this.logger.error({
                            message: "Failed to adjust tier for user during bulk adjustment",
                            data: { userId: u.id },
                            error: err as Error
                        });
                        processedIds.push(u.id);
                    }
                }))
            }
            this.logger.info({ message: "Completed bulk adjustment" });
        } catch (error) {
            this.logger.error({ message: "Failed during bulk adjustment", error: error as Error });
            throw error;
        }
    }

    async getMaxStorageMB(userId: string) {
        const user = await this.get(userId)
        let maxStorageMb = user.max_storage_mb
        if (user.tier >= UserTier.PRO_TIER) {
            maxStorageMb += 45
        }
        return maxStorageMb
    }
}
