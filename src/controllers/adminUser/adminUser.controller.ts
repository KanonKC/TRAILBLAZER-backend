import { FastifyReply, FastifyRequest } from "fastify";
import AdminUserService from "@/services/adminUser/adminUser.service";
import { AdminAuthMiddleware } from "../middleware";
import TLogger, { Layer } from "@/logging/logger";
import { TError } from "@/errors";

export default class AdminUserController {
    private readonly adminUserService: AdminUserService;
    private readonly adminAuthMiddleware: AdminAuthMiddleware;
    private readonly logger: TLogger;

    constructor(adminUserService: AdminUserService, adminAuthMiddleware: AdminAuthMiddleware) {
        this.adminUserService = adminUserService;
        this.adminAuthMiddleware = adminAuthMiddleware;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async list(req: FastifyRequest<{ Querystring: { page?: string, limit?: string, search?: string, tier?: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.adminUser.list");
        const admin = await this.adminAuthMiddleware.authenticate(req, res);
        if (!admin) return; // 401 already sent

        try {
            const page = parseInt(req.query.page || "1");
            const limit = parseInt(req.query.limit || "20");
            const tier = req.query.tier !== undefined && req.query.tier !== "" ? parseInt(req.query.tier) : undefined;
            const result = await this.adminUserService.list({ page, limit }, req.query.search, tier);
            res.send(result);
        } catch (error) {
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to list users", error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async get(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.adminUser.get");
        const admin = await this.adminAuthMiddleware.authenticate(req, res);
        if (!admin) return; // 401 already sent

        try {
            const user = await this.adminUserService.get(req.params.id);
            res.send(user);
        } catch (error) {
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to get user", error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async getWidgets(req: FastifyRequest<{ Params: { id: string }, Querystring: { page?: string, limit?: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.adminUser.getWidgets");
        const admin = await this.adminAuthMiddleware.authenticate(req, res);
        if (!admin) return; // 401 already sent

        try {
            const page = parseInt(req.query.page || "1");
            const limit = parseInt(req.query.limit || "50");
            const result = await this.adminUserService.getWidgets(req.params.id, { page, limit });
            res.send(result);
        } catch (error) {
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to get user widgets", error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async getEventSubs(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.adminUser.getEventSubs");
        const admin = await this.adminAuthMiddleware.authenticate(req, res);
        if (!admin) return; // 401 already sent

        try {
            const result = await this.adminUserService.getEventSubs(req.params.id);
            res.send(result);
        } catch (error) {
            if (error instanceof TError) {
                return res.status(error.status).send(error.toJSON());
            }
            this.logger.error({ message: "Failed to get user event subs", error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
