import { FastifyReply, FastifyRequest } from "fastify";
import DropImageService from "@/services/widget/dropImage/dropImage.service";
import { getUserFromRequest } from "../middleware";
import { createDropImageSchema, updateDropImageSchema } from "./schemas";
import { z } from "zod";
import TLogger, { Layer } from "@/logging/logger";
import { TError, NotFoundError } from "@/errors";

export default class DropImageController {
    private dropImageService: DropImageService;
    private readonly logger: TLogger;

    constructor(dropImageService: DropImageService) {
        this.dropImageService = dropImageService;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async get(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.dropImage.get", req.id);
        logger.info({ message: "Getting drop image config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const config = await this.dropImageService.getByUserId(user.id, req.id);
            if (!config) {
                logger.info({ message: "Drop image not enabled", data: { userId: user.id } });
                return res.status(404).send({ message: "Drop image not enabled" });
            }
            logger.info({ message: "Successfully retrieved drop image", data: { userId: user.id } });
            res.send(config);
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to get drop image", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async update(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.dropImage.update", req.id);
        logger.info({ message: "Updating drop image config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = updateDropImageSchema.parse(req.body);
            const config = await this.dropImageService.getByUserId(user.id, req.id);
            if (!config) {
                throw new NotFoundError("Drop image not enabled");
            }

            const updated = await this.dropImageService.update(config.id, user.id, request, req.id);
            logger.info({ message: "Successfully updated drop image", data: { userId: user.id } });
            res.send(updated);
        } catch (error) {
            if (error instanceof z.ZodError) {
                logger.warn({ message: "Validation error", error: error.message });
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to update drop image", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async create(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.dropImage.create", req.id);
        logger.info({ message: "Creating drop image config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = createDropImageSchema.parse(req.body);
            const created = await this.dropImageService.create({ userId: user.id }, req.id);
            logger.info({ message: "Successfully created drop image", data: { userId: user.id } });
            res.status(201).send(created);
        } catch (error) {
            if (error instanceof z.ZodError) {
                logger.warn({ message: "Validation error", error: JSON.stringify(error.issues) });
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to create drop image", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async delete(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.dropImage.delete", req.id);
        logger.info({ message: "Deleting drop image config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            await this.dropImageService.delete(user.id, req.id);
            logger.info({ message: "Successfully deleted drop image", data: { userId: user.id } });
            res.status(204).send();
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to delete drop image", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async refreshKey(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.dropImage.refreshKey", req.id);
        logger.info({ message: "Refreshing overlay key" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const updated = await this.dropImageService.refreshOverlayKey(user.id, req.id);
            logger.info({ message: "Successfully refreshed overlay key", data: { userId: user.id } });
            res.send(updated);
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to refresh overlay key", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
