import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { TError } from "@/errors";
import TLogger, { Layer } from "@/logging/logger";
import CanvasService from "@/services/canvas/canvas.service";
import { getUserFromRequest } from "../middleware";
import { saveCanvasSchema, setWidgetCanvasSchema } from "./schemas";

export default class CanvasController {
    private readonly service: CanvasService;
    private readonly logger: TLogger;

    constructor(service: CanvasService) {
        this.service = service;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async list(req: FastifyRequest, res: FastifyReply) {
        const logger = this.logger.setContext("controller.canvas.list", req.id);
        logger.info({ message: "Listing canvases" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const result = await this.service.list(user.id, req.id);
            logger.info({ message: "Listed canvases", data: { status: 200 } });
            res.send(result);
        } catch (error) {
            return this.handleError(logger, res, error, "Failed to list canvases");
        }
    }

    async get(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        const logger = this.logger.setContext("controller.canvas.get", req.id);
        const { id } = req.params;
        logger.info({ message: "Getting canvas", data: { id } });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const result = await this.service.get(id, user.id, req.id);
            logger.info({ message: "Got canvas", data: { id, status: 200 } });
            res.send(result);
        } catch (error) {
            return this.handleError(logger, res, error, "Failed to get canvas");
        }
    }

    async create(req: FastifyRequest, res: FastifyReply) {
        const logger = this.logger.setContext("controller.canvas.create", req.id);
        logger.info({ message: "Creating canvas" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = saveCanvasSchema.parse(req.body);
            const result = await this.service.create(user.id, request, req.id);
            logger.info({ message: "Created canvas", data: { id: result.id, status: 201 } });
            res.status(201).send(result);
        } catch (error) {
            return this.handleError(logger, res, error, "Failed to create canvas");
        }
    }

    async update(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        const logger = this.logger.setContext("controller.canvas.update", req.id);
        const { id } = req.params;
        logger.info({ message: "Updating canvas", data: { id } });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = saveCanvasSchema.parse(req.body);
            const result = await this.service.update(id, user.id, request, req.id);
            logger.info({ message: "Updated canvas", data: { id, status: 200 } });
            res.send(result);
        } catch (error) {
            return this.handleError(logger, res, error, "Failed to update canvas");
        }
    }

    async delete(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        const logger = this.logger.setContext("controller.canvas.delete", req.id);
        const { id } = req.params;
        logger.info({ message: "Deleting canvas", data: { id } });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            await this.service.delete(id, user.id, req.id);
            logger.info({ message: "Deleted canvas", data: { id, status: 204 } });
            res.status(204).send();
        } catch (error) {
            return this.handleError(logger, res, error, "Failed to delete canvas");
        }
    }

    async setWidgetCanvas(req: FastifyRequest<{ Params: { widgetId: string } }>, res: FastifyReply) {
        const logger = this.logger.setContext("controller.canvas.setWidgetCanvas", req.id);
        const { widgetId } = req.params;
        logger.info({ message: "Setting widget canvas", data: { widgetId } });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const { canvas_id } = setWidgetCanvasSchema.parse(req.body);
            await this.service.setWidgetCanvas(widgetId, user.id, canvas_id, req.id);
            logger.info({ message: "Set widget canvas", data: { widgetId, canvasId: canvas_id, status: 204 } });
            res.status(204).send();
        } catch (error) {
            return this.handleError(logger, res, error, "Failed to set widget canvas");
        }
    }

    private handleError(logger: TLogger, res: FastifyReply, error: unknown, message: string) {
        if (error instanceof z.ZodError) {
            logger.warn({ message: "Validation Error", data: { status: 400 }, error: error.message });
            return res.status(400).send({ message: "Validation Error", errors: error.issues });
        }
        if (error instanceof TError) {
            logger.error({ message: error.message, data: { status: error.status }, error });
            return res.status(error.status).send(error.toJSON());
        }
        logger.error({ message, data: { status: 500 }, error: error as Error });
        return res.status(500).send({ message: "Internal Server Error" });
    }
}
