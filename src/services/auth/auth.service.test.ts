import AuthService from "./auth.service";
import AuthRepository from "@/repositories/auth/auth.repository";
import UserRepository from "@/repositories/user/user.repository";
import redis, { TTL } from "@/libs/redis";
import { createTwitchUserAPI } from "@/libs/twurple";
import { refreshUserToken } from "@twurple/auth";
import { NotFoundError, UnauthorizedError } from "@/errors";
import { rawDataSymbol } from "@twurple/common";

jest.mock("@/libs/redis", () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    TTL: {
        QUARTER_HOUR: 900,
    },
}));

jest.mock("@/libs/twurple", () => ({
    createTwitchUserAPI: jest.fn(),
}));

jest.mock("@twurple/auth", () => ({
    refreshUserToken: jest.fn(),
}));

jest.mock("crypto", () => ({
    randomUUID: jest.fn().mockReturnValue("mocked_uuid"),
}));

describe("AuthService", () => {
    let service: AuthService;
    let mockAuthRepo: jest.Mocked<AuthRepository>;
    let mockUserRepo: jest.Mocked<UserRepository>;
    let mockCfg: any;

    beforeEach(() => {
        mockAuthRepo = {
            create: jest.fn(),
            updateTwitchToken: jest.fn(),
        } as any;
        mockUserRepo = {
            get: jest.fn(),
            getByTwitchId: jest.fn(),
        } as any;
        mockCfg = {
            twitch: {
                clientId: "client_id",
                clientSecret: "client_secret",
            },
        };

        service = new AuthService(mockCfg, mockAuthRepo, mockUserRepo);
        jest.clearAllMocks();
    });

    describe("getTwitchAccessToken", () => {
        const twitchId = "twitch_1";
        const cacheKey = `auth:twitch_access_token:twitch_id:${twitchId}`;

        it("should return token from cache if valid", async () => {
            (redis.get as jest.Mock).mockResolvedValue("cached_token");
            const mockUserAPI = {
                getTokenInfo: jest.fn().mockResolvedValue({
                    expiryDate: new Date(Date.now() + 10000),
                    [rawDataSymbol]: {},
                }),
            };
            (createTwitchUserAPI as jest.Mock).mockReturnValue(mockUserAPI);

            // Accessing private method for testing
            const result = await (service as any).getTwitchAccessToken(twitchId);

            expect(result).toBe("cached_token");
            expect(redis.get).toHaveBeenCalledWith(cacheKey);
        });

        it("should delete cache and continue if token is expired", async () => {
            (redis.get as jest.Mock).mockResolvedValue("expired_token");
            const mockUserAPI = {
                getTokenInfo: jest.fn().mockResolvedValue({
                    expiryDate: new Date(Date.now() - 10000),
                    [rawDataSymbol]: {},
                }),
            };
            (createTwitchUserAPI as jest.Mock).mockReturnValue(mockUserAPI);
            
            // Mock subsequent flow to success
            mockUserRepo.getByTwitchId.mockResolvedValue({ id: "u1", auth: { twitch_refresh_token: "rt" } } as any);
            (refreshUserToken as jest.Mock).mockResolvedValue({ accessToken: "new_at", refreshToken: "new_rt" });

            await (service as any).getTwitchAccessToken(twitchId);

            expect(redis.del).toHaveBeenCalledWith(cacheKey);
        });

        it("should handle error during token validation and continue", async () => {
            (redis.get as jest.Mock).mockResolvedValue("error_token");
            const mockUserAPI = {
                getTokenInfo: jest.fn().mockRejectedValue(new Error("API Error")),
            };
            (createTwitchUserAPI as jest.Mock).mockReturnValue(mockUserAPI);
            
            mockUserRepo.getByTwitchId.mockResolvedValue({ id: "u1", auth: { twitch_refresh_token: "rt" } } as any);
            (refreshUserToken as jest.Mock).mockResolvedValue({ accessToken: "new_at", refreshToken: "new_rt" });

            await (service as any).getTwitchAccessToken(twitchId);

            expect(redis.del).toHaveBeenCalledWith(cacheKey);
        });

        it("should throw NotFoundError if user not found", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockUserRepo.getByTwitchId.mockResolvedValue(null);

            await expect((service as any).getTwitchAccessToken(twitchId)).rejects.toThrow(NotFoundError);
        });

        it("should create auth record if missing", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            const mockUser = { id: "u1", auth: null };
            mockUserRepo.getByTwitchId.mockResolvedValue(mockUser as any);
            mockUserRepo.get.mockResolvedValue(mockUser as any); // for logout call
            mockAuthRepo.create.mockResolvedValue({ id: "a1", twitch_refresh_token: null } as any);
            
            await expect((service as any).getTwitchAccessToken(twitchId)).rejects.toThrow(UnauthorizedError);
            expect(mockAuthRepo.create).toHaveBeenCalledWith("u1");
        });

        it("should throw UnauthorizedError if refresh token missing", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            const mockUser = { id: "u1", twitch_id: "t1", auth: { twitch_refresh_token: null } };
            mockUserRepo.getByTwitchId.mockResolvedValue(mockUser as any);
            mockUserRepo.get.mockResolvedValue(mockUser as any); // for logout call

            await expect((service as any).getTwitchAccessToken(twitchId)).rejects.toThrow(UnauthorizedError);
            expect(mockAuthRepo.updateTwitchToken).toHaveBeenCalledWith("u1", {
                twitch_refresh_token: null,
                twitch_token_expires_at: null,
            });
        });

        it("should refresh token successfully if not in cache", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockUserRepo.getByTwitchId.mockResolvedValue({ 
                id: "u1", 
                auth: { id: "a1", twitch_refresh_token: "rt", twitch_token_expires_at: new Date(Date.now() + 100000) } 
            } as any);
            (refreshUserToken as jest.Mock).mockResolvedValue({ 
                accessToken: "new_at", 
                refreshToken: "new_rt",
                expiresIn: 3600
            });

            const result = await (service as any).getTwitchAccessToken(twitchId);

            expect(result).toBe("new_at");
            expect(mockAuthRepo.updateTwitchToken).toHaveBeenCalledWith("a1", expect.objectContaining({
                twitch_refresh_token: "new_rt",
            }));
            expect(redis.set).toHaveBeenCalledWith(cacheKey, "new_at", TTL.QUARTER_HOUR);
        });

        it("should refresh token successfully without expiresIn", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockUserRepo.getByTwitchId.mockResolvedValue({ 
                id: "u1", 
                auth: { id: "a1", twitch_refresh_token: "rt" } 
            } as any);
            (refreshUserToken as jest.Mock).mockResolvedValue({ 
                accessToken: "new_at", 
                refreshToken: "new_rt",
                expiresIn: null
            });

            const result = await (service as any).getTwitchAccessToken(twitchId);

            expect(result).toBe("new_at");
            expect(mockAuthRepo.updateTwitchToken).toHaveBeenCalledWith("a1", expect.objectContaining({
                twitch_token_expires_at: null,
            }));
        });

        it("should handle error during DB update after refresh", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockUserRepo.getByTwitchId.mockResolvedValue({ 
                id: "u1", auth: { id: "a1", twitch_refresh_token: "rt" } 
            } as any);
            (refreshUserToken as jest.Mock).mockResolvedValue({ accessToken: "new_at", refreshToken: "new_rt" });
            mockAuthRepo.updateTwitchToken.mockRejectedValue(new Error("DB Update Error"));

            const result = await (service as any).getTwitchAccessToken(twitchId);

            expect(result).toBe("new_at"); // Should still return token as redis.set is after try-catch
        });
    });

    describe("createTwitchUserAPI", () => {
        it("should call getTwitchAccessToken and return API client", async () => {
            (redis.get as jest.Mock).mockResolvedValue("token");
            const mockUserAPI = { getTokenInfo: jest.fn().mockResolvedValue({ expiryDate: new Date(Date.now() + 10000) }) };
            (createTwitchUserAPI as jest.Mock).mockReturnValue(mockUserAPI);

            const result = await service.createTwitchUserAPI("twitch_1");

            expect(result).toBe(mockUserAPI);
        });
    });

    describe("logout", () => {
        it("should logout successfully", async () => {
            mockUserRepo.get.mockResolvedValue({ id: "u1", twitch_id: "t1" } as any);
            
            await service.logout("u1");

            expect(mockAuthRepo.updateTwitchToken).toHaveBeenCalledWith("u1", {
                twitch_refresh_token: null,
                twitch_token_expires_at: null,
            });
            expect(redis.del).toHaveBeenCalledWith("auth:twitch_access_token:twitch_id:t1");
        });

        it("should throw NotFoundError if user not found", async () => {
            mockUserRepo.get.mockResolvedValue(null);
            await expect(service.logout("u1")).rejects.toThrow(NotFoundError);
        });
    });
});
