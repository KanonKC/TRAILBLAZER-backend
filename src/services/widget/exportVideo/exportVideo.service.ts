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

    async create(transactionId: string, userId: string, request: Omit<CreateExportVideo, "owner_id" | "twitch_id">): Promise<ExportVideoWithWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.create", transactionId);
        const user = await this.userService.get(transactionId, userId);

        const userSubs = await twitchAppAPI.eventSub.getSubscriptionsForUser(user.twitch_id);
        const enabledSubs = userSubs.data.filter(sub => sub.status === 'enabled')

        const streamOfflineSubs = enabledSubs.filter(sub => sub.type === 'stream.offline')
        if (streamOfflineSubs.length === 0) {
            const tsp = createESTransport("/webhook/v1/twitch/event-sub/stream-offline")
            await twitchAppAPI.eventSub.subscribeToStreamOfflineEvents(user.twitch_id, tsp)
        }

        const config = await this.exportVideoRepository.create(transactionId, {
            ...request,
            owner_id: userId,
            twitch_id: user.twitch_id
        } as CreateExportVideo);
        await this.widgetService.setInitialEnabled(transactionId, config.widget_id, userId);
        return config;
    }

    async update(transactionId: string, userId: string, request: UpdateExportVideo): Promise<ExportVideoWithWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.update", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(transactionId, userId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        await this.widgetService.authorizeOwnership(transactionId, userId, config.widget.id);
        return await this.exportVideoRepository.update(transactionId, config.id, request);
    }

    async getByUserId(transactionId: string, userId: string): Promise<ExportVideoWithWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.getByUserId", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(transactionId, userId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        await this.widgetService.authorizeOwnership(transactionId, userId, config.widget.id);
        return config;
    }

    async delete(transactionId: string, userId: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.delete", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(transactionId, userId);
        if (!config) {
            return;
        }
        await this.widgetService.delete(transactionId, config.widget_id, userId);
        await this.exportVideoRepository.delete(transactionId, config.id);
    }

    async createHistory(transactionId: string, userId: string, request: Omit<CreateExportVideoHistory, "export_video_id">): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.createHistory", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(transactionId, userId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        await this.exportVideoRepository.createHistory(transactionId, {
            ...request,
            export_video_id: config.id
        } as CreateExportVideoHistory);
    }

    async listHistory(transactionId: string, userId: string, pagination: Pagination): Promise<ListResponse<ExportVideoHistoryResponse>> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.listHistory", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(transactionId, userId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        const [data, total] = await this.exportVideoRepository.listHistoryByExportVideoId(transactionId, config.id, pagination);
        return {
            data,
            pagination: {
                ...pagination,
                total
            }
        };
    }

    async getHistory(transactionId: string, userId: string, historyId: number): Promise<ExportVideoHistoryResponse> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.getHistory", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(transactionId, userId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        const history = await this.exportVideoRepository.getHistory(transactionId, historyId);
        if (!history || history.export_video_id !== config.id) {
            throw new NotFoundError("History not found");
        }
        await this.widgetService.authorizeOwnership(transactionId, userId, config.widget.id);
        return history;
    }

    async deleteHistory(transactionId: string, userId: string, historyId: number): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.deleteHistory", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(transactionId, userId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        const history = await this.exportVideoRepository.getHistory(transactionId, historyId);
        if (!history || history.export_video_id !== config.id) {
            return;
        }
        await this.widgetService.authorizeOwnership(transactionId, userId, config.widget.id);
        await this.exportVideoRepository.deleteHistory(transactionId, historyId);
    }

    async exportTwitchVideoToYoutube(transactionId: string, userId: string, video: HelixVideo): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.exportTwitchVideoToYoutube", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(transactionId, userId);
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
            const user = await this.userService.getByTwitchId(transactionId, config.widget.twitch_id);
            const gqlToken = await this.authService.getTwitchGqlToken(transactionId, user.id);
            
            if (!gqlToken) {
                logger.warn({ message: "No Twitch GQL token found, sync via extension required", data: { userId: user.id } });
                reqLog.status = "FAILED";
                reqLog.message = "Missing Twitch OAuth token. Please sync using the TRAILBLAZER extension.";
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
            await this.createHistory(transactionId, userId, reqLog)
            this.widgetService.increaseTriggeredCount(transactionId, config.widget_id)
        } catch (err) {
            reqLog.status = "FAILED"
            reqLog.message = String(err)
            await this.createHistory(transactionId, userId, reqLog)
        }
    }

    async onTwitchStreamOffline(transactionId: string, e: TwitchStreamOfflineEventRequest): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.onTwitchStreamOffline", transactionId);
        const twitchId = e.broadcaster_user_id
        const user = await this.userService.getByTwitchId(transactionId, twitchId)
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
        await this.exportTwitchVideoToYoutube(transactionId, user.id, latestVideo)
    }

    async testExport(transactionId: string, userId: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.testExport", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(transactionId, userId);
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
        await this.exportTwitchVideoToYoutube(transactionId, userId, video.data[0])
    }
}
