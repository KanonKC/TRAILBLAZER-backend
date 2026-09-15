import { FastifyReply, FastifyRequest } from "fastify";
import AuthService from "../../services/auth/auth.service";
import TLogger, { Layer } from "@/logging/logger";
import { AuthMiddleware } from "../middleware";
import { clearAuthCookies } from "@/libs/cookies";
import { BadRequestError, InternalServerError, TError } from "@/errors";

export default class AuthController {
    private readonly logger: TLogger;
    constructor(private authService: AuthService, private authMiddleware: AuthMiddleware) {
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async logout(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.auth.logout");
        this.logger.info({ message: "User logging out" });
        const user = await this.authMiddleware.authenticate(req, res);
        if (!user) return; // 401 already sent

        try {
            await this.authService.logout(user.id, req.cookies.refreshToken);
            clearAuthCookies(res);
            this.logger.info({ message: "Successfully logged out" });
            res.status(200).send({ message: "Logged out" });
        } catch (err) {
            if (err instanceof TError) {
                this.logger.error({ message: err.message, error: err });
                return res.status(err.status).send(err.toJSON());
            }
            this.logger.error({ message: "Logout failed", error: err as string | Error });
            const error = new InternalServerError("Logout failed");
            return res.status(error.status).send(error.toJSON());
        }
    }

    async syncTwitchGqlToken(req: FastifyRequest<{ Body: { token: string } }>, res: FastifyReply) {
        this.logger.setContext("controller.auth.syncTwitchGqlToken");
        const user = await this.authMiddleware.authenticate(req, res);
        if (!user) return; // 401 already sent

        const { token } = req.body;
        if (!token) {
            const error = new BadRequestError("Token is required");
            return res.status(error.status).send(error.toJSON());
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
            const error = new InternalServerError();
            return res.status(error.status).send(error.toJSON());
        }
    }
}
