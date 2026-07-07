import { FastifyReply, FastifyRequest } from "fastify";
import RandomDBDKillerService from "@/services/widget/randomDBDKiller/randomDBDKiller.service";
import TLogger, { Layer } from "@/logging/logger";
import { getUserFromRequest } from "../middleware";
import { createRandomDBDKillerSchema, updateRandomDBDKillerSchema } from "./schemas";
import { z } from "zod";
import { TError } from "@/errors";

export default class RandomDBDKillerController {
    private service: RandomDBDKillerService;
    private readonly logger: TLogger;

    constructor(service: RandomDBDKillerService) {
        this.service = service;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async get(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.randomDBDKiller.get");
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const result = await this.service.getByUserId(user.id);
            this.logger.info({ message: "Successfully retrieved random dbd killer config", data: { userId: user.id } });
            res.send(result);
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to get random dbd killer config", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async create(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.randomDBDKiller.create");
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = createRandomDBDKillerSchema.parse(req.body);
            const result = await this.service.create({
                owner_id: user.id,
                twitch_id: user.twitchId,
                twitch_reward_id: request.twitch_reward_id
            });
            this.logger.info({ message: "Successfully created random dbd killer config", data: { userId: user.id } });
            res.status(201).send(result);
        } catch (error) {
            console.log("Error", error)
            if (error instanceof z.ZodError) {
                this.logger.warn({ message: "Validation error", error: JSON.stringify(error.issues) });
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to create random dbd killer config", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async update(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.randomDBDKiller.update");
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = updateRandomDBDKillerSchema.parse(req.body);
            const existing = await this.service.getByUserId(user.id);

            const result = await this.service.update(existing.id, user.id, request);
            this.logger.info({ message: "Successfully updated random dbd killer config", data: { userId: user.id } });
            res.send(result);
        } catch (error) {
            if (error instanceof z.ZodError) {
                this.logger.warn({ message: "Validation error", error: JSON.stringify(error.issues) });
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to update random dbd killer config", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async delete(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.randomDBDKiller.delete");
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            await this.service.delete(user.id);
            this.logger.info({ message: "Successfully deleted random dbd killer config", data: { userId: user.id } });
            res.status(204).send();
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to delete random dbd killer config", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async refreshKey(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.randomDBDKiller.refreshKey");
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const result = await this.service.refreshKey(user.id);
            this.logger.info({ message: "Successfully refreshed random dbd killer overlay key", data: { userId: user.id } });
            res.send(result);
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to refresh random dbd killer overlay key", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
