import RandomDbdPerkService from "./randomDbdPerk.service";
import RandomDbdPerkRepository from "@/repositories/randomDbdPerk/randomDbdPerk.repository";
import UserRepository from "@/repositories/user/user.repository";
import WidgetService from "../widget.service";
import redis, { TTL } from "@/libs/redis";
import { twitchAppAPI, createESTransport } from "@/libs/twurple";
import { NotFoundError } from "@/errors";
import { RandomDbdPerkClassType } from "@/repositories/randomDbdPerk/request";

jest.mock("@/libs/redis", () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    TTL: {
        ONE_DAY: 86400,
    },
}));

jest.mock("@/libs/twurple", () => ({
    twitchAppAPI: {
        eventSub: {
            getSubscriptionsForUser: jest.fn(),
            subscribeToChannelRedemptionAddEvents: jest.fn(),
        },
        chat: {
            sendChatMessageAsApp: jest.fn(),
        },
    },
    createESTransport: jest.fn(),
}));

jest.mock("crypto", () => ({
    randomUUID: jest.fn().mockReturnValue("mocked_uuid"),
}));

describe("RandomDbdPerkService", () => {
    let service: RandomDbdPerkService;
    let mockRandomDbdPerkRepo: jest.Mocked<RandomDbdPerkRepository>;
    let mockUserRepo: jest.Mocked<UserRepository>;
    let mockWidgetService: jest.Mocked<WidgetService>;

    beforeEach(() => {
        mockRandomDbdPerkRepo = {
            create: jest.fn(),
            getByOwnerId: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            getClassByRewardId: jest.fn(),
        } as any;
        mockUserRepo = {
            get: jest.fn(),
        } as any;
        mockWidgetService = {
            setInitialEnabled: jest.fn(),
            authorizeOwnership: jest.fn(),
            authorizeTierUsage: jest.fn(),
            updateOverlayKey: jest.fn(),
        } as any;

        service = new RandomDbdPerkService(
            mockRandomDbdPerkRepo,
            mockUserRepo,
            mockWidgetService
        );
        jest.clearAllMocks();
    });

    describe("extend", () => {
        it("should extend widget with perk counts", async () => {
            const rw = { id: "rw_1" } as any;
            const result = await service.extend(rw);
            expect(result.totalKillerPerks).toBe(145);
            expect(result.totalSurvivorPerks).toBe(170);
        });
    });

    describe("create", () => {
        const request = { owner_id: "user_1" } as any;

        it("should create successfully", async () => {
            const mockUser = { id: "user_1", twitch_id: "twitch_1" };
            mockUserRepo.get.mockResolvedValue(mockUser as any);
            (twitchAppAPI.eventSub.getSubscriptionsForUser as jest.Mock).mockResolvedValue({ data: [] });
            mockRandomDbdPerkRepo.create.mockResolvedValue({ id: "rw_1", widget_id: "widget_1" } as any);
            mockRandomDbdPerkRepo.getByOwnerId.mockResolvedValue({ id: "rw_1", widget: { id: "widget_1" } } as any);

            const result = await service.create(request);

            expect(mockRandomDbdPerkRepo.create).toHaveBeenCalled();
            expect(result).toBeDefined();
        });

        it("should throw NotFoundError if user missing", async () => {
            mockUserRepo.get.mockResolvedValue(null);
            await expect(service.create(request)).rejects.toThrow(NotFoundError);
        });

        it("should skip subscription if already exists", async () => {
            const mockUser = { id: "user_1", twitch_id: "twitch_1" };
            mockUserRepo.get.mockResolvedValue(mockUser as any);
            (twitchAppAPI.eventSub.getSubscriptionsForUser as jest.Mock).mockResolvedValue({ 
                data: [{ type: 'channel.channel_points_custom_reward_redemption.add', status: 'enabled' }] 
            });
            mockRandomDbdPerkRepo.create.mockResolvedValue({ id: "rw_1", widget_id: "widget_1" } as any);
            mockRandomDbdPerkRepo.getByOwnerId.mockResolvedValue({ id: "rw_1", widget: { id: "widget_1" } } as any);

            await service.create(request);

            expect(createESTransport).not.toHaveBeenCalled();
        });
    });

    describe("update", () => {
        it("should update successfully and cap random size", async () => {
            const mockExisting = { id: "rw_1", widget: { id: "widget_1", owner_id: "user_1", twitch_id: "twitch_1" } };
            mockRandomDbdPerkRepo.findById.mockResolvedValue(mockExisting as any);
            mockRandomDbdPerkRepo.update.mockResolvedValue(mockExisting as any);

            const updateReq = { 
                classes: [
                    { type: RandomDbdPerkClassType.KILLER, maximum_random_size: 200 },
                    { type: RandomDbdPerkClassType.SURVIVOR, maximum_random_size: 50 }
                ] 
            };
            await service.update("rw_1", "user_1", updateReq);

            expect(updateReq.classes[0].maximum_random_size).toBe(999);
            expect(updateReq.classes[1].maximum_random_size).toBe(50);
            expect(mockRandomDbdPerkRepo.update).toHaveBeenCalled();
            expect(redis.del).toHaveBeenCalled();
        });

        it("should throw NotFoundError if missing", async () => {
            mockRandomDbdPerkRepo.findById.mockResolvedValue(null);
            await expect(service.update("rw_1", "user_1", {})).rejects.toThrow(NotFoundError);
        });
    });

    describe("delete", () => {
        it("should delete successfully", async () => {
            const mockExisting = { id: "rw_1", widget: { id: "widget_1", twitch_id: "twitch_1" } };
            mockRandomDbdPerkRepo.getByOwnerId.mockResolvedValue(mockExisting as any);

            await service.delete("user_1");

            expect(mockRandomDbdPerkRepo.delete).toHaveBeenCalledWith("rw_1");
        });

        it("should return early if missing", async () => {
            mockRandomDbdPerkRepo.getByOwnerId.mockResolvedValue(null);
            await service.delete("user_1");
            expect(mockRandomDbdPerkRepo.delete).not.toHaveBeenCalled();
        });
    });

    describe("getByUserId", () => {
        it("should return config successfully", async () => {
            mockRandomDbdPerkRepo.getByOwnerId.mockResolvedValue({ id: "rw_1", widget: { id: "widget_1" } } as any);
            const result = await service.getByUserId("user_1");
            expect(result).toBeDefined();
        });

        it("should throw NotFoundError if missing", async () => {
            mockRandomDbdPerkRepo.getByOwnerId.mockResolvedValue(null);
            await expect(service.getByUserId("user_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("randomPerk", () => {
        const event = {
            reward: { id: "reward_1" },
            broadcaster_user_id: "broadcaster_1",
        } as any;

        it("should return early if class not found", async () => {
            mockRandomDbdPerkRepo.getClassByRewardId.mockResolvedValue(null);
            await service.randomPerk(event);
            expect(twitchAppAPI.chat.sendChatMessageAsApp).not.toHaveBeenCalled();
        });

        it("should successfully random 4 perks and handle duplicates", async () => {
            const mockClass = { type: RandomDbdPerkClassType.SURVIVOR, maximum_random_size: 100 };
            mockRandomDbdPerkRepo.getClassByRewardId.mockResolvedValue(mockClass as any);

            // Mock Math.random to return the same value once, then different values
            const mockRandom = jest.spyOn(Math, 'random')
                .mockReturnValueOnce(0.1) // Perk 11
                .mockReturnValueOnce(0.1) // Perk 11 (duplicate)
                .mockReturnValueOnce(0.2) // Perk 21
                .mockReturnValueOnce(0.3) // Perk 31
                .mockReturnValueOnce(0.4); // Perk 41

            await service.randomPerk(event);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalled();
            mockRandom.mockRestore();
        });

        it("should successfully random perks with small max size", async () => {
            const mockClass = { type: RandomDbdPerkClassType.SURVIVOR, maximum_random_size: 2 };
            mockRandomDbdPerkRepo.getClassByRewardId.mockResolvedValue(mockClass as any);

            await service.randomPerk(event);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalled();
        });

        it("should handle error during chat sending", async () => {
            const mockClass = { type: RandomDbdPerkClassType.KILLER, maximum_random_size: 50 };
            mockRandomDbdPerkRepo.getClassByRewardId.mockResolvedValue(mockClass as any);
            (twitchAppAPI.chat.sendChatMessageAsApp as jest.Mock).mockRejectedValue(new Error("Chat Error"));

            await service.randomPerk(event);
            // Should not throw
        });
    });

    describe("validateOverlayAccess", () => {
        it("should return true if keys match (cache)", async () => {
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ widget: { overlay_key: "key_1" } }));
            const result = await service.validateOverlayAccess("user_1", "key_1");
            expect(result).toBe(true);
        });

        it("should return false if keys mismatch", async () => {
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ widget: { overlay_key: "key_1" } }));
            const result = await service.validateOverlayAccess("user_1", "key_2");
            expect(result).toBe(false);
        });

        it("should fetch from repository if not in cache", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockRandomDbdPerkRepo.getByOwnerId.mockResolvedValue({ widget: { overlay_key: "key_1" } } as any);
            const result = await service.validateOverlayAccess("user_1", "key_1");
            expect(result).toBe(true);
            expect(redis.set).toHaveBeenCalled();
        });

        it("should return false if config missing", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockRandomDbdPerkRepo.getByOwnerId.mockResolvedValue(null);
            const result = await service.validateOverlayAccess("user_1", "key_1");
            expect(result).toBe(false);
        });
    });

    describe("refreshKey", () => {
        it("should refresh key successfully", async () => {
            const mockExisting = { id: "rw_1", widget: { id: "widget_1" } };
            mockRandomDbdPerkRepo.getByOwnerId.mockResolvedValue(mockExisting as any);

            const result = await service.refreshKey("user_1");

            expect(result.overlay_key).toBe("mocked_uuid");
            expect(mockWidgetService.updateOverlayKey).toHaveBeenCalledWith("widget_1", "mocked_uuid");
            expect(redis.del).toHaveBeenCalled();
        });

        it("should throw NotFoundError if missing", async () => {
            mockRandomDbdPerkRepo.getByOwnerId.mockResolvedValue(null);
            await expect(service.refreshKey("user_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("trigger", () => {
        it("should trigger successfully", async () => {
            mockRandomDbdPerkRepo.getByOwnerId.mockResolvedValue({ id: "rw_1", widget: { id: "widget_1" } } as any);
            await service.trigger("user_1");
        });
    });
});
