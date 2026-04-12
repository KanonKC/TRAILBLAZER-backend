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
import { randomBytes } from "crypto";
import WidgetService from "../widget.service";
import { CreateExportVideo, CreateExportVideoHistory, UpdateExportVideo } from "./request";
import { ListResponse, Pagination } from "@/services/response";

export default class ExportVideoService {
    private readonly exportVideoRepository: ExportVideoRepository;
    private readonly userService: UserService;
    private readonly widgetService: WidgetService;
    private readonly logger: TLogger;
    private readonly twitchGql: TwitchGql;

    constructor(
        exportVideoRepository: ExportVideoRepository,
        userService: UserService,
        widgetService: WidgetService,
        twitchGql: TwitchGql
    ) {
        this.exportVideoRepository = exportVideoRepository;
        this.userService = userService;
        this.widgetService = widgetService;
        this.logger = new TLogger(Layer.SERVICE);
        this.twitchGql = twitchGql;
    }

    async create(request: CreateExportVideo): Promise<ExportVideoWithWidget> {
        this.logger.setContext("service.exportVideo.create");
        const user = await this.userService.get(request.owner_id);
        if (!user) {
            this.logger.warn({ message: "User not found", data: { owner_id: request.owner_id } });
            throw new NotFoundError("User not found");
        }

        const userSubs = await twitchAppAPI.eventSub.getSubscriptionsForUser(user.twitch_id);
        const enabledSubs = userSubs.data.filter(sub => sub.status === 'enabled')

        const streamOfflineSubs = enabledSubs.filter(sub => sub.type === 'stream.offline')
        if (streamOfflineSubs.length === 0) {
            const tsp = createESTransport("/webhook/v1/twitch/event-sub/stream-offline")
            await twitchAppAPI.eventSub.subscribeToStreamOfflineEvents(user.twitch_id, tsp)
        }

        const res = await this.exportVideoRepository.create({
            ...request,
        });

        await this.widgetService.setInitialEnabled(res.widget_id, user.id);
        this.logger.info({ message: "Export video widget created successfully", data: { id: res.id, owner_id: user.id } });
        return res;
    }

    async getByUserId(userId: string): Promise<ExportVideoWithWidget | null> {
        this.logger.setContext("service.exportVideo.getByUserId");
        const res = await this.exportVideoRepository.getByOwnerId(userId);
        if (!res) {
            this.logger.warn({ message: "Export video config not found", data: { userId } });
            throw new NotFoundError("Export video config not found");
        }
        await this.widgetService.authorizeOwnership(userId, res.widget.id);
        return res;
    }

    async update(id: string, userId: string, data: UpdateExportVideo): Promise<ExportVideoWithWidget> {
        this.logger.setContext("service.exportVideo.update");
        const existing = await this.exportVideoRepository.get(id);
        if (!existing) {
            this.logger.warn({ message: "Export video config not found", data: { id } });
            throw new NotFoundError("Export video config not found");
        }

        await this.widgetService.authorizeOwnership(userId, existing.widget.id);

        const res = await this.exportVideoRepository.update(id, data);
        this.logger.info({ message: "Export video widget updated successfully", data: { id, userId } });
        return res;
    }

    async delete(userId: string): Promise<void> {
        this.logger.setContext("service.exportVideo.delete");
        const existing = await this.exportVideoRepository.getByOwnerId(userId);
        if (!existing) {
            return;
        }

        await this.widgetService.authorizeOwnership(userId, existing.widget.id);
        await this.exportVideoRepository.delete(existing.id);
        this.logger.info({ message: "Export video widget deleted successfully", data: { userId } });
    }

    // ExportVideoHistory methods
    async createHistory(userId: string, request: CreateExportVideoHistory): Promise<ExportVideoHistoryResponse> {
        this.logger.setContext("service.exportVideo.createHistory");
        const existing = await this.exportVideoRepository.getByOwnerId(userId);
        if (!existing) {
            throw new NotFoundError("Export video config not found");
        }
        await this.widgetService.authorizeOwnership(userId, existing.widget.id);

        const res = await this.exportVideoRepository.createHistory({
            ...request,
            export_video_id: existing.id,
        });
        this.logger.info({ message: "Export video history created successfully", data: { export_video_id: existing.id, userId } });
        return res;
    }

    async listHistory(userId: string, pagination: Pagination): Promise<ListResponse<ExportVideoHistoryResponse>> {
        this.logger.setContext("service.exportVideo.listHistory");
        const config = await this.exportVideoRepository.getByOwnerId(userId);
        if (!config) {
            throw new NotFoundError("Export video config not found");
        }
        await this.widgetService.authorizeOwnership(userId, config.widget.id);

        const [data, total] = await this.exportVideoRepository.listHistoryByExportVideoId(config.id, pagination);

        return {
            data,
            pagination: {
                ...pagination,
                total
            }
        };
    }

    async getHistory(userId: string, historyId: number): Promise<ExportVideoHistoryResponse | null> {
        this.logger.setContext("service.exportVideo.getHistory");
        const history = await this.exportVideoRepository.getHistory(historyId);
        if (!history) {
            throw new NotFoundError("Export video history not found");
        }

        const exportVideo = await this.exportVideoRepository.get(history.export_video_id);
        if (!exportVideo) {
            throw new NotFoundError("Export video config not found");
        }
        await this.widgetService.authorizeOwnership(userId, exportVideo.widget.id);

        return history;
    }

    async deleteHistory(userId: string, historyId: number): Promise<void> {
        this.logger.setContext("service.exportVideo.deleteHistory");
        const history = await this.exportVideoRepository.getHistory(historyId);
        if (!history) {
            return;
        }

        const exportVideo = await this.exportVideoRepository.get(history.export_video_id);
        if (!exportVideo) {
            throw new NotFoundError("Export video config not found");
        }
        await this.widgetService.authorizeOwnership(userId, exportVideo.widget.id);

        await this.exportVideoRepository.deleteHistory(historyId);
        this.logger.info({ message: "Export video history deleted successfully", data: { historyId, userId } });
    }

    async exportTwitchVideoToYoutube(userId: string, video: HelixVideo): Promise<void> {

        const config = await this.getByUserId(userId)

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
            privacyStatus: (config.privacy_status as any) || "PRIVATE",
            doSplit: false
        }]

        let reqLog: CreateExportVideoHistory = {
            batch_id: null,
            video_id: video.id,
            status: "SUCCESS",
        }

        try {
            const res = await this.twitchGql.exportVideosToYoutube(req)
            const result = res[0]
            if (result.errors) {
                reqLog.status = "FAILED"
                reqLog.message = JSON.stringify(result.errors)
            }
            if (result.data) {
                reqLog.message = JSON.stringify(result.data)
            }
            this.createHistory(userId, reqLog)
        } catch (err) {
            reqLog.status = "FAILED"
            reqLog.message = String(err)
            this.createHistory(userId, reqLog)
        }
    }

    async onTwitchStreamOffline(e: TwitchStreamOfflineEventRequest): Promise<void> {
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
}
