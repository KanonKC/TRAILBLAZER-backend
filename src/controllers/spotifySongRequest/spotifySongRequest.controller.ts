import { FastifyReply, FastifyRequest } from "fastify";
import { getUserFromRequest } from "../middleware";
import { createSpotifySongRequestSchema, updateSpotifySongRequestSchema } from "./schemas";
import { z } from "zod";
import TLogger, { Layer } from "@/logging/logger";
import { TError } from "@/errors";
import SpotifySongRequestService from "@/services/widget/spotifySongRequest/spotifySongRequest.service";

export default class SpotifySongRequestController {
    private readonly spotifySongRequestService: SpotifySongRequestService;
    private readonly logger: TLogger;

    constructor(spotifySongRequestService: SpotifySongRequestService) {
        this.spotifySongRequestService = spotifySongRequestService;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async create(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.spotifySongRequest.create", req.id);
        logger.info({ message: "Creating spotify song request config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = createSpotifySongRequestSchema.parse(req.body);
            const created = await this.spotifySongRequestService.create(req.id, {
                twitch_id: request.twitch_id,
                owner_id: request.owner_id,
                twitchRewardId: request.twitch_reward_id ?? undefined,
                twitchBotId: request.twitch_bot_id ?? undefined,
                invalidMessage: request.invalid_message ?? undefined,
                successMessage: request.success_message ?? undefined,
            });
            logger.info({ message: "Successfully created spotify song request", data: { userId: user.id } });
            res.status(201).send(created);
        } catch (error) {
            logger.error({ message: "Failed to create spotify song request", data: { userId: user.id }, error: error as Error });
            if (error instanceof z.ZodError) {
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async get(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.spotifySongRequest.get", req.id);
        logger.info({ message: "Getting spotify song request config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const config = await this.spotifySongRequestService.getByUserId(req.id, user.id);
            logger.info({ message: "Successfully retrieved spotify song request", data: { userId: user.id } });
            res.send(config);
        } catch (error) {
            logger.error({ message: "Failed to get spotify song request", data: { userId: user.id }, error: error as Error });
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async update(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.spotifySongRequest.update", req.id);
        logger.info({ message: "Updating spotify song request config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = updateSpotifySongRequestSchema.parse(req.body);
            const updated = await this.spotifySongRequestService.update(req.id, user.id, request);
            logger.info({ message: "Successfully updated spotify song request", data: { userId: user.id } });
            res.send(updated);
        } catch (error) {
            logger.error({ message: "Failed to update spotify song request", data: { userId: user.id }, error: error as Error });
            if (error instanceof z.ZodError) {
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async test(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.spotifySongRequest.test", req.id);
        logger.info({ message: "Testing spotify song request" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            await this.spotifySongRequestService.test(req.id, user.id);
            logger.info({ message: "Test completed", data: { userId: user.id } });
            res.status(204).send();
        } catch (error) {
            logger.error({ message: "Test failed", data: { userId: user.id }, error: error as Error });
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async delete(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.spotifySongRequest.delete", req.id);
        logger.info({ message: "Deleting spotify song request config" });
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            await this.spotifySongRequestService.delete(req.id, user.id);
            logger.info({ message: "Successfully deleted spotify song request", data: { userId: user.id } });
            res.status(204).send();
        } catch (error) {
            logger.error({ message: "Failed to delete spotify song request", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
