import { FastifyRequest, FastifyReply } from "fastify";
import LinkedAccountService from "@/services/linkedAccount/linkedAccount.service";
import { AuthMiddleware } from "../middleware";
import TLogger, { Layer } from "@/logging/logger";
import { TError } from "@/errors";

export default class LinkedAccountController {
    private readonly linkedAccountService: LinkedAccountService;
    private readonly authMiddleware: AuthMiddleware;
    private readonly logger: TLogger;

    constructor(linkedAccountService: LinkedAccountService, authMiddleware: AuthMiddleware) {
        this.linkedAccountService = linkedAccountService;
        this.authMiddleware = authMiddleware;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async list(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.linkedAccount.list", req.id);
        const user = await this.authMiddleware.authenticate(req, res);
        if (!user) return;

        try {
            const accounts = await this.linkedAccountService.listByUserId(user.id);
            logger.info({ message: "Listed linked accounts", data: { userId: user.id, count: accounts.length } });
            res.send(accounts);
        } catch (err) {
            if (err instanceof TError) {
                logger.error({ message: err.message, error: err });
                return res.status(err.status).send(err.toJSON());
            }
            logger.error({ message: "Failed to list linked accounts", error: err as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async bind(req: FastifyRequest<{ Params: { platform: string }; Body: { code: string; code_verifier?: string } }>, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.linkedAccount.bind", req.id);
        const user = await this.authMiddleware.authenticate(req, res);
        if (!user) return;

        try {
            const { platform } = req.params;
            const { code, code_verifier } = req.body;

            if (!code) {
                return res.status(400).send({ message: "OAuth code is required" });
            }

            const linkedAccount = await this.linkedAccountService.bindAccount(user.id, platform, code, code_verifier);
            logger.info({ message: "Account bound", data: { userId: user.id, platform } });
            res.send(linkedAccount);
        } catch (err) { 
            if (err instanceof TError) {
                logger.error({ message: err.message, error: err });
                return res.status(err.status).send(err.toJSON());
            }
            logger.error({ message: "Failed to bind account", error: err as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async unbind(req: FastifyRequest<{ Params: { platform: string } }>, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.linkedAccount.unbind", req.id);
        const user = await this.authMiddleware.authenticate(req, res);
        if (!user) return;

        try {
            const { platform } = req.params;
            await this.linkedAccountService.unbindAccount(user.id, platform);
            logger.info({ message: "Account unbound", data: { userId: user.id, platform } });
            res.status(204).send();
        } catch (err) {
            if (err instanceof TError) {
                logger.error({ message: err.message, error: err });
                return res.status(err.status).send(err.toJSON());
            }
            logger.error({ message: "Failed to unbind account", error: err as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
