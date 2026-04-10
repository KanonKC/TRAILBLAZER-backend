import FirstWordService from "./firstWord.service";
import Configurations from "@/config/index";
import FirstWordRepository from "@/repositories/firstWord/firstWord.repository";
import UserRepository from "@/repositories/user/user.repository";
import WidgetService from "../widget.service";
import redis, { publisher } from "@/libs/redis";
import s3 from "@/libs/awsS3";
import { twitchAppAPI, createESTransport } from "@/libs/twurple";
import { NotFoundError } from "@/errors";
import { randomBytes } from "crypto";

jest.mock("@/libs/redis", () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    publisher: {
        publish: jest.fn(),
    },
    TTL: {
        ONE_DAY: 86400,
        TWO_HOURS: 7200,
    },
}));

jest.mock("@/libs/awsS3", () => ({
    getSignedURL: jest.fn(),
    deleteFile: jest.fn(),
}));

jest.mock("@/libs/twurple", () => ({
    twitchAppAPI: {
        eventSub: {
            getSubscriptionsForUser: jest.fn(),
            subscribeToChannelChatMessageEvents: jest.fn(),
            subscribeToStreamOnlineEvents: jest.fn(),
        },
        chat: {
            sendChatMessageAsApp: jest.fn(),
        },
        users: {
            getUserById: jest.fn(),
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

describe("FirstWordService", () => {
    let service: FirstWordService;
    let mockCfg: Configurations;
    let mockFirstWordRepo: jest.Mocked<FirstWordRepository>;
    let mockUserRepo: jest.Mocked<UserRepository>;
    let mockWidgetService: jest.Mocked<WidgetService>;

    beforeEach(() => {
        mockCfg = {
            twitch: {
                defaultBotId: "default_bot_id",
            },
        } as any;
        mockFirstWordRepo = {
            create: jest.fn(),
            getByOwnerId: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            addChatter: jest.fn(),
            listChatterIdByChannelId: jest.fn(),
            getCustomReplyByTwitchId: jest.fn(),
            clearChatters: jest.fn(),
            listCustomReplies: jest.fn(),
            createCustomReply: jest.fn(),
            updateCustomReply: jest.fn(),
            deleteCustomReply: jest.fn(),
            listChatters: jest.fn(),
        } as any;
        mockUserRepo = {
            get: jest.fn(),
            getByTwitchId: jest.fn(),
        } as any;
        mockWidgetService = {
            setInitialEnabled: jest.fn(),
            authorizeOwnership: jest.fn(),
            authorizeTierUsage: jest.fn(),
        } as any;

        service = new FirstWordService(mockCfg, mockFirstWordRepo, mockUserRepo, mockWidgetService);
        jest.clearAllMocks();
    });

    describe("create", () => {
        const request = { owner_id: "user_1", widget_id: "widget_1" } as any;

        it("should create first word config successfully", async () => {
            const mockUser = { id: "user_1", twitch_id: "twitch_1" };
            mockUserRepo.get.mockResolvedValue(mockUser as any);
            (twitchAppAPI.eventSub.getSubscriptionsForUser as jest.Mock).mockResolvedValue({ data: [] });
            mockFirstWordRepo.create.mockResolvedValue({ id: "fw_1", widget_id: "widget_1" } as any);
            mockFirstWordRepo.getByOwnerId.mockResolvedValue({ widget: { id: "widget_1" } } as any);

            const result = await service.create(request);

            expect(mockUserRepo.get).toHaveBeenCalledWith(request.owner_id);
            expect(twitchAppAPI.eventSub.getSubscriptionsForUser).toHaveBeenCalledWith(mockUser.twitch_id);
            expect(createESTransport).toHaveBeenCalledTimes(2);
            expect(mockFirstWordRepo.create).toHaveBeenCalled();
            expect(mockWidgetService.setInitialEnabled).toHaveBeenCalledWith("widget_1", "user_1");
            expect(result).toBeDefined();
        });

        it("should not subscribe if user already has active subscriptions", async () => {
            const mockUser = { id: "user_1", twitch_id: "twitch_1" };
            mockUserRepo.get.mockResolvedValue(mockUser as any);
            (twitchAppAPI.eventSub.getSubscriptionsForUser as jest.Mock).mockResolvedValue({ 
                data: [
                    { type: 'channel.chat.message', status: 'enabled' },
                    { type: 'stream.online', status: 'enabled' }
                ] 
            });
            mockFirstWordRepo.create.mockResolvedValue({ id: "fw_1", widget_id: "widget_1" } as any);
            mockFirstWordRepo.getByOwnerId.mockResolvedValue({ widget: { id: "widget_1" } } as any);

            await service.create(request);

            expect(createESTransport).not.toHaveBeenCalled();
            expect(twitchAppAPI.eventSub.subscribeToChannelChatMessageEvents).not.toHaveBeenCalled();
            expect(twitchAppAPI.eventSub.subscribeToStreamOnlineEvents).not.toHaveBeenCalled();
        });

        it("should throw NotFoundError if user not found", async () => {
            mockUserRepo.get.mockResolvedValue(null);

            await expect(service.create(request)).rejects.toThrow(NotFoundError);
        });
    });

    describe("getByUserId", () => {
        it("should return config from cache if available", async () => {
            const mockConfig = { widget: { id: "widget_1" } };
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(mockConfig));

            const result = await service.getByUserId("user_1");

            expect(redis.get).toHaveBeenCalled();
            expect(mockFirstWordRepo.getByOwnerId).not.toHaveBeenCalled();
            expect(result).toEqual(mockConfig);
        });

        it("should return config from repository if not in cache", async () => {
            const mockConfig = { widget: { id: "widget_1" } };
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(mockConfig as any);

            const result = await service.getByUserId("user_1");

            expect(mockFirstWordRepo.getByOwnerId).toHaveBeenCalledWith("user_1");
            expect(redis.set).toHaveBeenCalled();
            expect(result).toEqual(mockConfig);
        });

        it("should throw NotFoundError if config not found", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(null);

            await expect(service.getByUserId("user_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("update", () => {
        const data = { reply_message: "new message" } as any;

        it("should update config successfully", async () => {
            const mockExisting = { id: "fw_1", widget: { id: "widget_1" } };
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(mockExisting as any);
            mockFirstWordRepo.update.mockResolvedValue({ ...mockExisting, ...data } as any);
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ widget: { id: "widget_1" } }));

            const result = await service.update("user_1", data);

            expect(mockFirstWordRepo.update).toHaveBeenCalledWith("fw_1", data);
            expect(redis.del).toHaveBeenCalledWith("first_word:owner_id:user_1");
            expect(result).toBeDefined();
        });

        it("should throw NotFoundError if config not found", async () => {
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(null);

            await expect(service.update("user_1", data)).rejects.toThrow(NotFoundError);
        });

        it("should throw error if repository update fails", async () => {
            mockFirstWordRepo.getByOwnerId.mockResolvedValue({ id: "fw_1", widget: { id: "widget_1" } } as any);
            mockFirstWordRepo.update.mockRejectedValue(new Error("DB error"));

            await expect(service.update("user_1", data)).rejects.toThrow("DB error");
        });
    });

    describe("delete", () => {
        it("should delete config and audio file if exists", async () => {
            const mockFirstWord = { id: "fw_1", widget: { id: "widget_1" }, audio_key: "audio_1" };
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(mockFirstWord as any);

            await service.delete("user_1");

            expect(s3.deleteFile).toHaveBeenCalledWith("audio_1");
            expect(mockFirstWordRepo.delete).toHaveBeenCalledWith("fw_1");
            expect(redis.del).toHaveBeenCalledTimes(2);
        });

        it("should do nothing if config not found", async () => {
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(null);

            await service.delete("user_1");

            expect(mockFirstWordRepo.delete).not.toHaveBeenCalled();
        });

        it("should log error but continue if S3 delete fails", async () => {
            const mockFirstWord = { id: "fw_1", widget: { id: "widget_1" }, audio_key: "audio_1" };
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(mockFirstWord as any);
            (s3.deleteFile as jest.Mock).mockRejectedValue(new Error("S3 error"));

            await service.delete("user_1");

            expect(mockFirstWordRepo.delete).toHaveBeenCalledWith("fw_1");
        });

        it("should skip S3 delete if audio_key is missing", async () => {
            const mockFirstWord = { id: "fw_1", widget: { id: "widget_1" }, audio_key: null };
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(mockFirstWord as any);

            await service.delete("user_1");

            expect(s3.deleteFile).not.toHaveBeenCalled();
            expect(mockFirstWordRepo.delete).toHaveBeenCalledWith("fw_1");
        });
    });

    describe("refreshOverlayKey", () => {
        it("should refresh overlay key successfully", async () => {
            const mockFirstWord = { id: "fw_1", widget: { id: "widget_1" } };
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(mockFirstWord as any);
            mockFirstWordRepo.update.mockResolvedValue({ ...mockFirstWord, overlay_key: "new_key" } as any);

            const result = await service.refreshOverlayKey("user_1");

            expect(mockFirstWordRepo.update).toHaveBeenCalledWith("fw_1", expect.objectContaining({ overlay_key: "mocked_hex" }));
            expect(redis.del).toHaveBeenCalledWith("first_word:owner_id:user_1");
            expect(result).toBeDefined();
        });

        it("should throw NotFoundError if config not found", async () => {
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(null);

            await expect(service.refreshOverlayKey("user_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("validateOverlayAccess", () => {
        it("should return true if keys match", async () => {
            const mockFirstWord = { widget: { id: "widget_1", overlay_key: "key_1" } };
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(mockFirstWord));

            const result = await service.validateOverlayAccess("user_1", "key_1");

            expect(result).toBe(true);
        });

        it("should return false if keys do not match", async () => {
            const mockFirstWord = { widget: { id: "widget_1", overlay_key: "key_1" } };
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(mockFirstWord));

            const result = await service.validateOverlayAccess("user_1", "key_2");

            expect(result).toBe(false);
        });

        it("should fetch from repository if not in cache", async () => {
            const mockFirstWord = { widget: { id: "widget_1", overlay_key: "key_1" } };
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(mockFirstWord as any);

            const result = await service.validateOverlayAccess("user_1", "key_1");

            expect(mockFirstWordRepo.getByOwnerId).toHaveBeenCalledWith("user_1");
            expect(redis.set).toHaveBeenCalled();
            expect(result).toBe(true);
        });

        it("should return false if firstWord is not found in repository", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(null);

            const result = await service.validateOverlayAccess("user_1", "key_1");

            expect(result).toBe(false);
        });
    });

    describe("greetNewChatter", () => {
        const event = {
            broadcaster_user_id: "broadcaster_1",
            chatter_user_id: "chatter_1",
            chatter_user_name: "Chatter One",
        } as any;

        it("should greet new chatter successfully", async () => {
            const mockUser = { id: "user_1" };
            const mockFirstWord = { 
                id: "fw_1", 
                widget: { enabled: true },
                reply_message: "Hello {{user_name}}",
                audio_key: "audio_1"
            };
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockUser));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockFirstWord));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify([])); // chatters
            mockFirstWordRepo.getCustomReplyByTwitchId.mockResolvedValue(null);
            (s3.getSignedURL as jest.Mock).mockResolvedValue("signed_url");

            await service.greetNewChatter(event);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith("default_bot_id", "broadcaster_1", "Hello Chatter One");
            expect(publisher.publish).toHaveBeenCalled();
        });

        it("should not greet if widget is disabled", async () => {
            const mockUser = { id: "user_1" };
            const mockFirstWord = { widget: { enabled: false } };
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockUser));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockFirstWord));

            await service.greetNewChatter(event);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).not.toHaveBeenCalled();
        });

        it("should fetch user from repository if not in cache", async () => {
            const mockUser = { id: "user_1" };
            (redis.get as jest.Mock).mockResolvedValueOnce(null);
            mockUserRepo.getByTwitchId.mockResolvedValue(mockUser as any);
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify({ widget: { enabled: false } }));

            await service.greetNewChatter(event);

            expect(mockUserRepo.getByTwitchId).toHaveBeenCalledWith("broadcaster_1");
            expect(redis.set).toHaveBeenCalled();
        });

        it("should throw NotFoundError if user not found", async () => {
            (redis.get as jest.Mock).mockResolvedValueOnce(null);
            mockUserRepo.getByTwitchId.mockResolvedValue(null);

            await expect(service.greetNewChatter(event)).rejects.toThrow(NotFoundError);
        });

        it("should fetch config from repository if not in cache", async () => {
            const mockUser = { id: "user_1" };
            const mockFirstWord = { widget: { enabled: false } };
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockUser));
            (redis.get as jest.Mock).mockResolvedValueOnce(null);
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(mockFirstWord as any);

            await service.greetNewChatter(event);

            expect(mockFirstWordRepo.getByOwnerId).toHaveBeenCalledWith("user_1");
            expect(redis.set).toHaveBeenCalled();
        });

        it("should throw NotFoundError if config not found", async () => {
            const mockUser = { id: "user_1" };
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockUser));
            (redis.get as jest.Mock).mockResolvedValueOnce(null);
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(null);

            await expect(service.greetNewChatter(event)).rejects.toThrow(NotFoundError);
        });

        it("should return early if chatter is the bot itself", async () => {
            const mockUser = { id: "user_1" };
            const mockFirstWord = { 
                id: "fw_1", 
                widget: { enabled: true },
                twitch_bot_id: "bot_1"
            };
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockUser));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockFirstWord));
            
            const botEvent = { ...event, chatter_user_id: "bot_1" };
            await service.greetNewChatter(botEvent);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).not.toHaveBeenCalled();
        });

        it("should fetch chatters from repository if not in cache", async () => {
            const mockUser = { id: "user_1" };
            const mockFirstWord = { 
                id: "fw_1", 
                widget: { enabled: true },
                reply_message: "Hello"
            };
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockUser));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockFirstWord));
            (redis.get as jest.Mock).mockResolvedValueOnce(null); // chatters cache miss
            mockFirstWordRepo.listChatterIdByChannelId.mockResolvedValue([]);

            await service.greetNewChatter(event);

            expect(mockFirstWordRepo.listChatterIdByChannelId).toHaveBeenCalledWith("broadcaster_1");
            expect(redis.set).toHaveBeenCalled();
        });

        it("should return early if user is already greeted", async () => {
            const mockUser = { id: "user_1" };
            const mockFirstWord = { 
                id: "fw_1", 
                widget: { enabled: true }
            };
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockUser));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockFirstWord));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(["chatter_1"]));

            await service.greetNewChatter(event);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).not.toHaveBeenCalled();
        });

        it("should log and return if addChatter fails", async () => {
            const mockUser = { id: "user_1" };
            const mockFirstWord = { 
                id: "fw_1", 
                widget: { enabled: true }
            };
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockUser));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockFirstWord));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify([]));
            mockFirstWordRepo.addChatter.mockRejectedValue(new Error("DB error"));

            await service.greetNewChatter(event);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).not.toHaveBeenCalled();
        });

        it("should greet test user without adding to database", async () => {
            const mockUser = { id: "user_1" };
            const mockFirstWord = { 
                id: "fw_1", 
                widget: { enabled: true },
                reply_message: "Hello"
            };
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockUser));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockFirstWord));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify([]));

            const testEvent = { ...event, chatter_user_id: "0" };
            await service.greetNewChatter(testEvent);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalled();
            expect(mockFirstWordRepo.addChatter).not.toHaveBeenCalled();
        });

        it("should use custom reply overrides if available", async () => {
            const mockUser = { id: "user_1" };
            const mockFirstWord = { 
                id: "fw_1", 
                widget: { enabled: true },
                reply_message: "Default",
                audio_key: "default_audio"
            };
            const mockCustomReply = {
                reply_message: "Custom {{user_name}}",
                audio_key: "custom_audio",
                audio_volume: 50
            };
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockUser));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockFirstWord));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify([]));
            mockFirstWordRepo.getCustomReplyByTwitchId.mockResolvedValue(mockCustomReply as any);
            (s3.getSignedURL as jest.Mock).mockResolvedValue("custom_url");

            await service.greetNewChatter(event);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith("default_bot_id", "broadcaster_1", "Custom Chatter One");
            expect(publisher.publish).toHaveBeenCalledWith("first-word-audio", expect.stringContaining('"audioUrl":"custom_url"'));
            expect(publisher.publish).toHaveBeenCalledWith("first-word-audio", expect.stringContaining('"volume":50'));
        });

        it("should skip chat message if message is empty", async () => {
            const mockUser = { id: "user_1" };
            const mockFirstWord = { 
                id: "fw_1", 
                widget: { enabled: true },
                reply_message: "" // empty
            };
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockUser));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockFirstWord));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify([]));

            await service.greetNewChatter(event);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).not.toHaveBeenCalled();
        });
    });

    describe("resetChattersOnStartStream", () => {
        const event = { broadcaster_user_id: "twitch_1" } as any;

        it("should reset chatters successfully", async () => {
            const mockUser = { id: "user_1" };
            const mockFirstWord = { id: "fw_1" };
            mockUserRepo.getByTwitchId.mockResolvedValue(mockUser as any);
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(mockFirstWord as any);

            await service.resetChattersOnStartStream(event);

            expect(mockFirstWordRepo.clearChatters).toHaveBeenCalledWith("fw_1");
        });

        it("should log error if reset fails", async () => {
            mockUserRepo.getByTwitchId.mockRejectedValue(new Error("DB error"));

            await service.resetChattersOnStartStream(event);
            // Should not throw
        });
    });

    describe("resetChatter", () => {
        it("should reset chatters successfully", async () => {
            const mockUser = { id: "user_1" };
            const mockFirstWord = { id: "fw_1" };
            mockUserRepo.getByTwitchId.mockResolvedValue(mockUser as any);
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(mockFirstWord as any);

            await service.resetChatter("twitch_1");

            expect(mockFirstWordRepo.clearChatters).toHaveBeenCalledWith("fw_1");
            expect(redis.del).toHaveBeenCalledTimes(2);
        });

        it("should throw NotFoundError if user not found", async () => {
            mockUserRepo.getByTwitchId.mockResolvedValue(null);

            await expect(service.resetChatter("twitch_1")).rejects.toThrow(NotFoundError);
        });

        it("should throw NotFoundError if first word config not found", async () => {
            const mockUser = { id: "user_1" };
            mockUserRepo.getByTwitchId.mockResolvedValue(mockUser as any);
            mockFirstWordRepo.getByOwnerId.mockResolvedValue(null);

            await expect(service.resetChatter("twitch_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("clearCaches", () => {
        it("should clear all related caches", async () => {
            (redis.keys as jest.Mock).mockResolvedValue(["key1", "key2"]);

            await service.clearCaches();

            expect(redis.del).toHaveBeenCalledTimes(2);
        });
    });

    describe("listCustomReplies", () => {
        it("should list custom replies", async () => {
            const mockFirstWord = { id: "fw_1", widget: { id: "widget_1" } };
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(mockFirstWord));
            mockFirstWordRepo.listCustomReplies.mockResolvedValue([[], 0]);

            const result = await service.listCustomReplies("user_1", {}, { page: 1, limit: 10 } as any);

            expect(result.data).toEqual([]);
            expect(result.pagination.total).toBe(0);
        });
    });

    describe("createCustomReply", () => {
        const request = { twitch_chatter_id: "chatter_1" } as any;

        it("should create custom reply successfully", async () => {
            (twitchAppAPI.users.getUserById as jest.Mock).mockResolvedValue({ displayName: "Name", profilePictureUrl: "URL" });
            const mockFirstWord = { id: "fw_1", widget: { id: "widget_1" } };
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(mockFirstWord));

            await service.createCustomReply("user_1", request);

            expect(mockFirstWordRepo.createCustomReply).toHaveBeenCalled();
            expect(redis.keys).toHaveBeenCalled();
        });

        it("should throw NotFoundError if twitch user not found", async () => {
            (twitchAppAPI.users.getUserById as jest.Mock).mockResolvedValue(null);

            await expect(service.createCustomReply("user_1", request)).rejects.toThrow(NotFoundError);
        });
    });

    describe("updateCustomReply", () => {
        const request = { twitch_chatter_id: "chatter_1" } as any;

        it("should update custom reply successfully", async () => {
            (twitchAppAPI.users.getUserById as jest.Mock).mockResolvedValue({ displayName: "Name", profilePictureUrl: "URL" });
            const mockFirstWord = { id: "fw_1", widget: { id: "widget_1" } };
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(mockFirstWord));

            await service.updateCustomReply("user_1", 1, request);

            expect(mockFirstWordRepo.updateCustomReply).toHaveBeenCalled();
        });

        it("should throw NotFoundError if twitch user not found", async () => {
            (twitchAppAPI.users.getUserById as jest.Mock).mockResolvedValue(null);
            const mockFirstWord = { id: "fw_1", widget: { id: "widget_1" } };
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(mockFirstWord));

            await expect(service.updateCustomReply("user_1", 1, request)).rejects.toThrow(NotFoundError);
        });

        it("should update custom reply without twitch user info if twitch_chatter_id is missing", async () => {
            const mockFirstWord = { id: "fw_1", widget: { id: "widget_1" } };
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(mockFirstWord));

            await service.updateCustomReply("user_1", 1, { reply_message: "new" });

            expect(twitchAppAPI.users.getUserById).not.toHaveBeenCalled();
            expect(mockFirstWordRepo.updateCustomReply).toHaveBeenCalledWith(1, { reply_message: "new" });
        });
    });

    describe("deleteCustomReply", () => {
        it("should delete custom reply successfully", async () => {
            const mockFirstWord = { id: "fw_1", widget: { id: "widget_1" } };
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(mockFirstWord));

            await service.deleteCustomReply("user_1", 1);

            expect(mockFirstWordRepo.deleteCustomReply).toHaveBeenCalledWith(1);
        });
    });

    describe("listChatters", () => {
        it("should list chatters successfully", async () => {
            const mockFirstWord = { id: "fw_1", widget: { id: "widget_1" } };
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockFirstWord));
            (redis.get as jest.Mock).mockResolvedValueOnce(null); // cache miss
            mockFirstWordRepo.listChatters.mockResolvedValue([[], 0]);

            const result = await service.listChatters("user_1");

            expect(result.data).toEqual([]);
            expect(redis.set).toHaveBeenCalled();
        });

        it("should return cached chatters if available", async () => {
            const mockFirstWord = { id: "fw_1", widget: { id: "widget_1" } };
            const cached = { data: [], pagination: { total: 0 } };
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockFirstWord));
            (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(cached));

            const result = await service.listChatters("user_1");

            expect(result).toEqual(cached);
            expect(mockFirstWordRepo.listChatters).not.toHaveBeenCalled();
        });
    });
});
