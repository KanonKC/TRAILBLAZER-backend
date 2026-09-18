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
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.exportVideo.get", req.id);
        logger.info({ message: "Getting export video config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const config = await this.service.getByUserId(user.id);
            logger.info({ message: "Successfully retrieved export video", data: { userId: user.id } });
            res.send(config);
        } catch (error) {
            if (error instanceof NotFoundError) {
                logger.info({ message: "Export video not enabled", data: { userId: user.id } });
                return res.status(404).send({ message: "Export video not enabled" });
            }
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to get export video", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async create(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.exportVideo.create", req.id);
        logger.info({ message: "Creating export video config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const body = createExportVideoSchema.parse(req.body);
            const config = await this.service.create(user.id, body);
            logger.info({ message: "Successfully created export video", data: { userId: user.id } });
            res.status(201).send(config);
        } catch (error) {
            if (error instanceof z.ZodError) {
                logger.warn({ message: "Validation error", error: JSON.stringify(error.issues) });
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to create export video", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async update(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.exportVideo.update", req.id);
        logger.info({ message: "Updating export video config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const body = updateExportVideoSchema.parse(req.body);
            const updated = await this.service.update(user.id, body);
            logger.info({ message: "Successfully updated export video", data: { userId: user.id } });
            res.status(200).send(updated);
        } catch (error) {
            if (error instanceof z.ZodError) {
                logger.warn({ message: "Validation error", error: error.message });
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to update export video", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async delete(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.exportVideo.delete", req.id);
        logger.info({ message: "Deleting export video config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            await this.service.delete(user.id);
            logger.info({ message: "Successfully deleted export video", data: { userId: user.id } });
            res.status(204).send();
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to delete export video", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async createHistory(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.exportVideo.createHistory", req.id);
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const body = createExportVideoHistorySchema.parse(req.body);
            await this.service.createHistory(user.id, body);
            logger.info({ message: "Successfully created export video history", data: { userId: user.id } });
            res.status(201).send({ message: "Success" });
        } catch (error) {
            if (error instanceof z.ZodError) {
                logger.warn({ message: "Validation error", error: JSON.stringify(error.issues) });
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to create export video history", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async listHistory(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.exportVideo.listHistory", req.id);
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const query = req.query as { page?: string, limit?: string };
            const page = parseInt(query.page || "1");
            const limit = parseInt(query.limit || "10");

            const history = await this.service.listHistory(user.id, { page, limit });
            logger.info({ message: "Successfully listed export video history", data: { userId: user.id, page, limit } });
            res.send(history);
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to list export video history", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async getHistory(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.exportVideo.getHistory", req.id);
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        const { historyId } = req.params as { historyId: string };
        try {
            const entry = await this.service.getHistory(user.id, parseInt(historyId));
            logger.info({ message: "Successfully retrieved export video history", data: { userId: user.id, historyId } });
            res.send(entry);
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id, historyId }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to get export video history", data: { userId: user.id, historyId }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async deleteHistory(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.exportVideo.deleteHistory", req.id);
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        const { historyId } = req.params as { historyId: string };
        try {
            await this.service.deleteHistory(user.id, parseInt(historyId));
            logger.info({ message: "Successfully deleted export video history", data: { userId: user.id, historyId } });
            res.status(204).send();
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id, historyId }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to delete export video history", data: { userId: user.id, historyId }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async test(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.exportVideo.test", req.id);
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            await this.service.testExport(user.id);
            logger.info({ message: "Successfully triggered manual test export", data: { userId: user.id } });
            res.status(200).send({ message: "Success" });
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to test export video", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: error instanceof Error ? error.message : "Internal Server Error" });
        }
    }
}
