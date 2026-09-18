import UserService from "@/services/user/user.service";
import { FastifyReply, FastifyRequest } from "fastify";
import TLogger, { Layer } from "@/logging/logger";
import { User } from "generated/prisma/client";
import { AdminAuthMiddleware } from "../middleware";
import { TError } from "@/errors";

export default class AdminController {
    private readonly userService: UserService;
    private readonly adminAuthMiddleware: AdminAuthMiddleware;
    private readonly logger: TLogger;

    constructor(userService: UserService, adminAuthMiddleware: AdminAuthMiddleware) {
        this.userService = userService;
        this.adminAuthMiddleware = adminAuthMiddleware;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async updateUser(req: FastifyRequest<{ Body: Partial<User> & { id?: string }, Params: { id?: string } }>, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.admin.updateUser", req.id);
        logger.info({ message: "Update user request received", data: { body: req.body, params: req.params } });

        const admin = await this.adminAuthMiddleware.authenticate(req, res);
        if (!admin) return; // 401 already sent

        try {
            const id = req.params.id;
            if (!id) {
                logger.warn({ message: "User ID is required" });
                return res.status(400).send({ message: "User ID is required" });
            }

            const updateData = req.body;

            const updatedUser = await this.userService.update(req.id, id, updateData);

            logger.info({ message: "User updated successfully", data: { userId: id, adminId: admin.id } });
            res.send(updatedUser);
        } catch (err) {
            if (err instanceof TError) {
                logger.error({ message: "Failed to update user", error: err });
                return res.status(err.status).send({ message: err.message });
            }
            logger.error({ message: "Failed to update user", error: err as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async bulkAdjustTierAndWidgets(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.admin.bulkAdjustTierAndWidgets", req.id);
        logger.info({ message: "Bulk adjust tier and widgets request received" });

        const admin = await this.adminAuthMiddleware.authenticate(req, res);
        if (!admin) return; // 401 already sent

        try {
            await this.userService.bulkAdjustTierAndWidgets(req.id);

            logger.info({ message: "Bulk adjustment completed successfully", data: { adminId: admin.id } });
            res.send({ message: "Bulk adjustment completed successfully" });
        } catch (err) {
            if (err instanceof TError) {
                logger.error({ message: "Failed during bulk adjustment", error: err });
                return res.status(err.status).send({ message: err.message });
            }
            logger.error({ message: "Failed during bulk adjustment", error: err as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
