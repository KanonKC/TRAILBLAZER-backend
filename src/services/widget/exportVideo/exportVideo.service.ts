import { WidgetTypeSlug } from "@/services/constant";
import { NotFoundError } from "@/errors";
import EventSubReconcilerService from "@/services/twitch/eventSubReconciler/eventSubReconciler.service";
import { TwitchStreamOfflineEventRequest } from "@/events/twitch/streamOffline/request";
import { twitchAppAPI } from "@/libs/twurple";
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

    async create(userId: string, request: Omit<CreateExportVideo, "owner_id" | "twitch_id">, transactionId?: string): Promise<ExportVideoWithWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.create", transactionId);
        const user = await this.userService.get(userId, transactionId);

        await this.widgetService.authorizeWidgetType(userId, WidgetTypeSlug.EXPORT_VIDEO, transactionId);
        await EventSubReconcilerService.ensureEventSubs(user.twitch_id, EventSubReconcilerService.getRequiredEventTypes([WidgetTypeSlug.EXPORT_VIDEO]));

        const config = await this.exportVideoRepository.create({
            ...request,
            owner_id: userId,
            twitch_id: user.twitch_id
        } as CreateExportVideo, transactionId);
        await this.widgetService.setInitialEnabled(config.widget_id, userId, transactionId);
        return config;
    }

    async update(userId: string, request: UpdateExportVideo, transactionId?: string): Promise<ExportVideoWithWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.update", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(userId, transactionId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        await this.widgetService.authorizeOwnership(userId, config.widget.id, transactionId);
        return await this.exportVideoRepository.update(config.id, request, transactionId);
    }

    async getByUserId(userId: string, transactionId?: string): Promise<ExportVideoWithWidget> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.getByUserId", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(userId, transactionId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        await this.widgetService.authorizeOwnership(userId, config.widget.id, transactionId);
        return config;
    }

    async delete(userId: string, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.delete", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(userId, transactionId);
        if (!config) {
            return;
        }
        await this.widgetService.delete(config.widget_id, userId, transactionId);
        await this.exportVideoRepository.delete(config.id, transactionId);
    }

    async createHistory(userId: string, request: Omit<CreateExportVideoHistory, "export_video_id">, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.createHistory", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(userId, transactionId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        await this.exportVideoRepository.createHistory({
            ...request,
            export_video_id: config.id
        } as CreateExportVideoHistory, transactionId);
    }

    async listHistory(userId: string, pagination: Pagination, transactionId?: string): Promise<ListResponse<ExportVideoHistoryResponse>> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.listHistory", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(userId, transactionId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        const [data, total] = await this.exportVideoRepository.listHistoryByExportVideoId(config.id, pagination, transactionId);
        return {
            data,
            pagination: {
                ...pagination,
                total
            }
        };
    }

    async getHistory(userId: string, historyId: number, transactionId?: string): Promise<ExportVideoHistoryResponse> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.getHistory", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(userId, transactionId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        const history = await this.exportVideoRepository.getHistory(historyId, transactionId);
        if (!history || history.export_video_id !== config.id) {
            throw new NotFoundError("History not found");
        }
        await this.widgetService.authorizeOwnership(userId, config.widget.id, transactionId);
        return history;
    }

    async deleteHistory(userId: string, historyId: number, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.deleteHistory", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(userId, transactionId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        const history = await this.exportVideoRepository.getHistory(historyId, transactionId);
        if (!history || history.export_video_id !== config.id) {
            return;
        }
        await this.widgetService.authorizeOwnership(userId, config.widget.id, transactionId);
        await this.exportVideoRepository.deleteHistory(historyId, transactionId);
    }

    async exportTwitchVideoToYoutube(userId: string, video: HelixVideo, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.exportTwitchVideoToYoutube", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(userId, transactionId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }

        if (!config.widget.enabled || !await this.widgetService.isEnabledAndAvailable(config.widget_id, transactionId)) {
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
            const user = await this.userService.getByTwitchId(config.widget.twitch_id, transactionId);
            const gqlToken = await this.authService.getTwitchGqlToken(user.id, transactionId);
            
            if (!gqlToken) {
                logger.warn({ message: "No Twitch GQL token found, sync via extension required", data: { userId: user.id } });
                reqLog.status = "FAILED";
                reqLog.message = "Missing Twitch OAuth token. Please sync using the TRAILBLAZER extension.";
            } else {
                const res = await this.twitchGql.exportVideosToYoutube(req, gqlToken, transactionId)
                const result = res[0]
                if (result.errors) {
                    reqLog.status = "FAILED"
                    reqLog.message = JSON.stringify(result.errors)
                }
                if (result.data) {
                    reqLog.message = JSON.stringify(result.data)
                }
            }
            await this.createHistory(userId, reqLog, transactionId)
            this.widgetService.increaseTriggeredCount(config.widget_id, transactionId)
        } catch (err) {
            reqLog.status = "FAILED"
            reqLog.message = String(err)
            await this.createHistory(userId, reqLog, transactionId)
        }
    }

    async onTwitchStreamOffline(e: TwitchStreamOfflineEventRequest, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.onTwitchStreamOffline", transactionId);
        const twitchId = e.broadcaster_user_id
        const user = await this.userService.getByTwitchId(twitchId, transactionId)
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
        await this.exportTwitchVideoToYoutube(user.id, latestVideo, transactionId)
    }

    async testExport(userId: string, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.exportVideo.testExport", transactionId);
        const config = await this.exportVideoRepository.getByOwnerId(userId, transactionId);
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
        await this.exportTwitchVideoToYoutube(userId, video.data[0], transactionId)
    }
}
