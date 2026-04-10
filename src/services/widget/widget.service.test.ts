import WidgetService from "./widget.service";
import WidgetRepository from "@/repositories/widget/widget.repository";
import UserService from "../user/user.service";
import UserRepository from "@/repositories/user/user.repository";
import redis, { TTL } from "@/libs/redis";
import { ForbiddenError, NotFoundError } from "@/errors";
import { UserTier } from "../user/constant";
import { WidgetQuotaLimitError } from "./error";

jest.mock("@/libs/redis", () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    TTL: {
        ONE_DAY: 86400,
    },
}));

jest.mock("crypto", () => ({
    randomUUID: jest.fn().mockReturnValue("mocked_uuid"),
}));

describe("WidgetService", () => {
    let service: WidgetService;
    let mockWidgetRepo: jest.Mocked<WidgetRepository>;
    let mockUserService: jest.Mocked<UserService>;
    let mockUserRepo: jest.Mocked<UserRepository>;

    beforeEach(() => {
        mockWidgetRepo = {
            get: jest.fn(),
            listByOwnerId: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            getByOverlayKey: jest.fn(),
            disableAll: jest.fn(),
            updateOverlayKey: jest.fn(),
            getFirstEnabled: jest.fn(),
        } as any;
        mockUserService = {
            getTier: jest.fn(),
            get: jest.fn(),
        } as any;
        mockUserRepo = {} as any;

        service = new WidgetService(
            mockWidgetRepo,
            mockUserService,
            mockUserRepo
        );
        jest.clearAllMocks();
    });

    describe("authorizeOwnership", () => {
        it("should not throw if owner matches", async () => {
            mockWidgetRepo.get.mockResolvedValue({ id: "w_1", owner_id: "u_1" } as any);
            await expect(service.authorizeOwnership("u_1", "w_1")).resolves.not.toThrow();
        });

        it("should throw ForbiddenError if owner mismatches", async () => {
            mockWidgetRepo.get.mockResolvedValue({ id: "w_1", owner_id: "u_2" } as any);
            await expect(service.authorizeOwnership("u_1", "w_1")).rejects.toThrow(ForbiddenError);
        });
    });

    describe("authorizeTierUsage", () => {
        it("should allow disabling always", async () => {
            await expect(service.authorizeTierUsage("u_1", "w_1", false)).resolves.not.toThrow();
        });

        it("should allow enabling for Pro tier without limit", async () => {
            mockUserService.getTier.mockResolvedValue(UserTier.PRO_TIER);
            mockWidgetRepo.listByOwnerId.mockResolvedValue([[], 5] as any);
            await expect(service.authorizeTierUsage("u_1", undefined, true)).resolves.not.toThrow();
        });

        it("should allow enabling for Free tier if limit not reached", async () => {
            mockUserService.getTier.mockResolvedValue(UserTier.FREE_TIER);
            mockWidgetRepo.listByOwnerId.mockResolvedValue([[], 0] as any);
            await expect(service.authorizeTierUsage("u_1", undefined, true)).resolves.not.toThrow();
        });

        it("should throw ForbiddenError for Free tier if limit reached (new widget)", async () => {
            mockUserService.getTier.mockResolvedValue(UserTier.FREE_TIER);
            mockWidgetRepo.listByOwnerId.mockResolvedValue([[], 1] as any);
            await expect(service.authorizeTierUsage("u_1", undefined, true)).rejects.toThrow(ForbiddenError);
        });

        it("should throw ForbiddenError for Free tier if limit reached (existing widget)", async () => {
            mockUserService.getTier.mockResolvedValue(UserTier.FREE_TIER);
            mockWidgetRepo.get.mockResolvedValue({ id: "w_1", enabled: false } as any);
            mockWidgetRepo.listByOwnerId.mockResolvedValue([[], 1] as any); // 1 other active
            await expect(service.authorizeTierUsage("u_1", "w_1", true)).rejects.toThrow(ForbiddenError);
        });

        it("should throw NotFoundError if widget missing during tier check", async () => {
            mockUserService.getTier.mockResolvedValue(UserTier.FREE_TIER);
            mockWidgetRepo.get.mockResolvedValue(null);
            await expect(service.authorizeTierUsage("u_1", "w_1", true)).rejects.toThrow(NotFoundError);
        });

        it("should handle error during tier authorization", async () => {
            mockUserService.getTier.mockRejectedValue(new Error("API Error"));
            await expect(service.authorizeTierUsage("u_1")).rejects.toThrow("API Error");
        });
    });

    describe("update", () => {
        it("should update successfully", async () => {
            mockWidgetRepo.get.mockResolvedValue({ id: "w_1", owner_id: "u_1" } as any);
            mockWidgetRepo.update.mockResolvedValue({ id: "w_1" } as any);

            await service.update("w_1", "u_1", { enabled: true });

            expect(mockWidgetRepo.update).toHaveBeenCalled();
            expect(redis.del).toHaveBeenCalledWith("widget:w_1");
        });

        it("should throw NotFoundError if missing", async () => {
            mockWidgetRepo.get.mockResolvedValue(null);
            await expect(service.update("w_1", "u_1", {})).rejects.toThrow(NotFoundError);
        });
    });

    describe("updateEnable", () => {
        it("should disable all if forceUpdate is true", async () => {
            mockWidgetRepo.get.mockResolvedValue({ id: "w_1", owner_id: "u_1" } as any);
            await service.updateEnable("w_1", "u_1", true, { forceUpdate: true });
            expect(mockWidgetRepo.disableAll).toHaveBeenCalledWith("u_1");
        });

        it("should throw WidgetQuotaLimitError if authorizeTierUsage throws ForbiddenError", async () => {
            mockUserService.getTier.mockResolvedValue(UserTier.FREE_TIER);
            mockWidgetRepo.get.mockResolvedValue({ id: "w_1", enabled: false } as any);
            mockWidgetRepo.listByOwnerId.mockResolvedValue([[], 1] as any);

            await expect(service.updateEnable("w_1", "u_1", true, {})).rejects.toThrow(WidgetQuotaLimitError);
        });

        it("should rethrow other errors from authorizeTierUsage", async () => {
            mockUserService.getTier.mockRejectedValue(new Error("Generic error"));
            await expect(service.updateEnable("w_1", "u_1", true, {})).rejects.toThrow("Generic error");
        });
    });

    describe("setInitialEnabled", () => {
        it("should enable if free tier and no active widgets", async () => {
            mockWidgetRepo.listByOwnerId.mockResolvedValue([[], 0] as any);
            mockUserService.get.mockResolvedValue({ tier: UserTier.FREE_TIER } as any);
            mockWidgetRepo.get.mockResolvedValue({ id: "w_1", owner_id: "u_1" } as any);

            await service.setInitialEnabled("w_1", "u_1");

            expect(mockWidgetRepo.update).toHaveBeenCalledWith("w_1", expect.objectContaining({ enabled: true }));
        });

        it("should disable if free tier and already 1 active widget", async () => {
            mockWidgetRepo.listByOwnerId.mockResolvedValue([[], 1] as any);
            mockUserService.get.mockResolvedValue({ tier: UserTier.FREE_TIER } as any);
            mockWidgetRepo.get.mockResolvedValue({ id: "w_1", owner_id: "u_1" } as any);

            await service.setInitialEnabled("w_1", "u_1");

            expect(mockWidgetRepo.update).toHaveBeenCalledWith("w_1", expect.objectContaining({ enabled: false }));
        });
    });

    describe("delete", () => {
        it("should delete successfully", async () => {
            mockWidgetRepo.get.mockResolvedValue({ id: "w_1", owner_id: "u_1" } as any);
            await service.delete("w_1", "u_1");
            expect(mockWidgetRepo.delete).toHaveBeenCalledWith("w_1");
        });

        it("should throw NotFoundError if missing", async () => {
            mockWidgetRepo.get.mockResolvedValue(null);
            await expect(service.delete("w_1", "u_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("updateOverlayKey", () => {
        it("should update key", async () => {
            await service.updateOverlayKey("w_1", "new_key");
            expect(mockWidgetRepo.updateOverlayKey).toHaveBeenCalledWith("w_1", "new_key");
        });
    });

    describe("validateOverlayAccess", () => {
        it("should return true if owner matches and key matches", async () => {
            mockWidgetRepo.getByOverlayKey.mockResolvedValue({ id: "w_1", owner_id: "u_1", overlay_key: "key_1" } as any);
            const result = await service.validateOverlayAccess("u_1", "key_1");
            expect(result).toBe(true);
        });

        it("should return false if owner mismatches", async () => {
            mockWidgetRepo.getByOverlayKey.mockResolvedValue({ id: "w_1", owner_id: "u_2", overlay_key: "key_1" } as any);
            const result = await service.validateOverlayAccess("u_1", "key_1");
            expect(result).toBe(false);
        });

        it("should return false if widget not found", async () => {
            mockWidgetRepo.getByOverlayKey.mockResolvedValue(null);
            const result = await service.validateOverlayAccess("u_1", "key_1");
            expect(result).toBe(false);
        });

        it("should return false on repository error", async () => {
            mockWidgetRepo.getByOverlayKey.mockRejectedValue(new Error("Repo error"));
            const result = await service.validateOverlayAccess("u_1", "key_1");
            expect(result).toBe(false);
        });
    });

    describe("get", () => {
        it("should use cache", async () => {
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ id: "w_1" }));
            const result = await service.get("w_1");
            expect(result.id).toBe("w_1");
            expect(mockWidgetRepo.get).not.toHaveBeenCalled();
        });

        it("should fetch from repo if not in cache", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockWidgetRepo.get.mockResolvedValue({ id: "w_1" } as any);
            const result = await service.get("w_1");
            expect(result.id).toBe("w_1");
            expect(mockWidgetRepo.get).toHaveBeenCalled();
            expect(redis.set).toHaveBeenCalled();
        });

        it("should throw NotFoundError if missing", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockWidgetRepo.get.mockResolvedValue(null);
            await expect(service.get("w_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("list", () => {
        it("should return list of widgets", async () => {
            mockWidgetRepo.listByOwnerId.mockResolvedValue([[], 0] as any);
            const result = await service.list("u_1", { page: 1, limit: 10 });
            expect(result.data).toEqual([]);
            expect(result.pagination.total).toBe(0);
        });
    });

    describe("refreshOverlayKey", () => {
        it("should refresh key", async () => {
            await service.refreshOverlayKey("w_1");
            expect(mockWidgetRepo.updateOverlayKey).toHaveBeenCalledWith("w_1", "mocked_uuid");
        });
    });

    describe("getFirstEnabled", () => {
        it("should return first enabled widget", async () => {
            mockWidgetRepo.getFirstEnabled.mockResolvedValue({ id: "w_1" } as any);
            const result = await service.getFirstEnabled("u_1");
            expect(result.id).toBe("w_1");
        });

        it("should throw NotFoundError if none found", async () => {
            mockWidgetRepo.getFirstEnabled.mockResolvedValue(null);
            await expect(service.getFirstEnabled("u_1")).rejects.toThrow(NotFoundError);
        });
    });
});
