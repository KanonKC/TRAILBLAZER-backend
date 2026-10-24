import { BadRequestError, NotFoundError } from "@/errors";
import TLogger, { Layer } from "@/logging/logger";
import WidgetTypeRepository from "@/repositories/widgetType/widgetType.repository";
import { CreateWidgetType, UpdateWidgetType } from "@/repositories/widgetType/request";
import { WidgetType } from "generated/prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { convertPrismaError } from "@/utils/error";
import Configurations from "@/config/index";
import s3 from "@/libs/awsS3";
import redis from "@/libs/redis";

const WIDGET_ICONS_PREFIX = "widget-icons/";

export default class WidgetTypeService {
    private readonly cfg: Configurations;
    private readonly widgetTypeRepository: WidgetTypeRepository;
    private readonly logger: TLogger;

    constructor(cfg: Configurations, widgetTypeRepository: WidgetTypeRepository) {
        this.cfg = cfg;
        this.widgetTypeRepository = widgetTypeRepository;
        this.logger = new TLogger(Layer.SERVICE);
    }

    async list(transactionId?: string): Promise<WidgetType[]> {
        return this.widgetTypeRepository.list(transactionId);
    }

    async get(id: number, transactionId?: string): Promise<WidgetType> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widgetType.get", transactionId);
        const widgetType = await this.widgetTypeRepository.get(id, transactionId);
        if (!widgetType) {
            throw new NotFoundError("Widget type not found");
        }
        return widgetType;
    }

    async create(request: CreateWidgetType, transactionId?: string): Promise<WidgetType> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widgetType.create", transactionId);
        try {
            return await this.widgetTypeRepository.create({ ...request, is_active: request.availability === undefined || request.availability === "active" || request.availability === "whitelist_only", is_display: request.availability !== "hide" }, transactionId);
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                throw convertPrismaError(error);
            }
            throw error;
        }
    }

    async update(id: number, request: UpdateWidgetType, transactionId?: string): Promise<WidgetType> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widgetType.update", transactionId);
        await this.get(id, transactionId);
        try {
            const availability = request.availability;
            const updatedRequest = { ...request, ...(availability ? { is_active: availability === "active" || availability === "whitelist_only", is_display: availability !== "hide" } : {}) };
            if (availability && availability !== "active") {
                const { widgetType, affectedWidgets } = await this.widgetTypeRepository.updateAndDisableUnavailable(id, updatedRequest, transactionId);
                await Promise.all(affectedWidgets.flatMap(widget => [redis.del(`widget:${widget.id}`), redis.del(`widget:total:owner:${widget.owner_id}`)]));
                return widgetType;
            }
            return await this.widgetTypeRepository.update(id, updatedRequest, transactionId);
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                throw convertPrismaError(error);
            }
            throw error;
        }
    }

    async delete(id: number, transactionId?: string): Promise<void> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widgetType.delete", transactionId);
        const widgetType = await this.get(id, transactionId);

        const widgetsUsingType = await this.widgetTypeRepository.countWidgetsUsingSlug(widgetType.slug, transactionId);
        if (widgetsUsingType > 0) {
            logger.warn({ message: "Cannot delete widget type still in use", data: { id, widgetsUsingType } });
            throw new BadRequestError(`${widgetsUsingType} widget(s) still use this type — disable it instead of deleting`);
        }

        await this.widgetTypeRepository.delete(id, transactionId);
    }

    async uploadIcon(filename: string, file: { buffer: Buffer, mimetype: string }, transactionId?: string): Promise<string> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.widgetType.uploadIcon", transactionId);
        if (!/^[a-zA-Z0-9._-]+\.[a-zA-Z0-9]+$/.test(filename)) {
            throw new BadRequestError("Icon filename must include a file extension, e.g. first-word.svg");
        }

        const key = `${WIDGET_ICONS_PREFIX}${filename}`;
        // Icons must land in the CDN's own bucket (cdnBucketName) — the default
        // S3_BUCKET_NAME is a separate, non-public bucket used for user uploads.
        // Filenames are reused on re-upload, so force revalidation (ETag) or the
        // CDN/browser keeps serving the previous image under the same URL.
        await s3.uploadFile(file.buffer, key, file.mimetype, this.cfg.cdnBucketName, "no-cache");
        logger.info({ message: "Widget icon uploaded", data: { key, bucket: this.cfg.cdnBucketName } });

        return `${this.cfg.cdnOrigin}/${key}`;
    }
}
