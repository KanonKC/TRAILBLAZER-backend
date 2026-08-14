import { FastifyReply, FastifyRequest } from "fastify";
import EndCreditService from "@/services/widget/endCredit/endCredit.service";
import { getUserFromRequest } from "../middleware";
import { createEndCreditSchema, updateEndCreditSchema } from "./schemas";
import { z } from "zod";
import TLogger, { Layer } from "@/logging/logger";
import { TError, NotFoundError } from "@/errors";

export default class EndCreditController {
    private readonly endCreditService: EndCreditService;
    private readonly logger: TLogger;

    constructor(endCreditService: EndCreditService) {
        this.endCreditService = endCreditService;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async create(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.endCredit.create");
        this.logger.info({ message: "Creating end credit config" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = createEndCreditSchema.parse(req.body);
            const created = await this.endCreditService.create({ userId: user.id, ...request });
            this.logger.info({ message: "Successfully created end credit config", data: { userId: user.id } });
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
            this.logger.error({ message: "Failed to create end credit config", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async get(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.endCredit.get");
        this.logger.info({ message: "Getting end credit config" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const config = await this.endCreditService.getByUserId(user.id);
            this.logger.info({ message: "Successfully retrieved end credit config", data: { userId: user.id } });
            res.send(config);
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to get end credit config", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async update(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.endCredit.update");
        this.logger.info({ message: "Updating end credit config" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = updateEndCreditSchema.parse(req.body);
            const config = await this.endCreditService.getByUserId(user.id);
            if (!config) {
                throw new NotFoundError("End credit config not found");
            }

            const updated = await this.endCreditService.update(config.id, user.id, request);
            this.logger.info({ message: "Successfully updated end credit config", data: { userId: user.id } });
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
            this.logger.error({ message: "Failed to update end credit config", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async delete(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.endCredit.delete");
        this.logger.info({ message: "Deleting end credit config" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            await this.endCreditService.delete(user.id);
            this.logger.info({ message: "Successfully deleted end credit config", data: { userId: user.id } });
            res.status(204).send();
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to delete end credit config", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async refreshKey(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.endCredit.refreshKey");
        this.logger.info({ message: "Refreshing overlay key" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const updated = await this.endCreditService.refreshOverlayKey(user.id);
            this.logger.info({ message: "Successfully refreshed overlay key", data: { userId: user.id } });
            res.send(updated);
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to refresh overlay key", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async getRecords(req: FastifyRequest<{ Params: { userId: string }, Querystring: { key: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.endCredit.getRecords");
        const { userId } = req.params;
        const { key } = req.query;
        this.logger.info({ message: "Getting end credit viewer records", data: { userId } });

        try {
            const { records, config } = await this.endCreditService.getViewerRecordsForOverlay(userId, key);
            this.logger.info({ message: "Successfully retrieved end credit viewer records", data: { userId, count: records.length } });
            res.send({
                records,
                is_show_viewer_avatars: config.is_show_viewer_avatars,
                followers_header: config.followers_header,
                subscribes_header: config.subscribes_header,
                raids_header: config.raids_header,
                bits_header: config.bits_header,
                viewers_header: config.viewers_header,
            });
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to get end credit viewer records", data: { userId }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
