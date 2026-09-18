import { FastifyReply, FastifyRequest } from "fastify";
import RandomDbdPerkService from "@/services/widget/randomDbdPerk/randomDbdPerk.service";
import TLogger, { Layer } from "@/logging/logger";
import { getUserFromRequest } from "../middleware";
import { createRandomDbdPerkSchema, updateRandomDbdPerkSchema } from "./schemas";
import { z } from "zod";
import { TError } from "@/errors";

export default class RandomDbdPerkController {
    private service: RandomDbdPerkService;
    private readonly logger: TLogger;

    constructor(service: RandomDbdPerkService) {
        this.service = service;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async get(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.randomDbdPerk.get", req.id);
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const result = await this.service.getByUserId(req.id, user.id);
            if (!result) {
                logger.info({ message: "Random dbd perk config not found", data: { userId: user.id } });
                return res.status(404).send({ message: "Not found" });
            }
            logger.info({ message: "Successfully retrieved random dbd perk config", data: { userId: user.id } });
            res.send(result);
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to get random dbd perk config", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async create(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.randomDbdPerk.create", req.id);
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = createRandomDbdPerkSchema.parse(req.body);
            const result = await this.service.create(req.id, {
                owner_id: user.id,
                twitch_id: user.twitchId,
                enabled: request.enabled
            });
            logger.info({ message: "Successfully created random dbd perk config", data: { userId: user.id } });
            res.status(201).send(result);
        } catch (error) {
            if (error instanceof z.ZodError) {
                logger.warn({ message: "Validation error", error: JSON.stringify(error.issues) });
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to create random dbd perk config", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async update(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.randomDbdPerk.update", req.id);
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = updateRandomDbdPerkSchema.parse(req.body);
            const existing = await this.service.getByUserId(req.id, user.id);

            if (!existing) {
                logger.warn({ message: "Random dbd perk config not found for update", data: { userId: user.id } });
                return res.status(404).send({ message: "Not found" });
            }

            const result = await this.service.update(req.id, existing.id, user.id, request);
            logger.info({ message: "Successfully updated random dbd perk config", data: { userId: user.id } });
            res.send(result);
        } catch (error) {
            if (error instanceof z.ZodError) {
                logger.warn({ message: "Validation error", error: JSON.stringify(error.issues) });
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to update random dbd perk config", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async delete(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.randomDbdPerk.delete", req.id);
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            await this.service.delete(req.id, user.id);
            logger.info({ message: "Successfully deleted random dbd perk config", data: { userId: user.id } });
            res.status(204).send();
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to delete random dbd perk config", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async refreshKey(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.randomDbdPerk.refreshKey", req.id);
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const result = await this.service.refreshKey(req.id, user.id);
            logger.info({ message: "Successfully refreshed random dbd perk overlay key", data: { userId: user.id } });
            res.send(result);
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to refresh random dbd perk overlay key", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
