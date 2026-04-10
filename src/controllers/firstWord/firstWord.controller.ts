import { FastifyReply, FastifyRequest } from "fastify";
import FirstWordService from "@/services/widget/firstWord/firstWord.service";
import FirstWordEventController from "./firstWord.event.controller";
import { getUserFromRequest } from "../middleware";
import { createFirstWordSchema, updateFirstWordSchema, createCustomReplySchema, updateCustomReplySchema, listCustomReplySchema } from "./schemas";
import { z } from "zod";
import TLogger, { Layer } from "@/logging/logger";
import { TError } from "@/errors";

export default class FirstWordController {
    private firstWordService: FirstWordService;
    private firstWordEventController: FirstWordEventController;
    private readonly logger: TLogger;

    constructor(firstWordService: FirstWordService, firstWordEventController: FirstWordEventController) {
        this.firstWordService = firstWordService;
        this.firstWordEventController = firstWordEventController;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async get(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.firstWord.get");
        this.logger.info({ message: "Initializing first word config" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            this.logger.info({ message: "Retrieving first word config", data: { userId: user.id } });
            const firstWord = await this.firstWordService.getByUserId(user.id);
            this.logger.info({ message: "Successfully retrieved first word", data: { userId: user.id, firstWord } });
            res.send(firstWord);
        } catch (error) {
            this.logger.error({ message: "Failed to get first word", data: { userId: user.id }, error: error as Error });
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async update(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.firstWord.update");
        this.logger.info({ message: "Initializing update first word config" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = updateFirstWordSchema.parse(req.body);
            const updated = await this.firstWordService.update(user.id, request);
            this.logger.info({ message: "Successfully updated first word", data: { userId: user.id } });
            res.send(updated);
        } catch (error) {
            this.logger.error({ message: "Failed to update first word", data: { userId: user.id }, error: error as Error });
            if (error instanceof z.ZodError) {
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async create(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.firstWord.create");
        this.logger.info({ message: "Creating first word config" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = createFirstWordSchema.parse(req.body);
            const created = await this.firstWordService.create(request);
            this.logger.info({ message: "Successfully created first word", data: { userId: user.id } });
            res.status(201).send(created);
        } catch (error) {
            this.logger.error({ message: "Failed to create first word", data: { userId: user.id }, error: error as Error });
            if (error instanceof z.ZodError) {
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async delete(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.firstWord.delete");
        this.logger.info({ message: "Deleting first word config" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            await this.firstWordService.delete(user.id);
            this.logger.info({ message: "Successfully deleted first word", data: { userId: user.id } });
            res.status(204).send();
        } catch (error) {
            this.logger.error({ message: "Failed to delete first word", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async refreshKey(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.firstWord.refreshKey");
        this.logger.info({ message: "Refreshing overlay key" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const updated = await this.firstWordService.refreshOverlayKey(user.id);
            this.firstWordEventController.disconnectUser(user.id);
            this.logger.info({ message: "Successfully refreshed overlay key", data: { userId: user.id } });
            res.send(updated);
        } catch (error) {
            this.logger.error({ message: "Failed to refresh overlay key", data: { userId: user.id }, error: error as Error });
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async createCustomReply(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.firstWord.createCustomReply");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const result = createCustomReplySchema.safeParse(req.body);
            if (!result.success) {
                return res.status(400).send({ message: "Invalid request body", error: result.error });
            }

            await this.firstWordService.createCustomReply(user.id, result.data);
            res.status(201).send({ message: "Custom reply created successfully" });
        } catch (error) {
            this.logger.error({ message: "Failed to create custom reply", data: { userId: user.id }, error: error as Error });
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async updateCustomReply(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.firstWord.updateCustomReply");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).send({ message: "Invalid ID" });
        }

        try {
            const result = updateCustomReplySchema.safeParse(req.body);
            if (!result.success) {
                return res.status(400).send({ message: "Invalid request body", error: result.error });
            }

            await this.firstWordService.updateCustomReply(user.id, id, result.data);
            res.status(200).send({ message: "Custom reply updated successfully" });
        } catch (error) {
            this.logger.error({ message: "Failed to update custom reply", data: { userId: user.id, id }, error: error as Error });
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async deleteCustomReply(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.firstWord.deleteCustomReply");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).send({ message: "Invalid ID" });
        }

        try {
            await this.firstWordService.deleteCustomReply(user.id, id);
            res.status(200).send({ message: "Custom reply deleted successfully" });
        } catch (error) {
            this.logger.error({ message: "Failed to delete custom reply", data: { userId: user.id, id }, error: error as Error });
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async listCustomReplies(req: FastifyRequest<{ Querystring: { search?: string, page?: number, limit?: number } }>, res: FastifyReply) {
        this.logger.setContext("controller.firstWord.listCustomReplies");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const queryResult = listCustomReplySchema.safeParse(req.query);
            const search = queryResult.success ? queryResult.data.search : undefined;

            const page = req.query.page ? parseInt(req.query.page as any) : 1;
            const limit = req.query.limit ? parseInt(req.query.limit as any) : 10;

            const result = await this.firstWordService.listCustomReplies(user.id, { search }, { limit, page, total: 0 });
            res.status(200).send(result);
        } catch (error) {
            this.logger.error({ message: "Failed to list custom replies", data: { userId: user.id }, error: error as Error });
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async resetChatters(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.firstWord.resetChatters");
        this.logger.info({ message: "Resetting chatters" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            await this.firstWordService.resetChatter(user.twitchId);
            this.logger.info({ message: "Successfully reset chatters", data: { userId: user.id } });
            res.status(200).send({ message: "Chatters reset successfully" });
        } catch (error) {
            this.logger.error({ message: "Failed to reset chatters", data: { userId: user.id }, error: error as Error });
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async listChatters(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.firstWord.listChatters");
        this.logger.info({ message: "Listing chatters" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const result = await this.firstWordService.listChatters(user.id);
            this.logger.info({ message: "Successfully listed chatters", data: { userId: user.id } });
            res.status(200).send(result);
        } catch (error) {
            this.logger.error({ message: "Failed to list chatters", data: { userId: user.id }, error: error as Error });
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
