import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import ExportVideoService from "@/services/widget/exportVideo/exportVideo.service";
import { getUserFromRequest } from "../middleware";
import { createExportVideoSchema, updateExportVideoSchema, createExportVideoHistorySchema } from "./schemas";
import TLogger, { Layer } from "@/logging/logger";
import { TError, NotFoundError } from "@/errors";

export default class ExportVideoController {
    private readonly service: ExportVideoService;
    private readonly logger: TLogger;

    constructor(service: ExportVideoService) {
        this.service = service;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async get(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.exportVideo.get");
        this.logger.info({ message: "Getting export video config" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const config = await this.service.getByUserId(user.id);
            if (!config) {
                this.logger.info({ message: "Export video not enabled", data: { userId: user.id } });
                return res.status(404).send({ message: "Export video not enabled" });
            }
            this.logger.info({ message: "Successfully retrieved export video", data: { userId: user.id } });
            res.send(config);
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to get export video", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async create(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.exportVideo.create");
        this.logger.info({ message: "Creating export video config" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const body = createExportVideoSchema.parse(req.body);
            const created = await this.service.create(body);
            this.logger.info({ message: "Successfully created export video", data: { userId: user.id } });
            res.status(201).send(created);
        } catch (error) {
            if (error instanceof z.ZodError) {
                this.logger.warn({ message: "Validation error", error: JSON.stringify(error.issues) });
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to create export video", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async update(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.exportVideo.update");
        this.logger.info({ message: "Updating export video config" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const body = updateExportVideoSchema.parse(req.body);
            const config = await this.service.getByUserId(user.id);
            if (!config) {
                throw new NotFoundError("Export video not enabled");
            }

            const updated = await this.service.update(config.id, user.id, body);
            this.logger.info({ message: "Successfully updated export video", data: { userId: user.id } });
            res.send(updated);
        } catch (error) {
            if (error instanceof z.ZodError) {
                this.logger.warn({ message: "Validation error", error: error.message });
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to update export video", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async delete(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.exportVideo.delete");
        this.logger.info({ message: "Deleting export video config" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            await this.service.delete(user.id);
            this.logger.info({ message: "Successfully deleted export video", data: { userId: user.id } });
            res.status(204).send();
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to delete export video", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async createHistory(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.exportVideo.createHistory");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const body = createExportVideoHistorySchema.parse(req.body);
            const created = await this.service.createHistory(user.id, body);
            res.status(201).send(created);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async listHistory(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.exportVideo.listHistory");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const query = req.query as { page?: string, limit?: string };
            const page = parseInt(query.page || "1");
            const limit = parseInt(query.limit || "10");

            const history = await this.service.listHistory(user.id, { page, limit });
            res.send(history);
        } catch (error) {
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async getHistory(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.exportVideo.getHistory");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        const { historyId } = req.params as { historyId: string };
        try {
            const entry = await this.service.getHistory(user.id, parseInt(historyId));
            res.send(entry);
        } catch (error) {
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async deleteHistory(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.exportVideo.deleteHistory");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        const { historyId } = req.params as { historyId: string };
        try {
            await this.service.deleteHistory(user.id, parseInt(historyId));
            res.status(204).send();
        } catch (error) {
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
