import ExportVideoService from "./exportVideo.service";
import ExportVideoRepository from "@/repositories/exportVideo/exportVideo.repository";
import UserService from "@/services/user/user.service";
import WidgetService from "../widget.service";
import { NotFoundError } from "@/errors";
import TwitchGql from "@/providers/twitchGql";
import AuthService from "@/services/auth/auth.service";

jest.mock("node:crypto", () => ({
    randomBytes: jest.fn().mockReturnValue({
        toString: jest.fn().mockReturnValue("mocked_hex"),
    }),
    randomUUID: jest.fn().mockReturnValue("mocked_uuid"),
}));

jest.mock("@/libs/twurple", () => ({
    twitchAppAPI: {
        eventSub: {
            getSubscriptionsForUser: jest.fn(),
            subscribeToStreamOfflineEvents: jest.fn(),
        },
        videos: {
            getVideosByUser: jest.fn(),
        },
    },
    createESTransport: jest.fn(),
}));

import { createESTransport, twitchAppAPI } from "@/libs/twurple";

describe("ExportVideoService", () => {
    let service: ExportVideoService;
    let mockExportVideoRepo: jest.Mocked<ExportVideoRepository>;
    let mockUserService: jest.Mocked<UserService>;
    let mockAuthService: jest.Mocked<AuthService>;
    let mockWidgetService: jest.Mocked<WidgetService>;
    let mockTwitchGql: jest.Mocked<TwitchGql>;

    beforeEach(() => {
        mockExportVideoRepo = {
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            get: jest.fn(),
            getByOwnerId: jest.fn(),
            createHistory: jest.fn(),
            listHistoryByExportVideoId: jest.fn(),
            getHistory: jest.fn(),
            deleteHistory: jest.fn(),
        } as any;
        mockUserService = {
            get: jest.fn(),
            getByTwitchId: jest.fn(),
        } as any;
        mockAuthService = {
            getTwitchAccessToken: jest.fn(),
            updateTwitchGqlToken: jest.fn(),
            getTwitchGqlToken: jest.fn(),
        } as any;
        mockWidgetService = {
            setInitialEnabled: jest.fn(),
            authorizeOwnership: jest.fn(),
            delete: jest.fn(),
        } as any;
        mockTwitchGql = {
            exportVideosToYoutube: jest.fn(),
        } as any;

        service = new ExportVideoService(
            mockExportVideoRepo,
            mockUserService,
            mockAuthService,
            mockWidgetService,
            mockTwitchGql
        );
        jest.clearAllMocks();
    });

    describe("create", () => {
        const request = { 
            owner_id: "user_1", 
            twitch_id: "twitch_1", 
            privacy_status: "UNLISTED",
            tags: ["test"],
            description: "test description"
        };

        it("should create export video successfully", async () => {
            mockUserService.get.mockResolvedValue({ id: "user_1", twitch_id: "twitch_1" } as any);
            (twitchAppAPI.eventSub.getSubscriptionsForUser as jest.Mock).mockResolvedValue({ data: [] });
            mockExportVideoRepo.create.mockResolvedValue({ id: "ev_1", widget_id: "widget_1" } as any);
            (createESTransport as jest.Mock).mockReturnValue({});

            await service.create("user_1", request);

            expect(mockUserService.get).toHaveBeenCalledWith(request.owner_id);
            expect(mockExportVideoRepo.create).toHaveBeenCalledWith(expect.objectContaining({
                privacy_status: "UNLISTED",
                tags: ["test"],
                description: "test description"
            }));
            expect(mockWidgetService.setInitialEnabled).toHaveBeenCalledWith("widget_1", "user_1");
        });

    });

    describe("getByUserId", () => {
        it("should return config successfully", async () => {
            const mockRes = { id: "ev_1", widget: { id: "widget_1" } };
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(mockRes as any);

            const result = await service.getByUserId("user_1");

            expect(result).toEqual(mockRes);
            expect(mockWidgetService.authorizeOwnership).toHaveBeenCalledWith("user_1", "widget_1");
        });

        it("should throw NotFoundError if config missing", async () => {
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(null);
            await expect(service.getByUserId("user_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("update", () => {
        it("should update config successfully", async () => {
            const mockExisting = { id: "ev_1", widget: { id: "widget_1" } };
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(mockExisting as any);
            mockExportVideoRepo.update.mockResolvedValue({ id: "ev_1" } as any);

            await service.update("user_1", { 
                enabled: false,
                privacy_status: "PUBLIC",
                tags: ["new"],
                description: "new description"
            });

            expect(mockExportVideoRepo.update).toHaveBeenCalledWith("ev_1", expect.objectContaining({
                enabled: false,
                privacy_status: "PUBLIC",
                tags: ["new"],
                description: "new description"
            }));
            expect(mockWidgetService.authorizeOwnership).toHaveBeenCalledWith("user_1", "widget_1");
        });

        it("should throw NotFoundError if config not found", async () => {
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(null);
            await expect(service.update("user_1", {} as any)).rejects.toThrow(NotFoundError);
        });
    });

    describe("delete", () => {
        it("should delete config successfully", async () => {
            const mockExisting = { id: "ev_1", widget: { id: "widget_1" } };
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(mockExisting as any);

            await service.delete("user_1");

            expect(mockExportVideoRepo.delete).toHaveBeenCalledWith("ev_1");
        });

        it("should return early if config not found", async () => {
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(null);
            await service.delete("user_1");
            expect(mockExportVideoRepo.delete).not.toHaveBeenCalled();
        });
    });

    describe("History methods", () => {
        const mockExisting = { id: "ev_1", widget: { id: "widget_1" } };

        beforeEach(() => {
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(mockExisting as any);
        });

        it("should create history successfully", async () => {
            const mockConfig = { id: "ev_1", widget: { id: "w_1" } };
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(mockConfig as any);
            mockExportVideoRepo.createHistory.mockResolvedValue({ id: 1 } as any);
            const request = { batch_id: "b1", video_id: "v1", status: "PENDING" } as any;

            await service.createHistory("user_1", request);

            expect(mockExportVideoRepo.createHistory).toHaveBeenCalledWith({
                ...request,
                export_video_id: "ev_1"
            });
        });

        it("should throw NotFoundError if config missing during history creation", async () => {
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(null);
            await expect(service.createHistory("user_1", {} as any)).rejects.toThrow(NotFoundError);
        });

        it("should list history successfully", async () => {
            const mockConfig = { id: "ev_1", widget: { id: "w_1" } };
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(mockConfig as any);
            mockExportVideoRepo.listHistoryByExportVideoId.mockResolvedValue([[{ id: 1 }], 1] as any);

            const pagination = { page: 1, limit: 10 };
            const result = await service.listHistory("user_1", pagination);

            expect(result.data).toHaveLength(1);
            expect(result.pagination.total).toBe(1);
            expect(mockExportVideoRepo.listHistoryByExportVideoId).toHaveBeenCalledWith("ev_1", pagination);
        });

        it("should throw NotFoundError if config missing during history listing", async () => {
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(null);
            await expect(service.listHistory("user_1", { page: 1, limit: 10 })).rejects.toThrow(NotFoundError);
        });

        it("should get history successfully", async () => {
            mockExportVideoRepo.getHistory.mockResolvedValue({ id: 1, export_video_id: "ev_1" } as any);

            const result = await service.getHistory("user_1", 1);

            expect(result).toBeDefined();
            expect(mockWidgetService.authorizeOwnership).toHaveBeenCalledWith("user_1", "widget_1");
        });

        it("should throw NotFoundError if history not found", async () => {
            mockExportVideoRepo.getHistory.mockResolvedValue(null);
            await expect(service.getHistory("user_1", 1)).rejects.toThrow(NotFoundError);
        });

        it("should throw NotFoundError if config missing during history retrieval", async () => {
            mockExportVideoRepo.getHistory.mockResolvedValue({ export_video_id: "ev_1" } as any);
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(null);
            await expect(service.getHistory("user_1", 1)).rejects.toThrow(NotFoundError);
        });

        it("should delete history successfully", async () => {
            mockExportVideoRepo.getHistory.mockResolvedValue({ id: 1, export_video_id: "ev_1" } as any);

            await service.deleteHistory("user_1", 1);

            expect(mockExportVideoRepo.deleteHistory).toHaveBeenCalledWith(1);
        });

        it("should return early if history not found during deletion", async () => {
            mockExportVideoRepo.getHistory.mockResolvedValue(null);
            await service.deleteHistory("user_1", 1);
            expect(mockExportVideoRepo.deleteHistory).not.toHaveBeenCalled();
        });

        it("should throw NotFoundError if config missing during history deletion", async () => {
            mockExportVideoRepo.getHistory.mockResolvedValue({ export_video_id: "ev_1" } as any);
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(null);
            await expect(service.deleteHistory("user_1", 1)).rejects.toThrow(NotFoundError);
        });
    });

    describe("exportTwitchVideoToYoutube", () => {
        const mockVideo = { id: "v1", title: "Video 1" } as any;

        it("should export video successfully", async () => {
            const mockConfig = { id: "ev_1", widget: { id: "w_1", enabled: true, twitch_id: "t1" }, description: "desc", tags: ["tag"], privacy_status: "UNLISTED" };
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(mockConfig as any);
            mockTwitchGql.exportVideosToYoutube.mockResolvedValue([{ data: "ok" }] as any);
            mockUserService.getByTwitchId.mockResolvedValue({ id: "u1" } as any);
            mockAuthService.getTwitchGqlToken.mockResolvedValue("mock_gql_token");

            await service.exportTwitchVideoToYoutube("user_1", mockVideo);

            expect(mockTwitchGql.exportVideosToYoutube).toHaveBeenCalled();
            expect(mockExportVideoRepo.createHistory).toHaveBeenCalledWith(expect.objectContaining({
                status: "SUCCESS"
            }));
        });

        it("should throw NotFoundError if config not found", async () => {
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(null);
            await expect(service.exportTwitchVideoToYoutube("user_1", mockVideo)).rejects.toThrow(NotFoundError);
        });

        it("should return early if widget is disabled", async () => {
            const mockConfig = { id: "ev_1", widget: { id: "w_1", enabled: false } };
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(mockConfig as any);

            await service.exportTwitchVideoToYoutube("user_1", mockVideo);

            expect(mockTwitchGql.exportVideosToYoutube).not.toHaveBeenCalled();
        });

        it("should handle GQL errors", async () => {
            const mockConfig = { id: "ev_1", widget: { id: "w_1", enabled: true, twitch_id: "t1" } };
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(mockConfig as any);
            mockUserService.getByTwitchId.mockResolvedValue({ id: "u1" } as any);
            mockAuthService.getTwitchGqlToken.mockResolvedValue("mock_gql_token");
            mockTwitchGql.exportVideosToYoutube.mockResolvedValue([{ errors: ["error"] }] as any);

            await service.exportTwitchVideoToYoutube("user_1", mockVideo);

            expect(mockExportVideoRepo.createHistory).toHaveBeenCalledWith(expect.objectContaining({
                status: "FAILED"
            }));
        });

        it("should handle GQL exceptions", async () => {
            const mockConfig = { id: "ev_1", widget: { id: "w_1", enabled: true, twitch_id: "t1" } };
            mockExportVideoRepo.getByOwnerId.mockResolvedValue(mockConfig as any);
            mockUserService.getByTwitchId.mockResolvedValue({ id: "u1" } as any);
            mockAuthService.getTwitchGqlToken.mockResolvedValue("mock_gql_token");
            mockTwitchGql.exportVideosToYoutube.mockRejectedValue(new Error("Network error"));

            await service.exportTwitchVideoToYoutube("user_1", mockVideo);

            expect(mockExportVideoRepo.createHistory).toHaveBeenCalledWith(expect.objectContaining({
                status: "FAILED",
                message: "Error: Network error"
            }));
        });
    });

    describe("onTwitchStreamOffline", () => {
        const mockEvent = { broadcaster_user_id: "t1" } as any;

        it("should handle offline event successfully", async () => {
            mockUserService.getByTwitchId.mockResolvedValue({ id: "u1" } as any);
            (twitchAppAPI.videos.getVideosByUser as jest.Mock).mockResolvedValue({ data: [{ id: "v1", title: "Video 1" }] });
            mockExportVideoRepo.getByOwnerId.mockResolvedValue({ id: "ev_1", widget: { enabled: true, twitch_id: "t1" } } as any);
            mockAuthService.getTwitchGqlToken.mockResolvedValue("mock_gql_token");
            mockTwitchGql.exportVideosToYoutube.mockResolvedValue([{ data: "ok" }] as any);

            await service.onTwitchStreamOffline(mockEvent);

            expect(mockTwitchGql.exportVideosToYoutube).toHaveBeenCalled();
        });

        it("should return early if user not found", async () => {
            mockUserService.getByTwitchId.mockResolvedValue(null as any);
            await service.onTwitchStreamOffline(mockEvent);
            expect(twitchAppAPI.videos.getVideosByUser).not.toHaveBeenCalled();
        });

        it("should return early if no videos found", async () => {
            mockUserService.getByTwitchId.mockResolvedValue({ id: "u1" } as any);
            (twitchAppAPI.videos.getVideosByUser as jest.Mock).mockResolvedValue({ data: [] });
            await service.onTwitchStreamOffline(mockEvent);
            expect(mockExportVideoRepo.getByOwnerId).not.toHaveBeenCalled();
        });

        it("should return early if twitchAppAPI returns null videos", async () => {
            mockUserService.getByTwitchId.mockResolvedValue({ id: "u1" } as any);
            (twitchAppAPI.videos.getVideosByUser as jest.Mock).mockResolvedValue(null);
            await service.onTwitchStreamOffline(mockEvent);
            expect(mockExportVideoRepo.getByOwnerId).not.toHaveBeenCalled();
        });
    });

    describe("testExport", () => {
        it("should trigger test export successfully", async () => {
            mockUserService.get.mockResolvedValue({ id: "u1", twitch_id: "t1" } as any);
            (twitchAppAPI.videos.getVideosByUser as jest.Mock).mockResolvedValue({ data: [{ id: "v1", title: "Video 1" }] });
            mockExportVideoRepo.getByOwnerId.mockResolvedValue({ id: "ev_1", widget: { enabled: true, twitch_id: "t1" } } as any);
            mockUserService.getByTwitchId.mockResolvedValue({ id: "u1" } as any);
            mockAuthService.getTwitchGqlToken.mockResolvedValue("mock_gql_token");
            mockTwitchGql.exportVideosToYoutube.mockResolvedValue([{ data: "ok" }] as any);

            await service.testExport("u1");

            expect(mockTwitchGql.exportVideosToYoutube).toHaveBeenCalled();
        });

        it("should throw NotFoundError if user not found", async () => {
            mockUserService.get.mockResolvedValue(null as any);
            await expect(service.testExport("u1")).rejects.toThrow(NotFoundError);
        });

        it("should throw error if no videos found on Twitch", async () => {
            mockUserService.get.mockResolvedValue({ id: "u1", twitch_id: "t1" } as any);
            mockExportVideoRepo.getByOwnerId.mockResolvedValue({ id: "ev_1", widget: { enabled: true, twitch_id: "t1" } } as any);
            (twitchAppAPI.videos.getVideosByUser as jest.Mock).mockResolvedValue({ data: [] });
            await expect(service.testExport("u1")).rejects.toThrow(NotFoundError);
        });
    });
});
