import UserService from "./user.service";
import UserRepository from "@/repositories/user/user.repository";
import AuthRepository from "@/repositories/auth/auth.repository";
import AuthService from "../auth/auth.service";
import WidgetService from "../widget/widget.service";
import redis, { TTL } from "@/libs/redis";
import { twitchAppAPI } from "@/libs/twurple";
import { exchangeCode, getTokenInfo } from "@twurple/auth";
import { signAccessToken, generateRefreshToken } from "@/libs/jwt";
import { NotFoundError, UnauthorizedError } from "@/errors";
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

jest.mock("crypto", () => ({
    randomUUID: jest.fn().mockReturnValue("mocked_uuid"),
}));

describe("UserService", () => {
    let service: UserService;
    let mockUserRepo: jest.Mocked<UserRepository>;
    let mockAuthRepo: jest.Mocked<AuthRepository>;
    let mockAuthService: jest.Mocked<AuthService>;
    let mockWidgetService: jest.Mocked<WidgetService>;
    let mockCfg: any;

    beforeEach(() => {
        mockUserRepo = {
            upsert: jest.fn(),
            get: jest.fn(),
            getByTwitchId: jest.fn(),
            update: jest.fn(),
            listExpired: jest.fn(),
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
        } as any;
        mockCfg = {
            twitch: {
                clientId: "client_id",
                clientSecret: "client_secret",
                redirectUrl: "redirect_url",
                paymentChannelId: "payment_id",
            },
        };

        service = new UserService(mockCfg, mockUserRepo, mockAuthRepo, mockAuthService);
        service.setWidgetService(mockWidgetService);
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
            expect(mockAuthRepo.create).toHaveBeenCalledWith("u1");
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
            expect(mockAuthRepo.create).toHaveBeenCalled();
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
            expect(mockUserRepo.update).toHaveBeenCalledWith("u1", expect.objectContaining({ tier: 2 }));
        });

        it("should reset tier to 0 if no twitch subscription", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockUserRepo.get.mockResolvedValue({ id: "u1", twitch_id: "t1", tier: 1 } as any);
            const mockAPI = { subscriptions: { checkUserSubscription: jest.fn().mockResolvedValue(null) } };
            mockAuthService.createTwitchUserAPI.mockResolvedValue(mockAPI as any);
            mockUserRepo.update.mockResolvedValue({ twitch_id: "t1" } as any);

            const result = await service.getTier("u1");
            expect(result).toBe(0);
            expect(mockUserRepo.update).toHaveBeenCalledWith("u1", { tier_expire_at: null });
        });
    });

    describe("adjustTierAndWidgets", () => {
        it("should throw if widget service missing", async () => {
            service.setWidgetService(undefined as any);
            await expect(service.adjustTierAndWidgets("u1")).rejects.toThrow("WidgetService is not initialized");
        });

        it("should disable all widgets if active widgets > 1 and tier < 1", async () => {
            mockUserRepo.get.mockResolvedValue({ id: "u1", twitch_id: "t1" } as any);
            const mockAPI = { subscriptions: { checkUserSubscription: jest.fn().mockResolvedValue(null) } };
            mockAuthService.createTwitchUserAPI.mockResolvedValue(mockAPI as any);
            mockWidgetService.getTotalByOwnerId.mockResolvedValue(2);
            mockUserRepo.update.mockResolvedValue({ twitch_id: "t1" } as any);

            await service.adjustTierAndWidgets("u1");

            expect(mockWidgetService.disableAll).toHaveBeenCalledWith("u1");
        });
    });

    describe("bulkAdjustTierAndWidgets", () => {
        it("should loop until no expired users", async () => {
            mockUserRepo.listExpired
                .mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }] as any)
                .mockResolvedValueOnce([] as any);
            
            // Mock adjustTierAndWidgets internal dependencies
            mockUserRepo.get.mockResolvedValue({ id: "u1", twitch_id: "t1" } as any);
            const mockAPI = { subscriptions: { checkUserSubscription: jest.fn().mockResolvedValue(null) } };
            mockAuthService.createTwitchUserAPI.mockResolvedValue(mockAPI as any);
            mockWidgetService.getTotalByOwnerId.mockResolvedValue(0);
            mockUserRepo.update.mockResolvedValue({ twitch_id: "t1" } as any);

            await service.bulkAdjustTierAndWidgets();

            expect(mockUserRepo.listExpired).toHaveBeenCalledTimes(2);
        });

        it("should throw error if failed", async () => {
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
