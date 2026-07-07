import RandomDBDKillerService from "./randomDBDKiller.service";
import RandomDBDKillerRepository from "@/repositories/randomDBDKiller/randomDBDKiller.repository";
import DBDKillerMasterRepository from "@/repositories/dbdKillerMaster/dbdKillerMaster.repository";
import UserRepository from "@/repositories/user/user.repository";
import WidgetService from "../widget.service";
import redis, { publisher } from "@/libs/redis";
import { twitchAppAPI, createESTransport } from "@/libs/twurple";
import { BadRequestError, NotFoundError } from "@/errors";

jest.mock("@/libs/redis", () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
    },
    publisher: {
        publish: jest.fn(),
    },
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
    },
    createESTransport: jest.fn(),
}));

jest.mock("crypto", () => ({
    randomUUID: jest.fn().mockReturnValue("mocked_uuid"),
}));

describe("RandomDBDKillerService", () => {
    let service: RandomDBDKillerService;
    let mockRepo: jest.Mocked<RandomDBDKillerRepository>;
    let mockMasterRepo: jest.Mocked<DBDKillerMasterRepository>;
    let mockUserRepo: jest.Mocked<UserRepository>;
    let mockWidgetService: jest.Mocked<WidgetService>;

    beforeEach(() => {
        mockRepo = {
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findById: jest.fn(),
            getByOwnerId: jest.fn(),
            getByTwitchId: jest.fn(),
            getByTwitchRewardId: jest.fn(),
        } as any;
        mockMasterRepo = {
            getBySlug: jest.fn(),
            getBySlugs: jest.fn(),
        } as any;
        mockUserRepo = {
            get: jest.fn(),
        } as any;
        mockWidgetService = {
            setInitialEnabled: jest.fn(),
            authorizeOwnership: jest.fn(),
            updateOverlayKey: jest.fn(),
            validateOverlayAccess: jest.fn(),
            increaseTriggeredCount: jest.fn(),
        } as any;

        service = new RandomDBDKillerService(
            mockRepo,
            mockMasterRepo,
            mockUserRepo,
            mockWidgetService
        );
        jest.clearAllMocks();
    });

    describe("create", () => {
        const request = { owner_id: "user_1", twitch_id: "twitch_1", twitch_reward_id: "reward_1" };

        it("should create successfully", async () => {
            const mockUser = { id: "user_1", twitch_id: "twitch_1" };
            mockUserRepo.get.mockResolvedValue(mockUser as any);
            (twitchAppAPI.eventSub.getSubscriptionsForUser as jest.Mock).mockResolvedValue({ data: [] });
            mockRepo.create.mockResolvedValue({ id: "rw_1", widget_id: "widget_1" } as any);
            mockRepo.getByOwnerId.mockResolvedValue({ id: "rw_1", widget: { id: "widget_1" } } as any);

            const result = await service.create(request);

            expect(mockRepo.create).toHaveBeenCalledWith(request);
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
            mockRepo.create.mockResolvedValue({ id: "rw_1", widget_id: "widget_1" } as any);
            mockRepo.getByOwnerId.mockResolvedValue({ id: "rw_1", widget: { id: "widget_1" } } as any);

            await service.create(request);

            expect(createESTransport).not.toHaveBeenCalled();
        });
    });

    describe("update", () => {
        it("should update successfully", async () => {
            const mockExisting = { id: "rw_1", widget: { id: "widget_1", owner_id: "user_1", twitch_id: "twitch_1" } };
            mockRepo.findById.mockResolvedValue(mockExisting as any);
            mockRepo.update.mockResolvedValue(mockExisting as any);
            mockMasterRepo.getBySlugs.mockResolvedValue([{ slug: "trapper" }, { slug: "wraith" }] as any);

            await service.update("rw_1", "user_1", { killer_pool: ["trapper", "wraith"] });

            expect(mockRepo.update).toHaveBeenCalled();
            expect(redis.del).toHaveBeenCalled();
        });

        it("should throw NotFoundError if missing", async () => {
            mockRepo.findById.mockResolvedValue(null);
            await expect(service.update("rw_1", "user_1", {})).rejects.toThrow(NotFoundError);
        });

        it("should throw BadRequestError for unknown killer slug", async () => {
            const mockExisting = { id: "rw_1", widget: { id: "widget_1", owner_id: "user_1", twitch_id: "twitch_1" } };
            mockRepo.findById.mockResolvedValue(mockExisting as any);
            mockMasterRepo.getBySlugs.mockResolvedValue([{ slug: "trapper" }] as any);

            await expect(service.update("rw_1", "user_1", { killer_pool: ["trapper", "unknown-slug"] }))
                .rejects.toThrow(BadRequestError);
        });
    });

    describe("delete", () => {
        it("should delete successfully", async () => {
            const mockExisting = { id: "rw_1", widget: { id: "widget_1", twitch_id: "twitch_1" } };
            mockRepo.getByOwnerId.mockResolvedValue(mockExisting as any);

            await service.delete("user_1");

            expect(mockRepo.delete).toHaveBeenCalledWith("rw_1");
        });

        it("should return early if missing", async () => {
            mockRepo.getByOwnerId.mockResolvedValue(null);
            await service.delete("user_1");
            expect(mockRepo.delete).not.toHaveBeenCalled();
        });
    });

    describe("getByUserId", () => {
        it("should return config successfully", async () => {
            mockRepo.getByOwnerId.mockResolvedValue({ id: "rw_1", widget: { id: "widget_1" } } as any);
            const result = await service.getByUserId("user_1");
            expect(result).toBeDefined();
        });

        it("should throw NotFoundError if missing", async () => {
            mockRepo.getByOwnerId.mockResolvedValue(null);
            await expect(service.getByUserId("user_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("randomizeKiller", () => {
        const event = {
            reward: { id: "reward_1" },
            broadcaster_user_id: "broadcaster_1",
        } as any;

        it("should return early if config not found", async () => {
            mockRepo.getByTwitchRewardId.mockResolvedValue(null);
            await service.randomizeKiller(event);
            expect(publisher.publish).not.toHaveBeenCalled();
        });

        it("should return early if killer pool is empty", async () => {
            mockRepo.getByTwitchRewardId.mockResolvedValue({
                widget_id: "widget_1",
                killer_pool: [],
                widget: { owner_id: "user_1" }
            } as any);
            await service.randomizeKiller(event);
            expect(publisher.publish).not.toHaveBeenCalled();
        });

        it("should return early if killer master not found", async () => {
            mockRepo.getByTwitchRewardId.mockResolvedValue({
                widget_id: "widget_1",
                killer_pool: ["trapper"],
                widget: { owner_id: "user_1" }
            } as any);
            mockMasterRepo.getBySlug.mockResolvedValue(null);

            await service.randomizeKiller(event);

            expect(publisher.publish).not.toHaveBeenCalled();
        });

        it("should publish result and increase triggered count on success", async () => {
            mockRepo.getByTwitchRewardId.mockResolvedValue({
                widget_id: "widget_1",
                killer_pool: ["trapper"],
                widget: { owner_id: "user_1" }
            } as any);
            mockMasterRepo.getBySlug.mockResolvedValue({ slug: "trapper", title: "The Trapper", image_url: "url" } as any);

            await service.randomizeKiller(event);

            expect(publisher.publish).toHaveBeenCalledWith("random-dbd-killer:result", JSON.stringify({
                userId: "user_1",
                killer: { slug: "trapper", title: "The Trapper", image_url: "url" }
            }));
            expect(mockWidgetService.increaseTriggeredCount).toHaveBeenCalledWith("widget_1");
        });
    });

    describe("validateOverlayAccess", () => {
        it("should delegate to widgetService", async () => {
            mockWidgetService.validateOverlayAccess.mockResolvedValue(true);
            const result = await service.validateOverlayAccess("user_1", "key_1");
            expect(result).toBe(true);
            expect(mockWidgetService.validateOverlayAccess).toHaveBeenCalledWith("user_1", "key_1");
        });
    });

    describe("refreshKey", () => {
        it("should refresh key successfully", async () => {
            const mockExisting = { id: "rw_1", widget: { id: "widget_1" } };
            mockRepo.getByOwnerId.mockResolvedValue(mockExisting as any);

            const result = await service.refreshKey("user_1");

            expect(result.overlay_key).toBe("mocked_uuid");
            expect(mockWidgetService.updateOverlayKey).toHaveBeenCalledWith("widget_1", "mocked_uuid");
            expect(redis.del).toHaveBeenCalled();
        });

        it("should throw NotFoundError if missing", async () => {
            mockRepo.getByOwnerId.mockResolvedValue(null);
            await expect(service.refreshKey("user_1")).rejects.toThrow(NotFoundError);
        });
    });
});
