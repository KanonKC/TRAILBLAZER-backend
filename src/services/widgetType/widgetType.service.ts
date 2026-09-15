import { BadRequestError, NotFoundError } from "@/errors";
import TLogger, { Layer } from "@/logging/logger";
import WidgetTypeRepository from "@/repositories/widgetType/widgetType.repository";
import { CreateWidgetType, UpdateWidgetType } from "@/repositories/widgetType/request";
import { WidgetType } from "generated/prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { convertPrismaError } from "@/utils/error";
import Configurations from "@/config/index";
import s3 from "@/libs/awsS3";

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

    async list(): Promise<WidgetType[]> {
        return this.widgetTypeRepository.list();
    }

    async get(id: number): Promise<WidgetType> {
        this.logger.setContext("service.widgetType.get");
        const widgetType = await this.widgetTypeRepository.get(id);
        if (!widgetType) {
            throw new NotFoundError("Widget type not found");
        }
        return widgetType;
    }

    async create(request: CreateWidgetType): Promise<WidgetType> {
        this.logger.setContext("service.widgetType.create");
        try {
            return await this.widgetTypeRepository.create(request);
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                throw convertPrismaError(error);
            }
            throw error;
        }
    }

    async update(id: number, request: UpdateWidgetType): Promise<WidgetType> {
        this.logger.setContext("service.widgetType.update");
        await this.get(id);
        try {
            return await this.widgetTypeRepository.update(id, request);
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                throw convertPrismaError(error);
            }
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        this.logger.setContext("service.widgetType.delete");
        const widgetType = await this.get(id);

        const widgetsUsingType = await this.widgetTypeRepository.countWidgetsUsingSlug(widgetType.slug);
        if (widgetsUsingType > 0) {
            this.logger.warn({ message: "Cannot delete widget type still in use", data: { id, widgetsUsingType } });
            throw new BadRequestError(`${widgetsUsingType} widget(s) still use this type — disable it instead of deleting`);
        }

        await this.widgetTypeRepository.delete(id);
    }

    async uploadIcon(filename: string, file: { buffer: Buffer, mimetype: string }): Promise<string> {
        this.logger.setContext("service.widgetType.uploadIcon");
        if (!/^[a-zA-Z0-9._-]+\.[a-zA-Z0-9]+$/.test(filename)) {
            throw new BadRequestError("Icon filename must include a file extension, e.g. first-word.svg");
        }

        const key = `${WIDGET_ICONS_PREFIX}${filename}`;
        // Icons must land in the CDN's own bucket (cdnBucketName) — the default
        // S3_BUCKET_NAME is a separate, non-public bucket used for user uploads.
        await s3.uploadFile(file.buffer, key, file.mimetype, this.cfg.cdnBucketName);
        this.logger.info({ message: "Widget icon uploaded", data: { key, bucket: this.cfg.cdnBucketName } });

        return `${this.cfg.cdnOrigin}/${key}`;
    }
}
