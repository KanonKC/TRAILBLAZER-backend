import { FastifyRequest, FastifyReply } from "fastify";
import LinkedAccountService from "@/services/linkedAccount/linkedAccount.service";
import { authenticationRequired } from "../middleware";
import TLogger, { Layer } from "@/logging/logger";
import { TError } from "@/errors";

export default class LinkedAccountController {
    private readonly linkedAccountService: LinkedAccountService;
    private readonly logger: TLogger;

    constructor(linkedAccountService: LinkedAccountService) {
        this.linkedAccountService = linkedAccountService;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async list(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.linkedAccount.list");
        const user = await authenticationRequired(req, res);
        if (!user) return;

        try {
            const accounts = await this.linkedAccountService.listByUserId(user.id);
            this.logger.info({ message: "Listed linked accounts", data: { userId: user.id, count: accounts.length } });
            res.send(accounts);
        } catch (err) {
            if (err instanceof TError) {
                this.logger.error({ message: err.message, error: err });
                return res.status(err.status).send(err.toJSON());
            }
            this.logger.error({ message: "Failed to list linked accounts", error: err as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async bind(req: FastifyRequest<{ Params: { platform: string }; Body: { code: string; code_verifier?: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.linkedAccount.bind");
        const user = await authenticationRequired(req, res);
        if (!user) return;

        try {
            const { platform } = req.params;
            const { code, code_verifier } = req.body;

            if (!code) {
                return res.status(400).send({ message: "OAuth code is required" });
            }

            const linkedAccount = await this.linkedAccountService.bindAccount(user.id, platform, code, code_verifier);
            this.logger.info({ message: "Account bound", data: { userId: user.id, platform } });
            res.send(linkedAccount);
        } catch (err) {
            if (err instanceof TError) {
                this.logger.error({ message: err.message, error: err });
                return res.status(err.status).send(err.toJSON());
            }
            this.logger.error({ message: "Failed to bind account", error: err as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async unbind(req: FastifyRequest<{ Params: { platform: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.linkedAccount.unbind");
        const user = await authenticationRequired(req, res);
        if (!user) return;

        try {
            const { platform } = req.params;
            await this.linkedAccountService.unbindAccount(user.id, platform);
            this.logger.info({ message: "Account unbound", data: { userId: user.id, platform } });
            res.status(204).send();
        } catch (err) {
            if (err instanceof TError) {
                this.logger.error({ message: err.message, error: err });
                return res.status(err.status).send(err.toJSON());
            }
            this.logger.error({ message: "Failed to unbind account", error: err as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
