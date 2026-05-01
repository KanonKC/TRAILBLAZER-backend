import { NotFoundError } from "@/errors";
import { TwitchStreamOfflineEventRequest } from "@/events/twitch/streamOffline/request";
import { createESTransport, twitchAppAPI } from "@/libs/twurple";
import TLogger, { Layer } from "@/logging/logger";
import TwitchGql from "@/providers/twitchGql";
import { ExportVideoToYoutubeRequest } from "@/providers/twitchGql/request";
import ExportVideoRepository from "@/repositories/exportVideo/exportVideo.repository";
import { ExportVideoHistoryResponse, ExportVideoWithWidget } from "@/repositories/exportVideo/response";
import UserService from "@/services/user/user.service";
import { HelixVideo } from "@twurple/api";
import WidgetService from "../widget.service";
import { ListResponse, Pagination } from "@/services/response";
import AuthService from "@/services/auth/auth.service";
import { CreateExportVideo, CreateExportVideoHistory, UpdateExportVideo } from "@/repositories/exportVideo/request";

export default class ExportVideoService {
    private readonly exportVideoRepository: ExportVideoRepository;
    private readonly userService: UserService;
    private readonly authService: AuthService;
    private readonly widgetService: WidgetService;
    private readonly logger: TLogger;
    private readonly twitchGql: TwitchGql;

    constructor(
        exportVideoRepository: ExportVideoRepository,
        userService: UserService,
        authService: AuthService,
        widgetService: WidgetService,
        twitchGql: TwitchGql
    ) {
        this.exportVideoRepository = exportVideoRepository;
        this.userService = userService;
        this.authService = authService;
        this.widgetService = widgetService;
        this.logger = new TLogger(Layer.SERVICE);
        this.twitchGql = twitchGql;
    }

    async create(userId: string, request: Omit<CreateExportVideo, "owner_id" | "twitch_id">): Promise<void> {
        this.logger.setContext("service.exportVideo.create");
        const user = await this.userService.get(userId);

        const userSubs = await twitchAppAPI.eventSub.getSubscriptionsForUser(user.twitch_id);
        const enabledSubs = userSubs.data.filter(sub => sub.status === 'enabled')

        const streamOfflineSubs = enabledSubs.filter(sub => sub.type === 'stream.offline')
        if (streamOfflineSubs.length === 0) {
            const tsp = createESTransport("/webhook/v1/twitch/event-sub/stream-offline")
            await twitchAppAPI.eventSub.subscribeToStreamOfflineEvents(user.twitch_id, tsp)
        }

        const config = await this.exportVideoRepository.create({
            ...request,
            owner_id: userId,
            twitch_id: user.twitch_id
        } as CreateExportVideo);
        await this.widgetService.setInitialEnabled(config.widget_id, userId);
    }

    async update(userId: string, request: UpdateExportVideo): Promise<void> {
        this.logger.setContext("service.exportVideo.update");
        const config = await this.exportVideoRepository.getByOwnerId(userId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        await this.widgetService.authorizeOwnership(userId, config.widget.id);
        await this.exportVideoRepository.update(config.id, request);
    }

    async getByUserId(userId: string): Promise<ExportVideoWithWidget> {
        this.logger.setContext("service.exportVideo.getByUserId");
        const config = await this.exportVideoRepository.getByOwnerId(userId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        await this.widgetService.authorizeOwnership(userId, config.widget.id);
        return config;
    }

    async delete(userId: string): Promise<void> {
        this.logger.setContext("service.exportVideo.delete");
        const config = await this.exportVideoRepository.getByOwnerId(userId);
        if (!config) {
            return;
        }
        await this.widgetService.delete(config.widget_id, userId);
        await this.exportVideoRepository.delete(config.id);
    }

    async createHistory(userId: string, request: Omit<CreateExportVideoHistory, "export_video_id">): Promise<void> {
        this.logger.setContext("service.exportVideo.createHistory");
        const config = await this.exportVideoRepository.getByOwnerId(userId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        await this.exportVideoRepository.createHistory({
            ...request,
            export_video_id: config.id
        } as CreateExportVideoHistory);
    }

    async listHistory(userId: string, pagination: Pagination): Promise<ListResponse<ExportVideoHistoryResponse>> {
        this.logger.setContext("service.exportVideo.listHistory");
        const config = await this.exportVideoRepository.getByOwnerId(userId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        const [data, total] = await this.exportVideoRepository.listHistoryByExportVideoId(config.id, pagination);
        return {
            data,
            pagination: {
                ...pagination,
                total
            }
        };
    }

    async getHistory(userId: string, historyId: number): Promise<ExportVideoHistoryResponse> {
        this.logger.setContext("service.exportVideo.getHistory");
        const config = await this.exportVideoRepository.getByOwnerId(userId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        const history = await this.exportVideoRepository.getHistory(historyId);
        if (!history || history.export_video_id !== config.id) {
            throw new NotFoundError("History not found");
        }
        await this.widgetService.authorizeOwnership(userId, config.widget.id);
        return history;
    }

    async deleteHistory(userId: string, historyId: number): Promise<void> {
        this.logger.setContext("service.exportVideo.deleteHistory");
        const config = await this.exportVideoRepository.getByOwnerId(userId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        const history = await this.exportVideoRepository.getHistory(historyId);
        if (!history || history.export_video_id !== config.id) {
            return;
        }
        await this.widgetService.authorizeOwnership(userId, config.widget.id);
        await this.exportVideoRepository.deleteHistory(historyId);
    }

    async exportTwitchVideoToYoutube(userId: string, video: HelixVideo): Promise<void> {
        this.logger.setContext("service.exportVideo.exportTwitchVideoToYoutube");
        const config = await this.exportVideoRepository.getByOwnerId(userId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }

        if (!config.widget.enabled) {
            return
        }

        const req: ExportVideoToYoutubeRequest[] = [{
            videoId: video.id,
            title: video.title,
            description: config.description || "",
            tags: config.tags,
            privacyStatus: (config.privacy_status as any) || "UNLISTED",
            doSplit: false
        }]

        let reqLog: Omit<CreateExportVideoHistory, "export_video_id"> = {
            batch_id: null,
            video_id: video.id,
            status: "SUCCESS",
        }

        try {
            const user = await this.userService.getByTwitchId(config.widget.twitch_id);
            const gqlToken = await this.authService.getTwitchGqlToken(user.id);
            
            if (!gqlToken) {
                this.logger.warn({ message: "No Twitch GQL token found, sync via extension required", data: { userId: user.id } });
                reqLog.status = "FAILED";
                reqLog.message = "Missing Twitch session token. Please sync using the Blaze extension.";
            } else {
                const res = await this.twitchGql.exportVideosToYoutube(req, gqlToken)
                const result = res[0]
                if (result.errors) {
                    reqLog.status = "FAILED"
                    reqLog.message = JSON.stringify(result.errors)
                }
                if (result.data) {
                    reqLog.message = JSON.stringify(result.data)
                }
            }
            await this.createHistory(userId, reqLog)
        } catch (err) {
            reqLog.status = "FAILED"
            reqLog.message = String(err)
            await this.createHistory(userId, reqLog)
        }
    }

    async onTwitchStreamOffline(e: TwitchStreamOfflineEventRequest): Promise<void> {
        this.logger.setContext("service.exportVideo.onTwitchStreamOffline");
        const twitchId = e.broadcaster_user_id
        const user = await this.userService.getByTwitchId(twitchId)
        if (!user) {
            return
        }

        const video = await twitchAppAPI.videos.getVideosByUser(twitchId, {
            orderBy: "time"
        })
        if (!video) {
            return
        }
        if (video.data.length === 0) {
            return
        }

        const latestVideo = video.data[0]
        await this.exportTwitchVideoToYoutube(user.id, latestVideo)
    }

    async testExport(userId: string): Promise<void> {
        this.logger.setContext("service.exportVideo.testExport");
        const config = await this.exportVideoRepository.getByOwnerId(userId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        const video = await twitchAppAPI.videos.getVideosByUser(config.widget.twitch_id, {
            orderBy: "time",
            limit: 1
        })
        if (video.data.length === 0) {
            throw new NotFoundError("No videos found to test export");
        }
        await this.exportTwitchVideoToYoutube(userId, video.data[0])
    }
}
