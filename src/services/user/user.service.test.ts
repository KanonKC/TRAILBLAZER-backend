import UserService from "./user.service";
import UserRepository from "@/repositories/user/user.repository";
import AuthRepository from "@/repositories/auth/auth.repository";
import AuthService from "../auth/auth.service";
import WidgetService from "../widget/widget.service";
import ReferralService from "../referral/referral.service";
import redis, { TTL } from "@/libs/redis";
import { twitchAppAPI } from "@/libs/twurple";
import { exchangeCode, getTokenInfo } from "@twurple/auth";
import { signAccessToken, generateRefreshToken } from "@/libs/jwt";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/errors";
import { UserTier } from "./constant";
import { generateTierExpireDate } from "@/utils/time";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { convertPrismaError } from "@/utils/error";

jest.mock("@/libs/redis", () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    TTL: {
        ONE_DAY: 86400,
        ONE_WEEK: 604800,
    },
}));

jest.mock("@/libs/twurple", () => ({
    twitchAppAPI: {
        users: {
            getUserById: jest.fn(),
        },
    },
}));

jest.mock("@twurple/auth", () => ({
    exchangeCode: jest.fn(),
    getTokenInfo: jest.fn(),
}));

jest.mock("@/libs/jwt", () => ({
    signAccessToken: jest.fn().mockReturnValue("access_token"),
    generateRefreshToken: jest.fn().mockReturnValue("refresh_token"),
}));

jest.mock("@/utils/time", () => ({
    generateTierExpireDate: jest.fn().mockReturnValue(new Date("2026-04-27")),
}));

jest.mock("@/utils/error", () => ({
    convertPrismaError: jest.fn().mockReturnValue(new Error("Prisma Error")),
}));

jest.mock("node:crypto", () => ({
    randomUUID: jest.fn().mockReturnValue("mocked_uuid"),
}));

describe("UserService", () => {
    let service: UserService;
    let mockUserRepo: jest.Mocked<UserRepository>;
    let mockAuthRepo: jest.Mocked<AuthRepository>;
    let mockAuthService: jest.Mocked<AuthService>;
    let mockWidgetService: jest.Mocked<WidgetService>;
    let mockReferralService: jest.Mocked<ReferralService>;
    let mockCfg: any;

    beforeEach(() => {
        mockUserRepo = {
            upsert: jest.fn(),
            get: jest.fn(),
            getByTwitchId: jest.fn(),
            update: jest.fn(),
            listExpired: jest.fn(),
            listShowcase: jest.fn(),
        } as any;
        mockAuthRepo = {
            create: jest.fn(),
            updateTwitchToken: jest.fn(),
        } as any;
        mockAuthService = {
            createTwitchUserAPI: jest.fn(),
        } as any;
        mockWidgetService = {
            getTotalByOwnerId: jest.fn(),
            disableAll: jest.fn(),
            getQuota: jest.fn().mockResolvedValue({ total_quota: 1, used_quota: 0, remaining_quota: 1 }),
        } as any;
        mockReferralService = {
            handleReferralRegistration: jest.fn(),
        } as any;
        mockCfg = {
            twitch: {
                clientId: "client_id",
                clientSecret: "client_secret",
                redirectUrl: "redirect_url",
                paymentChannelId: "payment_id",
            },
            discord: {
                clientId: "discord_client_id",
                clientSecret: "discord_client_secret",
                redirectUrl: "discord_redirect_url",
                statWebhookUrl: "",
            },
        };

        const mockDiscordProvider = { sendStatMessage: jest.fn() } as any;
        service = new UserService(mockCfg, mockUserRepo, mockAuthRepo, mockAuthService, mockDiscordProvider);
        service.setWidgetService(mockWidgetService);
        service.setReferralService(mockReferralService);
        jest.clearAllMocks();
    });

    describe("login", () => {
        const loginReq = { code: "oauth_code", state: "state", scope: ["user:read"] };

        it("should login/upsert user successfully", async () => {
            (exchangeCode as jest.Mock).mockResolvedValue({ accessToken: "at", refreshToken: "rt", expiresIn: 3600 });
            (getTokenInfo as jest.Mock).mockResolvedValue({ userId: "t1" });
            (twitchAppAPI.users.getUserById as jest.Mock).mockResolvedValue({ 
                id: "t1", name: "user1", displayName: "User1", profilePictureUrl: "pic" 
            });
            mockUserRepo.upsert.mockResolvedValue({ id: "u1", username: "user1", twitch_id: "t1", tier: 0 } as any);

            const result = await service.login(loginReq);

            expect(result.accessToken).toBe("access_token");
            expect(mockUserRepo.upsert).toHaveBeenCalled();
            expect(mockAuthRepo.updateTwitchToken).toHaveBeenCalled();
            expect(redis.set).toHaveBeenCalledWith("auth:twitch_access_token:twitch_id:t1", "at", TTL.ONE_WEEK);
        });

        it("should throw UnauthorizedError if token info missing userId", async () => {
            (exchangeCode as jest.Mock).mockResolvedValue({ accessToken: "at" });
            (getTokenInfo as jest.Mock).mockResolvedValue({ userId: null });

            await expect(service.login(loginReq)).rejects.toThrow(UnauthorizedError);
        });

        it("should throw UnauthorizedError if twitch user not found", async () => {
            (exchangeCode as jest.Mock).mockResolvedValue({ accessToken: "at" });
            (getTokenInfo as jest.Mock).mockResolvedValue({ userId: "t1" });
            (twitchAppAPI.users.getUserById as jest.Mock).mockResolvedValue(null);

            await expect(service.login(loginReq)).rejects.toThrow(UnauthorizedError);
        });

        it("should silently handle error during auth record creation", async () => {
            (exchangeCode as jest.Mock).mockResolvedValue({ accessToken: "at", refreshToken: "rt" });
            (getTokenInfo as jest.Mock).mockResolvedValue({ userId: "t1" });
            (twitchAppAPI.users.getUserById as jest.Mock).mockResolvedValue({ id: "t1" } as any);
            mockUserRepo.upsert.mockResolvedValue({ id: "u1", twitch_id: "t1" } as any);
            mockAuthRepo.create.mockRejectedValue(new Error("ALREADY_EXISTS"));

            await service.login(loginReq);
            // Should not throw
        });

        it("should handle referral registration for new users with a ref code", async () => {
            (exchangeCode as jest.Mock).mockResolvedValue({ accessToken: "at", refreshToken: "rt", expiresIn: 3600 });
            (getTokenInfo as jest.Mock).mockResolvedValue({ userId: "t1" });
            (twitchAppAPI.users.getUserById as jest.Mock).mockResolvedValue({
                id: "t1", name: "user1", displayName: "User1", profilePictureUrl: "pic"
            });
            mockUserRepo.getByTwitchId.mockResolvedValue(null); // new user
            mockUserRepo.upsert.mockResolvedValue({ id: "u1", username: "user1", twitch_id: "t1", tier: 0 } as any);
            mockUserRepo.get.mockResolvedValue({ id: "u1", username: "user1", twitch_id: "t1", tier: 0, extra_widget_quota: 1 } as any);

            await service.login({ ...loginReq, ref: "referrer_code" });

            expect(mockReferralService.handleReferralRegistration).toHaveBeenCalledWith("referrer_code", "u1");
            expect(mockUserRepo.get).toHaveBeenCalledWith("u1");
        });

        it("should skip referral registration for existing users", async () => {
            (exchangeCode as jest.Mock).mockResolvedValue({ accessToken: "at", refreshToken: "rt", expiresIn: 3600 });
            (getTokenInfo as jest.Mock).mockResolvedValue({ userId: "t1" });
            (twitchAppAPI.users.getUserById as jest.Mock).mockResolvedValue({
                id: "t1", name: "user1", displayName: "User1", profilePictureUrl: "pic"
            });
            mockUserRepo.getByTwitchId.mockResolvedValue({ id: "u1" } as any); // existing user
            mockUserRepo.upsert.mockResolvedValue({ id: "u1", username: "user1", twitch_id: "t1", tier: 0 } as any);

            await service.login({ ...loginReq, ref: "referrer_code" });

            expect(mockReferralService.handleReferralRegistration).not.toHaveBeenCalled();
        });
    });

    describe("getByTwitchId", () => {
        it("should return from cache", async () => {
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ id: "u1" }));
            const result = await service.getByTwitchId("t1");
            expect(result.id).toBe("u1");
        });

        it("should return from repo and cache", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockUserRepo.getByTwitchId.mockResolvedValue({ id: "u1" } as any);
            const result = await service.getByTwitchId("t1");
            expect(result.id).toBe("u1");
            expect(redis.set).toHaveBeenCalled();
        });

        it("should throw NotFoundError if missing", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockUserRepo.getByTwitchId.mockResolvedValue(null);
            await expect(service.getByTwitchId("t1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("refreshToken", () => {
        it("should refresh token pair", async () => {
            (redis.get as jest.Mock).mockResolvedValue("u1");
            mockUserRepo.get.mockResolvedValue({ id: "u1" } as any);

            const result = await service.refreshToken("old_rt");

            expect(result.accessToken).toBe("access_token");
            expect(redis.del).toHaveBeenCalled();
            expect(redis.set).toHaveBeenCalled();
        });

        it("should throw UnauthorizedError if rt invalid", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            await expect(service.refreshToken("old_rt")).rejects.toThrow(UnauthorizedError);
        });

        it("should throw NotFoundError if user missing", async () => {
            (redis.get as jest.Mock).mockResolvedValue("u1");
            mockUserRepo.get.mockResolvedValue(null);
            await expect(service.refreshToken("old_rt")).rejects.toThrow(NotFoundError);
        });
    });

    describe("get", () => {
        it("should use cache", async () => {
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ id: "u1" }));
            const result = await service.get("u1");
            expect(result.id).toBe("u1");
            expect(mockUserRepo.get).not.toHaveBeenCalled();
        });

        it("should fetch from repo and cache on cache miss", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockUserRepo.get.mockResolvedValue({ id: "u1" } as any);
            const result = await service.get("u1");
            expect(result.id).toBe("u1");
            expect(redis.set).toHaveBeenCalledWith("user:id:u1", expect.any(String), TTL.ONE_DAY);
        });

        it("should throw NotFoundError if repo returns null", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockUserRepo.get.mockResolvedValue(null);
            await expect(service.get("u1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("update", () => {
        it("should update and clear cache", async () => {
            mockUserRepo.update.mockResolvedValue({ twitch_id: "t1" } as any);
            await service.update("u1", { username: "new" });
            expect(redis.del).toHaveBeenCalledTimes(3);
        });

        it("should also clear showcase cache when is_showcase is updated", async () => {
            mockUserRepo.update.mockResolvedValue({ twitch_id: "t1" } as any);
            await service.update("u1", { is_showcase: true });
            expect(redis.del).toHaveBeenCalledWith("user:showcase");
            expect(redis.del).toHaveBeenCalledTimes(4);
        });

        it("should convert prisma error", async () => {
            const error = new PrismaClientKnownRequestError("msg", { code: "P2002", clientVersion: "1" });
            mockUserRepo.update.mockRejectedValue(error);
            await expect(service.update("u1", {})).rejects.toThrow("Prisma Error");
        });

        it("should rethrow other errors", async () => {
            mockUserRepo.update.mockRejectedValue(new Error("Generic"));
            await expect(service.update("u1", {})).rejects.toThrow("Generic");
        });
    });

    describe("getTier", () => {
        it("should use cache if available and not forced", async () => {
            (redis.get as jest.Mock).mockResolvedValue("1");
            const result = await service.getTier("u1");
            expect(result).toBe(1);
        });

        it("should fetch from repo if expire date valid", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            const mockUser = { id: "u1", tier: 2, tier_expire_at: new Date(Date.now() + 100000) };
            mockUserRepo.get.mockResolvedValue(mockUser as any);

            const result = await service.getTier("u1");
            expect(result).toBe(2);
        });

        it("should fetch from twitch if expire date missing or forced", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            const mockUser = { id: "u1", twitch_id: "t1", tier: 0, tier_expire_at: null };
            mockUserRepo.get.mockResolvedValue(mockUser as any);
            
            const mockAPI = { subscriptions: { checkUserSubscription: jest.fn().mockResolvedValue({ tier: "2000" }) } };
            mockAuthService.createTwitchUserAPI.mockResolvedValue(mockAPI as any);
            mockUserRepo.update.mockResolvedValue({ twitch_id: "t1" } as any);

            const result = await service.getTier("u1", { forceTwitch: true });
            expect(result).toBe(2);
            expect(mockUserRepo.update).toHaveBeenCalledWith("u1", expect.objectContaining({ tier: 2 }), undefined);
        });

        it("should reset tier to 0 if no twitch subscription", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockUserRepo.get.mockResolvedValue({ id: "u1", twitch_id: "t1", tier: 1 } as any);
            const mockAPI = { subscriptions: { checkUserSubscription: jest.fn().mockResolvedValue(null) } };
            mockAuthService.createTwitchUserAPI.mockResolvedValue(mockAPI as any);
            mockUserRepo.update.mockResolvedValue({ twitch_id: "t1" } as any);

            const result = await service.getTier("u1");
            expect(result).toBe(0);
            expect(mockUserRepo.update).toHaveBeenCalledWith("u1", { tier: 0, tier_expire_at: null }, undefined);
        });

        it("should only update tier (no expire date change) when existing expire is still ahead of new one", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            const farFuture = new Date(Date.now() + 999999999);
            mockUserRepo.get.mockResolvedValue({ id: "u1", twitch_id: "t1", tier: 1, tier_expire_at: farFuture } as any);
            const mockAPI = { subscriptions: { checkUserSubscription: jest.fn().mockResolvedValue({ tier: "1000" }) } };
            mockAuthService.createTwitchUserAPI.mockResolvedValue(mockAPI as any);
            mockUserRepo.update.mockResolvedValue({ twitch_id: "t1" } as any);

            const result = await service.getTier("u1", { forceTwitch: true });
            expect(result).toBe(1);
            expect(mockUserRepo.update).toHaveBeenCalledWith("u1", { tier: 1 }, undefined);
        });

        it("should bypass cache when forceTwitch is true", async () => {
            (redis.get as jest.Mock).mockResolvedValue("2"); // cache has tier 2
            mockUserRepo.get.mockResolvedValue({ id: "u1", twitch_id: "t1", tier: 2, tier_expire_at: null } as any);
            const mockAPI = { subscriptions: { checkUserSubscription: jest.fn().mockResolvedValue(null) } };
            mockAuthService.createTwitchUserAPI.mockResolvedValue(mockAPI as any);
            mockUserRepo.update.mockResolvedValue({ twitch_id: "t1" } as any);

            const result = await service.getTier("u1", { forceTwitch: true });
            expect(result).toBe(0);
            expect(mockAuthService.createTwitchUserAPI).toHaveBeenCalled();
        });
    });

    describe("getTierFromTwitch", () => {
        it("should throw ForbiddenError on missing scope error", async () => {
            const mockAPI = {
                subscriptions: {
                    checkUserSubscription: jest.fn().mockRejectedValue(new Error("user:read:subscriptions scope missing")),
                },
            };
            mockAuthService.createTwitchUserAPI.mockResolvedValue(mockAPI as any);

            await expect(service.getTierFromTwitch("t1")).rejects.toThrow(ForbiddenError);
        });

        it("should re-throw other errors from Twitch API", async () => {
            const mockAPI = {
                subscriptions: {
                    checkUserSubscription: jest.fn().mockRejectedValue(new Error("Network failure")),
                },
            };
            mockAuthService.createTwitchUserAPI.mockResolvedValue(mockAPI as any);

            await expect(service.getTierFromTwitch("t1")).rejects.toThrow("Network failure");
        });
    });

    describe("hasTwitchGqlToken", () => {
        it("should return true when token exists", async () => {
            mockAuthRepo.getByUserId = jest.fn().mockResolvedValue({ twitch_gql_token: "token123" });
            const result = await service.hasTwitchGqlToken("u1");
            expect(result).toBe(true);
        });

        it("should return false when token is absent", async () => {
            mockAuthRepo.getByUserId = jest.fn().mockResolvedValue({ twitch_gql_token: null });
            const result = await service.hasTwitchGqlToken("u1");
            expect(result).toBe(false);
        });

        it("should return false when auth record is missing", async () => {
            mockAuthRepo.getByUserId = jest.fn().mockResolvedValue(null);
            const result = await service.hasTwitchGqlToken("u1");
            expect(result).toBe(false);
        });
    });

    describe("getMaxStorageMB", () => {
        it("should return base storage for tier below PRO", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockUserRepo.get.mockResolvedValue({ id: "u1", tier: 0, max_storage_mb: 100 } as any);

            const result = await service.getMaxStorageMB("u1");
            expect(result).toBe(100);
        });

        it("should return base + 45 MB for PRO tier and above", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockUserRepo.get.mockResolvedValue({ id: "u1", tier: UserTier.PRO_TIER, max_storage_mb: 100 } as any);

            const result = await service.getMaxStorageMB("u1");
            expect(result).toBe(145);
        });
    });

    describe("listShowcase", () => {
        it("should return cached showcase", async () => {
            const cached = { data: [{ id: "u1" }] };
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(cached));

            const result = await service.listShowcase();
            expect(result).toEqual(cached);
            expect(mockUserRepo.listShowcase).not.toHaveBeenCalled();
        });

        it("should fetch from repo and cache on miss", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockUserRepo.listShowcase.mockResolvedValue([{ id: "u1" }]);

            const result = await service.listShowcase();
            expect(result).toEqual({ data: [{ id: "u1" }] });
            expect(redis.set).toHaveBeenCalledWith("user:showcase", expect.any(String), TTL.ONE_DAY);
        });
    });

    describe("adjustTierAndWidgets", () => {
        it("should throw if widget service missing", async () => {
            service.setWidgetService(undefined as any);
            await expect(service.adjustTierAndWidgets("u1")).rejects.toThrow("WidgetService is not initialized");
        });

        it("should disable all widgets if used quota exceeds total quota after tier update", async () => {
            mockUserRepo.get.mockResolvedValue({ id: "u1", twitch_id: "t1" } as any);
            const mockAPI = { subscriptions: { checkUserSubscription: jest.fn().mockResolvedValue(null) } };
            mockAuthService.createTwitchUserAPI.mockResolvedValue(mockAPI as any);
            mockWidgetService.getQuota.mockResolvedValue({ total_quota: 1, used_quota: 2, remaining_quota: 0 });
            mockUserRepo.update.mockResolvedValue({ twitch_id: "t1" } as any);

            await service.adjustTierAndWidgets("u1");

            expect(mockWidgetService.disableAll).toHaveBeenCalledWith("u1");
        });

        it("should not disable widgets if quota is not exceeded", async () => {
            mockUserRepo.get.mockResolvedValue({ id: "u1", twitch_id: "t1" } as any);
            const mockAPI = { subscriptions: { checkUserSubscription: jest.fn().mockResolvedValue({ tier: "1000" }) } };
            mockAuthService.createTwitchUserAPI.mockResolvedValue(mockAPI as any);
            mockWidgetService.getQuota.mockResolvedValue({ total_quota: 3, used_quota: 1, remaining_quota: 2 });
            mockUserRepo.update.mockResolvedValue({ twitch_id: "t1" } as any);

            await service.adjustTierAndWidgets("u1");

            expect(mockWidgetService.disableAll).not.toHaveBeenCalled();
        });

        it("should disable all and set tier to 0 on UnauthorizedError", async () => {
            mockUserRepo.get.mockResolvedValue({ id: "u1", twitch_id: "t1" } as any);
            mockAuthService.createTwitchUserAPI.mockRejectedValue(new UnauthorizedError("no token"));
            mockUserRepo.update.mockResolvedValue({ twitch_id: "t1" } as any);

            await service.adjustTierAndWidgets("u1");

            expect(mockWidgetService.disableAll).toHaveBeenCalledWith("u1");
            expect(mockUserRepo.update).toHaveBeenCalledWith("u1", { tier: 0, tier_expire_at: null }, undefined);
        });

        it("should disable all and set tier to 0 on ForbiddenError", async () => {
            mockUserRepo.get.mockResolvedValue({ id: "u1", twitch_id: "t1" } as any);
            mockAuthService.createTwitchUserAPI.mockRejectedValue(new ForbiddenError("no scope"));
            mockUserRepo.update.mockResolvedValue({ twitch_id: "t1" } as any);

            await service.adjustTierAndWidgets("u1");

            expect(mockWidgetService.disableAll).toHaveBeenCalledWith("u1");
            expect(mockUserRepo.update).toHaveBeenCalledWith("u1", { tier: 0, tier_expire_at: null }, undefined);
        });

        it("should re-throw unexpected errors", async () => {
            mockUserRepo.get.mockResolvedValue({ id: "u1", twitch_id: "t1" } as any);
            mockAuthService.createTwitchUserAPI.mockRejectedValue(new Error("Unexpected"));

            await expect(service.adjustTierAndWidgets("u1")).rejects.toThrow("Unexpected");
        });
    });

    describe("bulkAdjustTierAndWidgets", () => {
        it("should throw if widget service missing", async () => {
            service.setWidgetService(undefined as any);
            await expect(service.bulkAdjustTierAndWidgets()).rejects.toThrow("WidgetService is not initialized");
        });

        it("should loop until no expired users", async () => {
            mockUserRepo.listExpired
                .mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }] as any)
                .mockResolvedValueOnce([] as any);

            mockUserRepo.get.mockResolvedValue({ id: "u1", twitch_id: "t1" } as any);
            const mockAPI = { subscriptions: { checkUserSubscription: jest.fn().mockResolvedValue(null) } };
            mockAuthService.createTwitchUserAPI.mockResolvedValue(mockAPI as any);
            mockUserRepo.update.mockResolvedValue({ twitch_id: "t1" } as any);

            await service.bulkAdjustTierAndWidgets();

            expect(mockUserRepo.listExpired).toHaveBeenCalledTimes(2);
        });

        it("should add failing users to processedIds and continue loop", async () => {
            mockUserRepo.listExpired
                .mockResolvedValueOnce([{ id: "u1" }] as any)
                .mockResolvedValueOnce([] as any);

            mockUserRepo.get.mockRejectedValue(new Error("DB failure"));

            await service.bulkAdjustTierAndWidgets();

            // Second call should pass processedIds containing "u1"
            expect(mockUserRepo.listExpired).toHaveBeenNthCalledWith(2, { page: 1, limit: 10 }, ["u1"]);
        });

        it("should throw error if listExpired itself fails", async () => {
            mockUserRepo.listExpired.mockRejectedValue(new Error("Loop Error"));
            await expect(service.bulkAdjustTierAndWidgets()).rejects.toThrow("Loop Error");
        });
    });

    describe("createAccessToken", () => {
        it("should return signed token", () => {
            const result = service.createAccessToken({ id: "u1" } as any);
            expect(result).toBe("access_token");
        });
    });
});
