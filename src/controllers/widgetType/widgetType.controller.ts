import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import WidgetTypeRepository from "@/repositories/widgetType/widgetType.repository";
import WidgetTypeService from "@/services/widgetType/widgetType.service";
import TLogger, { Layer } from "@/logging/logger";
import { AdminAuthMiddleware } from "../middleware";
import { TError } from "@/errors";
import { createWidgetTypeSchema, updateWidgetTypeSchema } from "./schemas";

export default class WidgetTypeController {
    private readonly repository: WidgetTypeRepository;
    private readonly widgetTypeService: WidgetTypeService;
    private readonly adminAuthMiddleware: AdminAuthMiddleware;
    private readonly logger: TLogger;

    constructor(repository: WidgetTypeRepository, widgetTypeService: WidgetTypeService, adminAuthMiddleware: AdminAuthMiddleware) {
        this.repository = repository;
        this.widgetTypeService = widgetTypeService;
        this.adminAuthMiddleware = adminAuthMiddleware;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async list(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.widgetType.list");
        try {
            const data = await this.repository.list();
            res.send({ data });
        } catch (error) {
            this.logger.error({ message: "Failed to list widget types", error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async create(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.widgetType.create");
        const admin = await this.adminAuthMiddleware.authenticate(req, res);
        if (!admin) return; // 401 already sent

        try {
            const request = createWidgetTypeSchema.parse(req.body);
            const widgetType = await this.widgetTypeService.create(request);
            this.logger.info({ message: "Widget type created", data: { id: widgetType.id, adminId: admin.id } });
            res.status(201).send(widgetType);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                this.logger.error({ message: error.message, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to create widget type", error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async update(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.widgetType.update");
        const admin = await this.adminAuthMiddleware.authenticate(req, res);
        if (!admin) return; // 401 already sent

        try {
            const id = parseInt(req.params.id);
            const request = updateWidgetTypeSchema.parse(req.body);
            const widgetType = await this.widgetTypeService.update(id, request);
            this.logger.info({ message: "Widget type updated", data: { id, adminId: admin.id } });
            res.send(widgetType);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                this.logger.error({ message: error.message, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to update widget type", error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async uploadIcon(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.widgetType.uploadIcon");
        const admin = await this.adminAuthMiddleware.authenticate(req, res);
        if (!admin) return; // 401 already sent

        try {
            // The `filename` field must be sent before the `file` field in the
            // multipart form — busboy is a streaming parser, so req.file()
            // only sees fields that appeared earlier in the stream.
            const file = await req.file();
            if (!file) {
                return res.status(400).send({ message: "File is required" });
            }
            const filenameField = file.fields.filename;
            const filename = filenameField && !Array.isArray(filenameField) && filenameField.type === "field"
                ? String(filenameField.value)
                : undefined;
            if (!filename) {
                return res.status(400).send({ message: "filename field is required" });
            }

            const buffer = await file.toBuffer();
            const url = await this.widgetTypeService.uploadIcon(filename, { buffer, mimetype: file.mimetype });
            this.logger.info({ message: "Widget icon uploaded", data: { filename, adminId: admin.id } });
            res.send({ url });
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to upload widget icon", error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async delete(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.widgetType.delete");
        const admin = await this.adminAuthMiddleware.authenticate(req, res);
        if (!admin) return; // 401 already sent

        try {
            const id = parseInt(req.params.id);
            await this.widgetTypeService.delete(id);
            this.logger.info({ message: "Widget type deleted", data: { id, adminId: admin.id } });
            res.status(204).send();
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to delete widget type", error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
