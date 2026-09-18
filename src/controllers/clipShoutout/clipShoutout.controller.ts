import { FastifyReply, FastifyRequest } from "fastify";
import ClipShoutoutService from "@/services/widget/clipShoutout/clipShoutout.service";
import ClipShoutoutEventController from "./clipShoutout.event.controller";
import { getUserFromRequest } from "../middleware";
import { createClipShoutoutSchema, updateClipShoutoutSchema } from "./schemas";
import { z } from "zod";
import TLogger, { Layer } from "@/logging/logger";
import { TError, NotFoundError } from "@/errors";

export default class ClipShoutoutController {
    private clipShoutoutService: ClipShoutoutService;
    private clipShoutoutEventController: ClipShoutoutEventController;
    private readonly logger: TLogger;

    constructor(clipShoutoutService: ClipShoutoutService, clipShoutoutEventController: ClipShoutoutEventController) {
        this.clipShoutoutService = clipShoutoutService;
        this.clipShoutoutEventController = clipShoutoutEventController;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async get(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.clipShoutout.get", req.id);
        logger.info({ message: "Getting clip shoutout config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const config = await this.clipShoutoutService.getByUserId(user.id);
            if (!config) {
                logger.info({ message: "Clip shoutout not enabled", data: { userId: user.id } });
                return res.status(404).send({ message: "Clip shoutout not enabled" });
            }
            logger.info({ message: "Successfully retrieved clip shoutout", data: { userId: user.id } });
            res.send(config);
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to get clip shoutout", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async update(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.clipShoutout.update", req.id);
        logger.info({ message: "Updating clip shoutout config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = updateClipShoutoutSchema.parse(req.body);
            // Retrieve existing config to get ID
            const config = await this.clipShoutoutService.getByUserId(user.id);
            if (!config) {
                throw new NotFoundError("Clip shoutout not enabled");
            }

            const updated = await this.clipShoutoutService.update(config.id, user.id, request);
            logger.info({ message: "Successfully updated clip shoutout", data: { userId: user.id } });
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
            logger.error({ message: "Failed to update clip shoutout", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async create(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;

        logger = this.logger.setContext("controller.clipShoutout.create", req.id);
        logger.info({ message: "Creating clip shoutout config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = createClipShoutoutSchema.parse(req.body);
            const created = await this.clipShoutoutService.create(request);
            logger.info({ message: "Successfully created clip shoutout", data: { userId: user.id } });
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
            logger.error({ message: "Failed to create clip shoutout", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async delete(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.clipShoutout.delete", req.id);
        logger.info({ message: "Deleting clip shoutout config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            await this.clipShoutoutService.delete(user.id);
            this.clipShoutoutEventController.disconnectUser(user.id);
            logger.info({ message: "Successfully deleted clip shoutout", data: { userId: user.id } });
            res.status(204).send();
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to delete clip shoutout", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async refreshKey(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.clipShoutout.refreshKey", req.id);
        logger.info({ message: "Refreshing overlay key" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const updated = await this.clipShoutoutService.refreshOverlayKey(user.id);
            this.clipShoutoutEventController.disconnectUser(user.id);
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
