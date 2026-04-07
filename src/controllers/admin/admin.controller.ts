import UserService from "@/services/user/user.service";
import { FastifyReply, FastifyRequest } from "fastify";
import TLogger, { Layer } from "@/logging/logger";
import { User } from "generated/prisma/client";
import { authenticateAdmin } from "../middleware";
import { TError } from "@/errors";

export default class AdminController {
    private readonly userService: UserService;
    private readonly logger: TLogger;

    constructor(userService: UserService) {
        this.userService = userService;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async updateUser(req: FastifyRequest<{ Body: Partial<User> & { id?: string }, Params: { id?: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.admin.updateUser");
        this.logger.info({ message: "Update user request received", data: { body: req.body, params: req.params } });

        try {

            const valid = authenticateAdmin(req)
            if (!valid) {
                this.logger.warn({ message: "Invalid admin key" });
                return res.status(401).send({ message: "Invalid admin key" });
            }

            const id = req.params.id;
            if (!id) {
                this.logger.warn({ message: "User ID is required" });
                return res.status(400).send({ message: "User ID is required" });
            }

            const updateData = req.body;

            const updatedUser = await this.userService.update(id, updateData);

            this.logger.info({ message: "User updated successfully", data: { userId: id } });
            res.send(updatedUser);
        } catch (err) {
            if (err instanceof TError) {
                this.logger.error({ message: "Failed to update user", error: err });
                return res.status(err.status).send({ message: err.message });
            }
            this.logger.error({ message: "Failed to update user", error: err as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async bulkAdjustTierAndWidgets(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.admin.bulkAdjustTierAndWidgets");
        this.logger.info({ message: "Bulk adjust tier and widgets request received" });

        try {
            const valid = authenticateAdmin(req)
            if (!valid) {
                this.logger.warn({ message: "Invalid admin key" });
                return res.status(401).send({ message: "Invalid admin key" });
            }

            await this.userService.bulkAdjustTierAndWidgets();

            this.logger.info({ message: "Bulk adjustment completed successfully" });
            res.send({ message: "Bulk adjustment completed successfully" });
        } catch (err) {
            if (err instanceof TError) {
                this.logger.error({ message: "Failed during bulk adjustment", error: err });
                return res.status(err.status).send({ message: err.message });
            }
            this.logger.error({ message: "Failed during bulk adjustment", error: err as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
