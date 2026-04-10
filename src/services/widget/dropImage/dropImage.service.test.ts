import DropImageService from "./dropImage.service";
import DropImageRepository from "@/repositories/dropImage/dropImage.repository";
import UserRepository from "@/repositories/user/user.repository";
import Sightengine from "@/providers/sightengine";
import WidgetService from "../widget.service";
import redis, { publisher } from "@/libs/redis";
import { twitchAppAPI, createESTransport } from "@/libs/twurple";
import axios from "axios";
import { NotFoundError, BadRequestError } from "@/errors";

jest.mock("@/libs/redis", () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    publisher: {
        publish: jest.fn(),
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

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock("node:crypto", () => ({
    randomBytes: jest.fn().mockReturnValue({
        toString: jest.fn().mockReturnValue("mocked_hex"),
    }),
    randomUUID: jest.fn().mockReturnValue("mocked_uuid"),
}));

describe("DropImageService", () => {
    let service: DropImageService;
    let mockDropImageRepo: jest.Mocked<DropImageRepository>;
    let mockUserRepo: jest.Mocked<UserRepository>;
    let mockSightengine: jest.Mocked<Sightengine>;
    let mockWidgetService: jest.Mocked<WidgetService>;

    beforeEach(() => {
        mockDropImageRepo = {
            create: jest.fn(),
            getByOwnerId: jest.fn(),
            getByTwitchRewardId: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        } as any;
        mockUserRepo = {
            get: jest.fn(),
        } as any;
        mockSightengine = {
            detectMatureContent: jest.fn(),
        } as any;
        mockWidgetService = {
            setInitialEnabled: jest.fn(),
            authorizeOwnership: jest.fn(),
            authorizeTierUsage: jest.fn(),
        } as any;

        service = new DropImageService(
            mockDropImageRepo,
            mockUserRepo,
            mockSightengine,
            mockWidgetService
        );
        jest.clearAllMocks();
    });

    describe("getByUserId", () => {
        it("should return config successfully", async () => {
            const mockConfig = { id: "di_1", widget: { id: "widget_1" } };
            mockDropImageRepo.getByOwnerId.mockResolvedValue(mockConfig as any);

            const result = await service.getByUserId("user_1");

            expect(result).toEqual(mockConfig);
            expect(mockWidgetService.authorizeOwnership).toHaveBeenCalledWith("user_1", "widget_1");
        });

        it("should throw NotFoundError if config missing", async () => {
            mockDropImageRepo.getByOwnerId.mockResolvedValue(null);
            await expect(service.getByUserId("user_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("create", () => {
        const request = { userId: "user_1" } as any;

        it("should create drop image config successfully", async () => {
            const mockUser = { id: "user_1", twitch_id: "twitch_1" };
            mockUserRepo.get.mockResolvedValue(mockUser as any);
            mockDropImageRepo.getByOwnerId.mockRejectedValueOnce(null); // No existing
            (twitchAppAPI.eventSub.getSubscriptionsForUser as jest.Mock).mockResolvedValue({ data: [] });
            mockDropImageRepo.create.mockResolvedValue({ id: "di_1", widget_id: "widget_1" } as any);
            mockDropImageRepo.getByOwnerId.mockResolvedValue({ id: "di_1", widget: { id: "widget_1" } } as any);

            const result = await service.create(request);

            expect(mockDropImageRepo.create).toHaveBeenCalled();
            expect(result).toBeDefined();
        });

        it("should throw BadRequestError if config already exists", async () => {
            const mockUser = { id: "user_1", twitch_id: "twitch_1" };
            mockUserRepo.get.mockResolvedValue(mockUser as any);
            mockDropImageRepo.getByOwnerId.mockResolvedValue({ id: "di_1" } as any);

            await expect(service.create(request)).rejects.toThrow(BadRequestError);
        });

        it("should throw NotFoundError if user missing", async () => {
            mockUserRepo.get.mockResolvedValue(null);
            await expect(service.create(request)).rejects.toThrow(NotFoundError);
        });
    });

    describe("handleDropImage", () => {
        const event = {
            channel_points_custom_reward_id: "reward_1",
            message: { text: "https://example.com/image.png" },
            message_id: "msg_1",
            broadcaster_user_id: "broadcaster_1",
        } as any;

        it("should return early if no reward id", async () => {
            await service.handleDropImage({ message: { text: "" } } as any);
            expect(mockDropImageRepo.getByTwitchRewardId).not.toHaveBeenCalled();
        });

        it("should return early if config not found", async () => {
            mockDropImageRepo.getByTwitchRewardId.mockResolvedValue(null);
            await service.handleDropImage(event);
            expect(mockedAxios.get).not.toHaveBeenCalled();
        });

        it("should handle invalid URL", async () => {
            const mockConfig = { 
                twitch_bot_id: "bot_1", 
                invalid_message: "invalid",
                widget: { twitch_id: "twitch_1" }
            };
            mockDropImageRepo.getByTwitchRewardId.mockResolvedValue(mockConfig as any);
            const invalidEvent = { ...event, message: { text: "not-a-url" } };

            await service.handleDropImage(invalidEvent);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith(
                "bot_1", "twitch_1", "invalid", expect.anything()
            );
        });

        it("should handle axios error as invalid URL", async () => {
            const mockConfig = { 
                twitch_bot_id: "bot_1", 
                invalid_message: "invalid",
                widget: { twitch_id: "twitch_1" }
            };
            mockDropImageRepo.getByTwitchRewardId.mockResolvedValue(mockConfig as any);
            mockedAxios.get.mockRejectedValue(new Error("Network error"));

            await service.handleDropImage(event);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith(
                "bot_1", "twitch_1", "invalid", expect.anything()
            );
        });

        it("should handle non-image content type", async () => {
            const mockConfig = { 
                twitch_bot_id: "bot_1", 
                not_image_message: "not-image",
                widget: { twitch_id: "twitch_1" }
            };
            mockDropImageRepo.getByTwitchRewardId.mockResolvedValue(mockConfig as any);
            mockedAxios.get.mockResolvedValue({ 
                headers: { "content-type": "text/html" },
                data: Buffer.from("html")
            });

            await service.handleDropImage(event);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith(
                "bot_1", "twitch_1", "not-image", expect.anything()
            );
        });

        it("should handle mature content moderation", async () => {
            const mockConfig = { 
                twitch_bot_id: "bot_1", 
                enabled_moderation: true,
                contain_mature_message: "mature",
                widget: { twitch_id: "twitch_1" }
            };
            mockDropImageRepo.getByTwitchRewardId.mockResolvedValue(mockConfig as any);
            mockedAxios.get.mockResolvedValue({ 
                headers: { "content-type": "image/png" },
                data: Buffer.from("image")
            });
            mockSightengine.detectMatureContent.mockResolvedValue({
                nudity: { none: 0.5 },
                gore: { prob: 0.6 }
            } as any);

            await service.handleDropImage(event);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith(
                "bot_1", "twitch_1", "mature", expect.anything()
            );
        });

        it("should publish image on success", async () => {
            const mockConfig = { 
                widget: { owner_id: "user_1" }
            };
            mockDropImageRepo.getByTwitchRewardId.mockResolvedValue(mockConfig as any);
            mockedAxios.get.mockResolvedValue({ 
                headers: { "content-type": "image/png" },
                data: Buffer.from("image")
            });

            await service.handleDropImage(event);

            expect(publisher.publish).toHaveBeenCalledWith(
                "drop-image:image-url", 
                expect.stringContaining('"url":"https://example.com/image.png"')
            );
        });

        it("should handle test-message-id branch with invalid URL", async () => {
            const mockConfig = { 
                twitch_bot_id: "bot_1",
                invalid_message: "invalid",
                widget: { owner_id: "user_1", twitch_id: "twitch_1" }
            };
            mockDropImageRepo.getByTwitchRewardId.mockResolvedValue(mockConfig as any);
            const testEvent = { ...event, message_id: "test-message-id-123", message: { text: "not-a-url" } };

            await service.handleDropImage(testEvent);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith(
                "bot_1", "twitch_1", "invalid", 
                expect.objectContaining({ replyParentMessageId: undefined })
            );
        });

        it("should skip chat message if twitch_bot_id is missing on failure", async () => {
            const mockConfig = { 
                invalid_message: "invalid",
                widget: { twitch_id: "twitch_1" }
            };
            mockDropImageRepo.getByTwitchRewardId.mockResolvedValue(mockConfig as any);
            const invalidEvent = { ...event, message: { text: "not-a-url" } };

            await service.handleDropImage(invalidEvent);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).not.toHaveBeenCalled();
        });

        it("should skip chat message if invalid_message is missing on failure", async () => {
            const mockConfig = { 
                twitch_bot_id: "bot_1",
                widget: { twitch_id: "twitch_1" }
            };
            mockDropImageRepo.getByTwitchRewardId.mockResolvedValue(mockConfig as any);
            const invalidEvent = { ...event, message: { text: "not-a-url" } };

            await service.handleDropImage(invalidEvent);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).not.toHaveBeenCalled();
        });

        it("should skip moderation if disabled", async () => {
            const mockConfig = { 
                enabled_moderation: false,
                widget: { owner_id: "user_1" }
            };
            mockDropImageRepo.getByTwitchRewardId.mockResolvedValue(mockConfig as any);
            mockedAxios.get.mockResolvedValue({ 
                headers: { "content-type": "image/png" },
                data: Buffer.from("image")
            });

            await service.handleDropImage(event);

            expect(mockSightengine.detectMatureContent).not.toHaveBeenCalled();
            expect(publisher.publish).toHaveBeenCalled();
        });

        it("should handle mature content but skip message if config missing", async () => {
            const mockConfig = { 
                enabled_moderation: true,
                widget: { twitch_id: "twitch_1" }
            };
            mockDropImageRepo.getByTwitchRewardId.mockResolvedValue(mockConfig as any);
            mockedAxios.get.mockResolvedValue({ 
                headers: { "content-type": "image/png" },
                data: Buffer.from("image")
            });
            mockSightengine.detectMatureContent.mockResolvedValue({
                nudity: { none: 0.5 },
                gore: { prob: 0.6 }
            } as any);

            await service.handleDropImage(event);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).not.toHaveBeenCalled();
        });
    });

    describe("create with existing subscription", () => {
        it("should not subscribe if already exists", async () => {
            const mockUser = { id: "user_1", twitch_id: "twitch_1" };
            mockUserRepo.get.mockResolvedValue(mockUser as any);
            mockDropImageRepo.getByOwnerId.mockRejectedValueOnce(null);
            (twitchAppAPI.eventSub.getSubscriptionsForUser as jest.Mock).mockResolvedValue({ 
                data: [{ type: 'channel.channel_points_custom_reward_redemption.add', status: 'enabled' }] 
            });
            mockDropImageRepo.create.mockResolvedValue({ id: "di_1", widget_id: "widget_1" } as any);
            mockDropImageRepo.getByOwnerId.mockResolvedValue({ id: "di_1", widget: { id: "widget_1" } } as any);

            await service.create({ userId: "user_1" } as any);

            expect(createESTransport).not.toHaveBeenCalled();
        });
    });

    describe("update", () => {
        it("should update successfully", async () => {
            const mockExisting = { id: "di_1", widget: { id: "widget_1", twitch_id: "twitch_1" } };
            mockDropImageRepo.findById.mockResolvedValue(mockExisting as any);
            (twitchAppAPI.eventSub.getSubscriptionsForUser as jest.Mock).mockResolvedValue({ data: [] });

            await service.update("di_1", "user_1", {});

            expect(mockDropImageRepo.update).toHaveBeenCalled();
        });

        it("should log error if subscription fails during update", async () => {
            const mockExisting = { id: "di_1", widget: { id: "widget_1", twitch_id: "twitch_1" } };
            mockDropImageRepo.findById.mockResolvedValue(mockExisting as any);
            (twitchAppAPI.eventSub.getSubscriptionsForUser as jest.Mock).mockRejectedValue(new Error("API Error"));

            await service.update("di_1", "user_1", {});

            expect(mockDropImageRepo.update).toHaveBeenCalled();
        });

        it("should throw NotFoundError if missing", async () => {
            mockDropImageRepo.findById.mockResolvedValue(null);
            await expect(service.update("di_1", "user_1", {})).rejects.toThrow(NotFoundError);
        });
    });

    describe("delete", () => {
        it("should delete successfully", async () => {
            const mockExisting = { id: "di_1", widget: { id: "widget_1" } };
            mockDropImageRepo.getByOwnerId.mockResolvedValue(mockExisting as any);

            await service.delete("user_1");

            expect(mockDropImageRepo.delete).toHaveBeenCalledWith("di_1");
        });

        it("should return early if missing", async () => {
            mockDropImageRepo.getByOwnerId.mockResolvedValue(null);
            await service.delete("user_1");
            expect(mockDropImageRepo.delete).not.toHaveBeenCalled();
        });

        it("should throw error if delete fails", async () => {
            const mockExisting = { id: "di_1", widget: { id: "widget_1" } };
            mockDropImageRepo.getByOwnerId.mockResolvedValue(mockExisting as any);
            mockDropImageRepo.delete.mockRejectedValue(new Error("DB error"));

            await expect(service.delete("user_1")).rejects.toThrow("DB error");
        });
    });

    describe("refreshOverlayKey", () => {
        it("should refresh key successfully", async () => {
            const mockExisting = { id: "di_1", widget: { id: "widget_1" } };
            mockDropImageRepo.getByOwnerId.mockResolvedValue(mockExisting as any);

            await service.refreshOverlayKey("user_1");

            expect(mockDropImageRepo.update).toHaveBeenCalledWith("di_1", expect.objectContaining({ overlay_key: "mocked_uuid" }));
        });

        it("should throw NotFoundError if missing", async () => {
            mockDropImageRepo.getByOwnerId.mockResolvedValue(null);
            await expect(service.refreshOverlayKey("user_1")).rejects.toThrow(NotFoundError);
        });
    });
});
