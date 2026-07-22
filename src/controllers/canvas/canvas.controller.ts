import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { TError } from "@/errors";
import TLogger, { Layer } from "@/logging/logger";
import CanvasService from "@/services/canvas/canvas.service";
import { getVariablesForWidgetTypes } from "@/services/canvas/variables";
import { getUserFromRequest } from "../middleware";
import { createCanvasSchema, putCanvasSchema, updateCanvasLinksSchema } from "./schemas";

export default class CanvasController {
    private service: CanvasService;
    private readonly logger: TLogger;

    constructor(service: CanvasService) {
        this.service = service;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async list(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.canvas.list");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const result = await this.service.list(user.id);
            res.send(result);
        } catch (error) {
            this.handleError(error, res, user.id, "list canvases");
        }
    }

    async create(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.canvas.create");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = createCanvasSchema.parse(req.body ?? {});
            const result = await this.service.create(user.id, request);
            res.status(201).send(result);
        } catch (error) {
            this.handleError(error, res, user.id, "create canvas");
        }
    }

    async get(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.canvas.get");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const result = await this.service.get(req.params.id, user.id);
            res.send(result);
        } catch (error) {
            this.handleError(error, res, user.id, "get canvas");
        }
    }

    async update(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.canvas.update");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = putCanvasSchema.parse(req.body ?? {});
            const { elements, ...meta } = request;

            if (Object.keys(meta).length > 0) {
                await this.service.update(req.params.id, user.id, meta);
            }
            if (elements) {
                await this.service.updateElements(req.params.id, user.id, elements);
            }

            const result = await this.service.get(req.params.id, user.id);
            res.send(result);
        } catch (error) {
            this.handleError(error, res, user.id, "update canvas");
        }
    }

    async delete(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.canvas.delete");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            await this.service.delete(req.params.id, user.id);
            res.status(204).send();
        } catch (error) {
            this.handleError(error, res, user.id, "delete canvas");
        }
    }

    async test(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.canvas.test");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            await this.service.test(req.params.id, user.id);
            res.status(202).send({ message: "Test triggered" });
        } catch (error) {
            this.handleError(error, res, user.id, "test canvas");
        }
    }

    async getLinks(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.canvas.getLinks");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const widgetIds = await this.service.getLinkedWidgetIds(req.params.id, user.id);
            res.send({ widgetIds });
        } catch (error) {
            this.handleError(error, res, user.id, "get canvas links");
        }
    }

    async updateLinks(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.canvas.updateLinks");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const request = updateCanvasLinksSchema.parse(req.body ?? {});
            await this.service.updateLinks(req.params.id, user.id, request.widgetIds);
            res.status(204).send();
        } catch (error) {
            this.handleError(error, res, user.id, "update canvas links");
        }
    }

    async getVariables(req: FastifyRequest<{ Querystring: { widgetTypes?: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.canvas.getVariables");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        const slugs = req.query.widgetTypes ? req.query.widgetTypes.split(",") : [];
        res.send({ variables: getVariablesForWidgetTypes(slugs) });
    }

    async getOverlayKey(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.canvas.getOverlayKey");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const overlayKey = await this.service.getOverlayKey(user.id);
            res.send({ overlayKey });
        } catch (error) {
            this.handleError(error, res, user.id, "get canvas overlay key");
        }
    }

    async refreshOverlayKey(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.canvas.refreshOverlayKey");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const overlayKey = await this.service.refreshOverlayKey(user.id);
            res.send({ overlayKey });
        } catch (error) {
            this.handleError(error, res, user.id, "refresh canvas overlay key");
        }
    }

    private handleError(error: unknown, res: FastifyReply, userId: string, action: string) {
        if (error instanceof z.ZodError) {
            this.logger.warn({ message: "Validation error", error: JSON.stringify(error.issues) });
            return res.status(400).send({ message: "Validation Error", errors: error.issues });
        }
        if (error instanceof TError) {
            this.logger.error({ message: error.message, data: { userId }, error });
            return res.status(error.status).send(error.toJSON());
        }
        this.logger.error({ message: `Failed to ${action}`, data: { userId }, error: error as Error });
        res.status(500).send({ message: "Internal Server Error" });
    }
}
