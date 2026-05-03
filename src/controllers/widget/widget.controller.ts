import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import TLogger, { Layer } from "@/logging/logger";
import { getUserFromRequest } from "../middleware";
import WidgetService from "@/services/widget/widget.service";
import { updateWidgetSchema, updateWidgetEnableSchema } from "./schemas";
import { TError, BadRequestError } from "@/errors";

export default class WidgetController {
    private widgetService: WidgetService;
    private readonly logger: TLogger;

    constructor(widgetService: WidgetService) {
        this.widgetService = widgetService;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async getFirstEnabled(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.widget.getFirstEnabled");
        this.logger.info({ message: "Getting first enabled widget" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const first = await this.widgetService.getFirstEnabled(user.id);
            this.logger.info({ message: "Successfully fetched first enabled widget", data: { userId: user.id } });
            res.send(first);
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to fetch first enabled widget", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async list(req: FastifyRequest<{
        Querystring: { page?: string, limit?: string, enabled?: string }
    }>, res: FastifyReply) {
        this.logger.setContext("controller.widget.list");
        this.logger.info({ message: "Listing widgets" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const page = parseInt(req.query.page || "1");
            const limit = parseInt(req.query.limit || "20");
            const enabled = req.query.enabled === "true" ? true : req.query.enabled === "false" ? false : undefined;

            const result = await this.widgetService.list(user.id, { page, limit }, { enabled });
            this.logger.info({ message: "Successfully listed widgets", data: { userId: user.id, total: result.pagination.total } });
            res.send(result);
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to list widgets", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async update(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.widget.update");
        this.logger.info({ message: "Updating widget" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const { id } = req.params as { id: string };
            const request = updateWidgetSchema.parse(req.body);
            // Pass user.id to service update method
            const updated = await this.widgetService.update(id, user.id, request);
            this.logger.info({ message: "Successfully updated widget", data: { userId: user.id, widgetId: id } });
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
            this.logger.error({ message: "Failed to update widget", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async updateEnable(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.widget.updateEnable");
        this.logger.info({ message: "Updating widget enable status" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const { id } = req.params as { id: string };
            const request = updateWidgetEnableSchema.parse(req.body);
            const updated = await this.widgetService.updateEnable(id, user.id, request.enabled);
            this.logger.info({ message: "Successfully updated widget enable status", data: { userId: user.id, widgetId: id, enabled: request.enabled } });
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
            this.logger.error({ message: "Failed to update widget enable status", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async validateOverlayAccess(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.widget.validateOverlayAccess");
        this.logger.info({ message: "Validating overlay access" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const { key } = req.params as { key: string };
            const valid = await this.widgetService.validateOverlayAccess(user.id, key);
            this.logger.info({ message: "Overlay access validation complete", data: { userId: user.id, valid } });
            res.send({ valid });
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to validate overlay access", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async delete(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.widget.delete");
        this.logger.info({ message: "Deleting widget" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const { id } = req.params as { id: string };
            // Pass user.id to service delete method
            await this.widgetService.delete(id, user.id);
            this.logger.info({ message: "Successfully deleted widget", data: { userId: user.id, widgetId: id } });
            res.status(204).send();
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to delete widget", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
    async getQuota(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.widget.getQuota");
        this.logger.info({ message: "Getting widget quota" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const quota = await this.widgetService.getQuota(user.id);
            this.logger.info({ message: "Successfully fetched quota", data: { userId: user.id, quota } });
            res.send(quota);
        } catch (error) {
            if (error instanceof TError) {
                this.logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to fetch quota", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
