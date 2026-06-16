import SpotifySongRequestService from "./spotifySongRequest.service";
import SpotifySongRequestRepository from "@/repositories/spotifySongRequest/spotifySongRequest.repository";
import UserRepository from "@/repositories/user/user.repository";
import Spotify from "@/providers/spotify";
import WidgetService from "@/services/widget/widget.service";
import AuthService from "@/services/auth/auth.service";
import { twitchAppAPI, createESTransport } from "@/libs/twurple";
import { ForbiddenError, NotFoundError } from "@/errors";
import { NoActiveDeviceError } from "./error";

jest.mock("@/libs/twurple", () => ({
    twitchAppAPI: {
        eventSub: {
            getSubscriptionsForUser: jest.fn(),
            subscribeToChannelChatMessageEvents: jest.fn(),
        },
        chat: { sendChatMessageAsApp: jest.fn() },
    },
    createESTransport: jest.fn(),
}));

jest.mock("node:crypto", () => ({
    randomBytes: jest.fn().mockReturnValue({ toString: jest.fn().mockReturnValue("mocked_hex") }),
}));

const mockConfig = {
    id: "ssr_1",
    widget_id: "widget_1",
    twitch_reward_id: "reward_1",
    twitch_bot_id: "bot_1",
    invalid_message: "Invalid track",
    success_message: "Added {{track_name}} by {{track_artist}}",
    no_active_message: "No active device",
    widget: {
        id: "widget_1",
        owner_id: "user_1",
        twitch_id: "twitch_1",
        enabled: true,
    },
} as any;

const mockEvent = {
    broadcaster_user_id: "twitch_1",
    chatter_user_id: "chatter_1",
    message_id: "msg_1",
    channel_points_custom_reward_id: "reward_1",
    message: { text: "some track query" },
} as any;

describe("SpotifySongRequestService", () => {
    let service: SpotifySongRequestService;
    let mockSpotifyRepo: jest.Mocked<SpotifySongRequestRepository>;
    let mockUserRepo: jest.Mocked<UserRepository>;
    let mockSpotify: jest.Mocked<Spotify>;
    let mockWidgetService: jest.Mocked<WidgetService>;
    let mockAuthService: jest.Mocked<AuthService>;
    let mockSpotifyAPI: any;

    beforeEach(() => {
        mockSpotifyAPI = {
            tracks: { get: jest.fn() },
            search: jest.fn(),
            player: { addItemToPlaybackQueue: jest.fn() },
        };

        mockSpotifyRepo = {
            create: jest.fn(),
            update: jest.fn(),
            get: jest.fn(),
            getByOwnerId: jest.fn(),
            getByTwitchId: jest.fn(),
            delete: jest.fn(),
        } as any;

        mockUserRepo = {
            get: jest.fn(),
            getByTwitchId: jest.fn(),
        } as any;

        mockSpotify = {
            createUserAPI: jest.fn().mockResolvedValue(mockSpotifyAPI),
        } as any;

        mockWidgetService = {
            setInitialEnabled: jest.fn(),
            authorizeOwnership: jest.fn(),
            authorizeTierUsage: jest.fn(),
        } as any;

        mockAuthService = {
            createTwitchUserAPI: jest.fn(),
        } as any;

        service = new SpotifySongRequestService(
            mockSpotifyRepo,
            mockUserRepo,
            mockSpotify,
            mockWidgetService,
            mockAuthService,
        );

        jest.clearAllMocks();
        mockSpotify.createUserAPI.mockResolvedValue(mockSpotifyAPI);
        (mockAuthService.createTwitchUserAPI as jest.Mock).mockResolvedValue({});
    });

    describe("create", () => {
        const request = { twitch_id: "twitch_1", owner_id: "user_1" };
        const mockUser = { id: "user_1", twitch_id: "twitch_1" };

        it("should create config and subscribe to EventSub when no existing subscription", async () => {
            mockUserRepo.get.mockResolvedValue(mockUser as any);
            (twitchAppAPI.eventSub.getSubscriptionsForUser as jest.Mock).mockResolvedValue({ data: [] });
            (createESTransport as jest.Mock).mockReturnValue("transport");
            mockSpotifyRepo.create.mockResolvedValue(mockConfig);
            mockWidgetService.setInitialEnabled.mockResolvedValue(undefined as any);

            const result = await service.create(request);

            expect(mockUserRepo.get).toHaveBeenCalledWith("user_1");
            expect(twitchAppAPI.eventSub.subscribeToChannelChatMessageEvents).toHaveBeenCalledWith("twitch_1", "transport");
            expect(mockSpotifyRepo.create).toHaveBeenCalledWith(expect.objectContaining({
                twitch_id: "twitch_1",
                owner_id: "user_1",
                overlay_key: "mocked_hex",
            }));
            expect(mockWidgetService.setInitialEnabled).toHaveBeenCalledWith(mockConfig.widget_id, "user_1");
            expect(result).toBe(mockConfig);
        });

        it("should throw NotFoundError if user not found", async () => {
            mockUserRepo.get.mockResolvedValue(null);

            await expect(service.create(request)).rejects.toThrow(NotFoundError);
        });

        it("should skip creating EventSub subscription if one already exists and is enabled", async () => {
            mockUserRepo.get.mockResolvedValue(mockUser as any);
            (twitchAppAPI.eventSub.getSubscriptionsForUser as jest.Mock).mockResolvedValue({
                data: [{ status: "enabled", type: "channel.chat.message" }],
            });
            mockSpotifyRepo.create.mockResolvedValue(mockConfig);
            mockWidgetService.setInitialEnabled.mockResolvedValue(undefined as any);

            await service.create(request);

            expect(twitchAppAPI.eventSub.subscribeToChannelChatMessageEvents).not.toHaveBeenCalled();
        });
    });

    describe("getByUserId", () => {
        it("should return config when found", async () => {
            mockSpotifyRepo.getByOwnerId.mockResolvedValue(mockConfig);

            const result = await service.getByUserId("user_1");

            expect(mockSpotifyRepo.getByOwnerId).toHaveBeenCalledWith("user_1");
            expect(result).toBe(mockConfig);
        });

        it("should throw NotFoundError when config not found", async () => {
            mockSpotifyRepo.getByOwnerId.mockResolvedValue(null);

            await expect(service.getByUserId("user_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("update", () => {
        it("should update config successfully when authorized", async () => {
            const updateData = { twitch_reward_id: "new_reward" };
            const updatedConfig = { ...mockConfig, twitch_reward_id: "new_reward" };
            mockSpotifyRepo.getByOwnerId.mockResolvedValue(mockConfig);
            mockSpotifyRepo.update.mockResolvedValue(updatedConfig as any);

            const result = await service.update("user_1", updateData);

            expect(mockSpotifyRepo.update).toHaveBeenCalledWith("ssr_1", updateData);
            expect(result).toBe(updatedConfig);
        });

        it("should throw ForbiddenError if user does not own the config", async () => {
            const foreignConfig = { ...mockConfig, widget: { ...mockConfig.widget, owner_id: "other_user" } };
            mockSpotifyRepo.getByOwnerId.mockResolvedValue(foreignConfig as any);

            await expect(service.update("user_1", {})).rejects.toThrow(ForbiddenError);
        });
    });

    describe("delete", () => {
        it("should delete config successfully when authorized", async () => {
            mockSpotifyRepo.getByOwnerId.mockResolvedValue(mockConfig);

            await service.delete("user_1");

            expect(mockSpotifyRepo.delete).toHaveBeenCalledWith("ssr_1");
        });

        it("should return early without error if config not found", async () => {
            mockSpotifyRepo.getByOwnerId.mockResolvedValue(null);

            await expect(service.delete("user_1")).resolves.toBeUndefined();
            expect(mockSpotifyRepo.delete).not.toHaveBeenCalled();
        });

        it("should throw ForbiddenError if user does not own the config", async () => {
            const foreignConfig = { ...mockConfig, widget: { ...mockConfig.widget, owner_id: "other_user" } };
            mockSpotifyRepo.getByOwnerId.mockResolvedValue(foreignConfig as any);

            await expect(service.delete("user_1")).rejects.toThrow(ForbiddenError);
        });
    });

    describe("getByTwitchId", () => {
        it("should return config from repository", async () => {
            mockSpotifyRepo.getByTwitchId.mockResolvedValue(mockConfig);

            const result = await service.getByTwitchId("twitch_1");

            expect(mockSpotifyRepo.getByTwitchId).toHaveBeenCalledWith("twitch_1");
            expect(result).toBe(mockConfig);
        });

        it("should return null if not found", async () => {
            mockSpotifyRepo.getByTwitchId.mockResolvedValue(null);

            const result = await service.getByTwitchId("twitch_1");

            expect(result).toBeNull();
        });
    });

    describe("test", () => {
        it("should call handleTwitchEvent with a fake event using the config's twitch ID and reward ID", async () => {
            mockSpotifyRepo.getByOwnerId.mockResolvedValue(mockConfig);
            mockSpotifyRepo.getByTwitchId.mockResolvedValue(mockConfig);
            const mockTrack = {
                name: "Test Track",
                artists: [{ name: "Artist" }],
                external_urls: { spotify: "https://spotify.com/track/abc" },
                uri: "spotify:track:abc",
            };
            mockSpotifyAPI.tracks.get.mockResolvedValue(mockTrack);
            mockSpotifyAPI.player.addItemToPlaybackQueue.mockResolvedValue(undefined);

            await service.test("user_1");

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith(
                "bot_1",
                "twitch_1",
                expect.any(String),
                expect.objectContaining({ replyParentMessageId: undefined })
            );
        });

        it("should throw error if twitch_reward_id is not configured", async () => {
            const configNoReward = { ...mockConfig, twitch_reward_id: null };
            mockSpotifyRepo.getByOwnerId.mockResolvedValue(configNoReward as any);

            await expect(service.test("user_1")).rejects.toThrow("No reward configured");
        });
    });

    describe("insertSpotifyTrack", () => {
        it("should insert track by search query and return track info", async () => {
            const mockTrack = {
                name: "My Song",
                artists: [{ name: "Artist A" }, { name: "Artist B" }],
                external_urls: { spotify: "https://spotify.com/track/xyz" },
                uri: "spotify:track:xyz",
            };
            mockSpotifyAPI.search.mockResolvedValue({ tracks: { items: [mockTrack] } });
            mockSpotifyAPI.player.addItemToPlaybackQueue.mockResolvedValue(undefined);

            const result = await service.insertSpotifyTrack("user_1", "my song artist a");

            expect(mockSpotify.createUserAPI).toHaveBeenCalledWith("user_1");
            expect(mockSpotifyAPI.search).toHaveBeenCalledWith("my song artist a", ["track"]);
            expect(mockSpotifyAPI.player.addItemToPlaybackQueue).toHaveBeenCalledWith("spotify:track:xyz");
            expect(result).toEqual({
                name: "My Song",
                artists: ["Artist A", "Artist B"],
                url: "https://spotify.com/track/xyz",
            });
        });

        it("should insert track by Spotify URL using tracks.get", async () => {
            const mockTrack = {
                name: "Direct Track",
                artists: [{ name: "Singer" }],
                external_urls: { spotify: "https://spotify.com/track/abc123" },
                uri: "spotify:track:abc123",
            };
            mockSpotifyAPI.tracks.get.mockResolvedValue(mockTrack);
            mockSpotifyAPI.player.addItemToPlaybackQueue.mockResolvedValue(undefined);

            const result = await service.insertSpotifyTrack("user_1", "https://open.spotify.com/track/abc123");

            expect(mockSpotifyAPI.tracks.get).toHaveBeenCalledWith("abc123");
            expect(mockSpotifyAPI.search).not.toHaveBeenCalled();
            expect(result.name).toBe("Direct Track");
        });

        it("should throw error when search returns no results", async () => {
            mockSpotifyAPI.search.mockResolvedValue({ tracks: { items: [] } });

            await expect(service.insertSpotifyTrack("user_1", "unknown song")).rejects.toThrow("Track not found");
        });

        it("should throw NoActiveDeviceError when Spotify returns NO_ACTIVE_DEVICE", async () => {
            const mockTrack = {
                name: "T", artists: [{ name: "A" }],
                external_urls: { spotify: "u" }, uri: "spotify:track:t",
            };
            mockSpotifyAPI.search.mockResolvedValue({ tracks: { items: [mockTrack] } });
            mockSpotifyAPI.player.addItemToPlaybackQueue.mockRejectedValue(new Error("NO_ACTIVE_DEVICE"));

            await expect(service.insertSpotifyTrack("user_1", "some song")).rejects.toThrow(NoActiveDeviceError);
        });

        it("should silently ignore Unexpected token errors from addItemToPlaybackQueue", async () => {
            const mockTrack = {
                name: "T", artists: [{ name: "A" }],
                external_urls: { spotify: "u" }, uri: "spotify:track:t",
            };
            mockSpotifyAPI.search.mockResolvedValue({ tracks: { items: [mockTrack] } });
            mockSpotifyAPI.player.addItemToPlaybackQueue.mockRejectedValue(new Error("Unexpected token < in JSON"));

            const result = await service.insertSpotifyTrack("user_1", "some song");

            expect(result).toEqual({ name: "T", artists: ["A"], url: "u" });
        });

        it("should silently ignore unknown errors from addItemToPlaybackQueue and still return track info", async () => {
            const mockTrack = {
                name: "T", artists: [{ name: "A" }],
                external_urls: { spotify: "u" }, uri: "spotify:track:t",
            };
            mockSpotifyAPI.search.mockResolvedValue({ tracks: { items: [mockTrack] } });
            mockSpotifyAPI.player.addItemToPlaybackQueue.mockRejectedValue(new Error("Internal server error"));

            const result = await service.insertSpotifyTrack("user_1", "some song");

            expect(result).toEqual({ name: "T", artists: ["A"], url: "u" });
        });
    });

    describe("handleTwitchEvent", () => {
        beforeEach(() => {
            mockSpotifyRepo.getByTwitchId.mockResolvedValue(mockConfig);
            mockSpotifyRepo.getByOwnerId.mockResolvedValue(mockConfig);
        });

        it("should return early if channel_points_custom_reward_id is absent", async () => {
            await service.handleTwitchEvent({ ...mockEvent, channel_points_custom_reward_id: null });

            expect(mockSpotifyRepo.getByTwitchId).not.toHaveBeenCalled();
        });

        it("should return early if config not found for broadcaster", async () => {
            mockSpotifyRepo.getByTwitchId.mockResolvedValue(null);

            await service.handleTwitchEvent(mockEvent);

            expect(mockAuthService.createTwitchUserAPI).not.toHaveBeenCalled();
        });

        it("should return early if widget is disabled", async () => {
            const disabledConfig = { ...mockConfig, widget: { ...mockConfig.widget, enabled: false } };
            mockSpotifyRepo.getByTwitchId.mockResolvedValue(disabledConfig as any);

            await service.handleTwitchEvent(mockEvent);

            expect(mockAuthService.createTwitchUserAPI).not.toHaveBeenCalled();
        });

        it("should return early if reward ID does not match config", async () => {
            await service.handleTwitchEvent({ ...mockEvent, channel_points_custom_reward_id: "wrong_reward" });

            expect(mockAuthService.createTwitchUserAPI).not.toHaveBeenCalled();
        });

        it("should send success message with track_name and track_artist substituted", async () => {
            const mockTrack = {
                name: "Cool Song",
                artists: [{ name: "DJ One" }, { name: "DJ Two" }],
                external_urls: { spotify: "https://spotify.com/track/cool" },
                uri: "spotify:track:cool",
            };
            mockSpotifyAPI.search.mockResolvedValue({ tracks: { items: [mockTrack] } });
            mockSpotifyAPI.player.addItemToPlaybackQueue.mockResolvedValue(undefined);

            await service.handleTwitchEvent(mockEvent);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith(
                "bot_1",
                "twitch_1",
                "Added Cool Song by DJ One, DJ Two",
                expect.objectContaining({ replyParentMessageId: "msg_1" })
            );
        });

        it("should send no_active_message when NoActiveDeviceError is thrown", async () => {
            mockSpotifyAPI.search.mockResolvedValue({ tracks: { items: [{ name: "T", artists: [{ name: "A" }], external_urls: { spotify: "u" }, uri: "spotify:track:t" }] } });
            mockSpotifyAPI.player.addItemToPlaybackQueue.mockRejectedValue(new Error("NO_ACTIVE_DEVICE"));

            await service.handleTwitchEvent(mockEvent);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith(
                "bot_1",
                "twitch_1",
                "No active device",
                expect.any(Object)
            );
        });

        it("should send invalid_message when a generic error is thrown", async () => {
            mockSpotifyAPI.search.mockRejectedValue(new Error("Spotify API failure"));

            await service.handleTwitchEvent(mockEvent);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith(
                "bot_1",
                "twitch_1",
                "Invalid track",
                expect.any(Object)
            );
        });

        it("should not set replyParentMessageId for test mode messages", async () => {
            mockSpotifyAPI.tracks.get.mockResolvedValue({
                name: "T", artists: [{ name: "A" }],
                external_urls: { spotify: "u" }, uri: "spotify:track:t",
            });
            mockSpotifyAPI.player.addItemToPlaybackQueue.mockResolvedValue(undefined);

            await service.handleTwitchEvent({
                ...mockEvent,
                message_id: "test-message-id-1234",
                message: { text: "https://open.spotify.com/track/abc" },
            });

            expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith(
                "bot_1",
                "twitch_1",
                expect.any(String),
                expect.objectContaining({ replyParentMessageId: undefined })
            );
        });

        it("should not send chat message if twitch_bot_id is null", async () => {
            const configNoBot = { ...mockConfig, twitch_bot_id: null };
            mockSpotifyRepo.getByTwitchId.mockResolvedValue(configNoBot as any);
            mockSpotifyAPI.search.mockResolvedValue({ tracks: { items: [{ name: "T", artists: [{ name: "A" }], external_urls: { spotify: "u" }, uri: "spotify:track:t" }] } });
            mockSpotifyAPI.player.addItemToPlaybackQueue.mockResolvedValue(undefined);

            await service.handleTwitchEvent(mockEvent);

            expect(twitchAppAPI.chat.sendChatMessageAsApp).not.toHaveBeenCalled();
        });
    });
});
