import ClipShoutoutService from "./clipShoutout.service";
import Configurations from "@/config/index";
import ClipShoutoutRepository from "@/repositories/clipShoutout/clipShoutout.repository";
import UserRepository from "@/repositories/user/user.repository";
import AuthService from "../../auth/auth.service";
import TwitchGql from "@/providers/twitchGql";
import WidgetService from "../widget.service";
import redis, { publisher, TTL } from "@/libs/redis";
import { twitchAppAPI, createESTransport } from "@/libs/twurple";
import { NotFoundError } from "@/errors";

jest.mock("@/libs/redis", () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    publisher: {
        publish: jest.fn(),
    },
    TTL: {
        ONE_DAY: 86400,
        TWO_HOURS: 7200,
        TEN_SECONDS: 10,
    },
}));

jest.mock("@/libs/twurple", () => ({
    twitchAppAPI: {
        eventSub: {
            getSubscriptionsForUser: jest.fn(),
            subscribeToChannelChatNotificationEvents: jest.fn(),
        },
        chat: {
            sendChatMessageAsApp: jest.fn(),
        },
        clips: {
            getClipsForBroadcaster: jest.fn(),
        },
    },
    createESTransport: jest.fn(),
}));

jest.mock("crypto", () => ({
    randomBytes: jest.fn().mockReturnValue({
        toString: jest.fn().mockReturnValue("mocked_hex"),
    }),
    randomUUID: jest.fn().mockReturnValue("mocked_uuid"),
}));

describe("ClipShoutoutService", () => {
    let service: ClipShoutoutService;
    let mockCfg: Configurations;
    let mockClipShoutoutRepo: jest.Mocked<ClipShoutoutRepository>;
    let mockUserRepo: jest.Mocked<UserRepository>;
    let mockAuthService: jest.Mocked<AuthService>;
    let mockTwitchGql: jest.Mocked<TwitchGql>;
    let mockWidgetService: jest.Mocked<WidgetService>;

    beforeEach(() => {
        mockCfg = {
            twitch: {
                defaultBotId: "default_bot_id",
            },
        } as any;
        mockClipShoutoutRepo = {
            create: jest.fn(),
            getByOwnerId: jest.fn(),
            getByTwitchId: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        } as any;
        mockUserRepo = {
            get: jest.fn(),
        } as any;
        mockAuthService = {
            createTwitchUserAPI: jest.fn(),
        } as any;
        mockTwitchGql = {
            getClipProductionUrl: jest.fn(),
        } as any;
        mockWidgetService = {
            setInitialEnabled: jest.fn(),
            authorizeOwnership: jest.fn(),
            authorizeTierUsage: jest.fn(),
        } as any;

        service = new ClipShoutoutService(
            mockCfg,
            mockClipShoutoutRepo,
            mockUserRepo,
            mockAuthService,
            mockTwitchGql,
            mockWidgetService
        );
        jest.clearAllMocks();
    });

    describe("create", () => {
        const request = { owner_id: "user_1", twitch_id: "twitch_1" } as any;

        it("should create clip shoutout config successfully", async () => {
            const mockUser = { id: "user_1", twitch_id: "twitch_1" };
            mockUserRepo.get.mockResolvedValue(mockUser as any);
            (twitchAppAPI.eventSub.getSubscriptionsForUser as jest.Mock).mockResolvedValue({ data: [] });
            mockClipShoutoutRepo.create.mockResolvedValue({ id: "cs_1", widget_id: "widget_1" } as any);
            mockClipShoutoutRepo.getByOwnerId.mockResolvedValue({ widget: { id: "widget_1" } } as any);

            const result = await service.create(request);

            expect(mockUserRepo.get).toHaveBeenCalledWith(request.owner_id);
            expect(createESTransport).toHaveBeenCalled();
            expect(mockClipShoutoutRepo.create).toHaveBeenCalled();
            expect(result).toBeDefined();
        });

        it("should skip subscription if already exists", async () => {
            const mockUser = { id: "user_1", twitch_id: "twitch_1" };
            mockUserRepo.get.mockResolvedValue(mockUser as any);
            (twitchAppAPI.eventSub.getSubscriptionsForUser as jest.Mock).mockResolvedValue({ 
                data: [{ type: 'channel.chat.notification', status: 'enabled' }] 
            });
            mockClipShoutoutRepo.create.mockResolvedValue({ id: "cs_1", widget_id: "widget_1" } as any);
            mockClipShoutoutRepo.getByOwnerId.mockResolvedValue({ widget: { id: "widget_1" } } as any);

            await service.create(request);

            expect(createESTransport).not.toHaveBeenCalled();
            expect(mockClipShoutoutRepo.create).toHaveBeenCalled();
        });

        it("should throw NotFoundError if user not found", async () => {
            mockUserRepo.get.mockResolvedValue(null);
            await expect(service.create(request)).rejects.toThrow(NotFoundError);
        });
    });

    describe("shoutoutRaider", () => {
        const event = {
            notice_type: "raid",
            raid: {
                user_id: "raider_1",
                user_name: "RaiderOne",
                user_login: "raiderone",
                viewer_count: 50,
            },
            broadcaster_user_id: "broadcaster_1",
        } as any;

        it("should return early if not a raid", async () => {
            await service.shoutoutRaider({ notice_type: "sub" } as any);
            expect(redis.get).not.toHaveBeenCalled();
        });

        it("should return early if cooldown active", async () => {
            (redis.get as jest.Mock).mockResolvedValue("true");
            await service.shoutoutRaider(event);
            expect(mockClipShoutoutRepo.getByTwitchId).not.toHaveBeenCalled();
        });

        it("should shoutout and send message successfully", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            const mockCsConfig = {
                id: "cs_1",
                twitch_bot_id: "bot_1",
                reply_message: "Hello {{user_name}}",
                enabled_clip: true,
                widget: { enabled: true, twitch_id: "broadcaster_1", owner_id: "user_1" }
            };
            mockClipShoutoutRepo.getByTwitchId.mockResolvedValue(mockCsConfig as any);
            const mockUserAPI = { chat: { shoutoutUser: jest.fn() } };
            mockAuthService.createTwitchUserAPI.mockResolvedValue(mockUserAPI as any);
            (twitchAppAPI.clips.getClipsForBroadcaster as jest.Mock).mockResolvedValue({ data: [{ id: "clip_1", duration: 30 }] });
            mockTwitchGql.getClipProductionUrl.mockResolvedValue("clip_url");

            await service.shoutoutRaider(event);

            expect(mockUserAPI.chat.shoutoutUser).toHaveBeenCalledWith("broadcaster_1", "raider_1");
            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith("bot_1", "broadcaster_1", "Hello RaiderOne");
            expect(publisher.publish).toHaveBeenCalledWith("clip-shoutout-clip", expect.stringContaining('"url":"clip_url"'));
        });

        it("should log error but continue if shoutout fails", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            const mockCsConfig = {
                id: "cs_1",
                reply_message: "Hello",
                widget: { enabled: true, twitch_id: "broadcaster_1" }
            };
            mockClipShoutoutRepo.getByTwitchId.mockResolvedValue(mockCsConfig as any);
            mockAuthService.createTwitchUserAPI.mockRejectedValue(new Error("Shoutout Error"));

            await service.shoutoutRaider(event);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalled();
        });

        it("should return early if config missing or disabled", async () => {
            (redis.get as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
            mockClipShoutoutRepo.getByTwitchId.mockResolvedValue(null);

            await service.shoutoutRaider(event);

            expect(mockAuthService.createTwitchUserAPI).not.toHaveBeenCalled();

            mockClipShoutoutRepo.getByTwitchId.mockResolvedValue({ widget: { enabled: false } } as any);
            await service.shoutoutRaider(event);
            expect(mockAuthService.createTwitchUserAPI).not.toHaveBeenCalled();
        });

        it("should use cache for config", async () => {
            (redis.get as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify({ widget: { enabled: true } }));
            await service.shoutoutRaider(event);
            expect(mockClipShoutoutRepo.getByTwitchId).not.toHaveBeenCalled();
        });
    });

    describe("getByUserId", () => {
        it("should return config successfully", async () => {
            const mockRes = { id: "cs_1", widget: { id: "widget_1" } };
            mockClipShoutoutRepo.getByOwnerId.mockResolvedValue(mockRes as any);

            const result = await service.getByUserId("user_1");

            expect(result).toEqual(mockRes);
            expect(mockWidgetService.authorizeOwnership).toHaveBeenCalledWith("user_1", "widget_1");
        });

        it("should throw NotFoundError if config missing", async () => {
            mockClipShoutoutRepo.getByOwnerId.mockResolvedValue(null);
            await expect(service.getByUserId("user_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("update", () => {
        it("should update config successfully", async () => {
            const mockExisting = { id: "cs_1", widget: { id: "widget_1", twitch_id: "twitch_1" } };
            mockClipShoutoutRepo.findById.mockResolvedValue(mockExisting as any);
            mockClipShoutoutRepo.update.mockResolvedValue({ id: "cs_1" } as any);

            await service.update("cs_1", "user_1", { reply_message: "new" });

            expect(mockClipShoutoutRepo.update).toHaveBeenCalled();
            expect(redis.del).toHaveBeenCalled();
        });

        it("should throw NotFoundError if config missing", async () => {
            mockClipShoutoutRepo.findById.mockResolvedValue(null);
            await expect(service.update("cs_1", "user_1", {})).rejects.toThrow(NotFoundError);
        });
    });

    describe("delete", () => {
        it("should delete config successfully", async () => {
            const mockExisting = { id: "cs_1", widget: { id: "widget_1", twitch_id: "twitch_1" } };
            mockClipShoutoutRepo.getByOwnerId.mockResolvedValue(mockExisting as any);

            await service.delete("user_1");

            expect(mockClipShoutoutRepo.delete).toHaveBeenCalledWith("cs_1");
            expect(redis.del).toHaveBeenCalled();
        });

        it("should return early if config missing", async () => {
            mockClipShoutoutRepo.getByOwnerId.mockResolvedValue(null);
            await service.delete("user_1");
            expect(mockClipShoutoutRepo.delete).not.toHaveBeenCalled();
        });
    });

    describe("getOverlay", () => {
        it("should return config successfully", async () => {
            const mockRes = { id: "cs_1" };
            mockClipShoutoutRepo.findById.mockResolvedValue(mockRes as any);

            const result = await service.getOverlay("cs_1");

            expect(result).toEqual(mockRes);
        });

        it("should throw NotFoundError if config missing", async () => {
            mockClipShoutoutRepo.findById.mockResolvedValue(null);
            await expect(service.getOverlay("cs_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("refreshOverlayKey", () => {
        it("should refresh key successfully", async () => {
            const mockExisting = { id: "cs_1", widget: { id: "widget_1", twitch_id: "twitch_1" } };
            mockClipShoutoutRepo.getByOwnerId.mockResolvedValue(mockExisting as any);
            mockClipShoutoutRepo.update.mockResolvedValue({ id: "cs_1" } as any);

            await service.refreshOverlayKey("user_1");

            expect(mockClipShoutoutRepo.update).toHaveBeenCalledWith("cs_1", expect.objectContaining({ overlay_key: "mocked_hex" }));
            expect(redis.del).toHaveBeenCalled();
        });

        it("should throw NotFoundError if config missing", async () => {
            mockClipShoutoutRepo.getByOwnerId.mockResolvedValue(null);
            await expect(service.refreshOverlayKey("user_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("validateOverlayAccess", () => {
        it("should return true if keys match", async () => {
            const mockConfig = { widget: { overlay_key: "key_1" } };
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(mockConfig));

            const result = await service.validateOverlayAccess("user_1", "key_1");

            expect(result).toBe(true);
        });

        it("should return false if keys do not match", async () => {
            const mockConfig = { widget: { overlay_key: "key_1" } };
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(mockConfig));

            const result = await service.validateOverlayAccess("user_1", "key_2");

            expect(result).toBe(false);
        });

        it("should fetch from repository if not in cache", async () => {
            const mockConfig = { widget: { overlay_key: "key_1" } };
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockClipShoutoutRepo.getByOwnerId.mockResolvedValue(mockConfig as any);

            const result = await service.validateOverlayAccess("user_1", "key_1");

            expect(mockClipShoutoutRepo.getByOwnerId).toHaveBeenCalledWith("user_1");
            expect(redis.set).toHaveBeenCalled();
            expect(result).toBe(true);
        });

        it("should return false if config not found in repository", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockClipShoutoutRepo.getByOwnerId.mockResolvedValue(null);

            const result = await service.validateOverlayAccess("user_1", "key_1");

            expect(result).toBe(false);
        });
    });
});
