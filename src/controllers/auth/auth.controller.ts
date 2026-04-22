import { FastifyReply, FastifyRequest } from "fastify";
import AuthService from "../../services/auth/auth.service";
import TLogger, { Layer } from "@/logging/logger";
import { getUserFromRequest } from "../middleware";
import { TError } from "@/errors";

export default class AuthController {
    private readonly logger: TLogger;
    constructor(private authService: AuthService) {
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async logout(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.auth.logout");
        this.logger.info({ message: "User logging out" });
        const user = getUserFromRequest(req);
        if (!user) {
            this.logger.warn({ message: "No access token provided" });
            return res.status(401).send({ message: "Unauthorized" });
        }
        try {
            await this.authService.logout(user.id);
            res.clearCookie('accessToken', { path: '/' });
            res.clearCookie('refreshToken', { path: '/' });
            this.logger.info({ message: "Successfully logged out" });
            res.status(200).send({ message: "Logged out" });
        } catch (err) {
            if (err instanceof TError) {
                this.logger.error({ message: err.message, error: err });
                return res.status(err.status).send(err.toJSON());
            }
            this.logger.error({ message: "Logout failed", error: err as string | Error });
            return res.status(500).send({ message: "Logout failed" });
        }
    }

    async syncTwitchGqlToken(req: FastifyRequest<{ Body: { token: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.auth.syncTwitchGqlToken");
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).send({ message: "Unauthorized" });
        }

        const { token } = req.body;
        if (!token) {
            return res.status(400).send({ message: "Token is required" });
        }

        try {
            await this.authService.updateTwitchGqlToken(user.id, token);
            this.logger.info({ message: "Twitch GQL token synced", data: { userId: user.id } });
            res.status(204).send();
        } catch (err) {
            if (err instanceof TError) {
                return res.status(err.status).send(err.toJSON());
            }
            this.logger.error({ message: "Token sync failed", error: err as string | Error });
            return res.status(500).send({ message: "Internal server error" });
        }
    }
}