import UserService from "@/services/user/user.service";
import ReferralService from "@/services/referral/referral.service";
import { FastifyReply, FastifyRequest } from "fastify";
import { AuthMiddleware } from "../middleware";
import { GetTierQuery, LoginQuery } from "./request";
import { loginSchema } from "./schemas";
import { z } from "zod";

import Configurations from "@/config/index";
import TLogger, { Layer } from "@/logging/logger";
import { setAuthCookies, clearAuthCookies } from "@/libs/cookies";
import { TError } from "@/errors";

export default class UserController {

    private readonly cfg: Configurations;
    private readonly userService: UserService;
    private readonly referralService: ReferralService;
    private readonly authMiddleware: AuthMiddleware;
    private readonly logger: TLogger;

    constructor(cfg: Configurations, userService: UserService, referralService: ReferralService, authMiddleware: AuthMiddleware) {
        this.cfg = cfg;
        this.userService = userService;
        this.referralService = referralService;
        this.authMiddleware = authMiddleware;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async login(req: FastifyRequest<{ Querystring: LoginQuery }>, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.user.login", req.id);
        logger.info({ message: "Login attempt initiated" });
        try {
            const query = loginSchema.parse(req.query);

            // Extract ref from state if present (format: nonce:ref)
            let ref: string | undefined = undefined;
            if (query.state && query.state.includes(":")) {
                const parts = query.state.split(":");
                ref = parts[1];
            }

            const request = {
                code: query.code,
                state: query.state,
                scope: query.scope.split(" "),
                ref: ref
            };

            const { accessToken, refreshToken, user } = await this.userService.login(request, req.id);

            setAuthCookies(res, { accessToken, refreshToken });
            res.redirect(this.cfg.frontendOrigin);
            logger.info({ message: "Login successful", data: user });
        } catch (err) {
            if (err instanceof z.ZodError) {
                logger.warn({ message: "Validation error", data: req.query, error: err.message });
                return res.status(400).send({ message: "Validation Error", errors: err.issues });
            }
            if (err instanceof TError) {
                logger.error({ message: err.message, data: req.query, error: err });
                return res.status(err.status).send(err.toJSON());
            }
            logger.error({ message: "Login failed", data: req.query, error: err as Error | string });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async me(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.user.me", req.id);
        logger.info({ message: "Getting current user info" });
        const decoded = await this.authMiddleware.authenticate(req, res);
        if (!decoded) return; // 401 already sent

        try {
            const info: Record<string, unknown> = { ...decoded };
            const user = await this.userService.get(decoded.id, req.id);
            info.tier = await this.userService.getTier(user.id, undefined, req.id);
            info.extraWidgetQuota = user.extra_widget_quota;
            info.hasTwitchGqlToken = await this.userService.hasTwitchGqlToken(user.id, req.id);
            logger.info({ message: "Successfully retrieved user info", data: info });
            res.send(info);
        } catch (err) {
            logger.error({ message: "Failed to get current user info", error: err as string | Error });
            if (err instanceof TError) {
                return res.status(err.status).send(err.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async getTier(req: FastifyRequest<{ Querystring: GetTierQuery }>, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.user.getTier", req.id);
        logger.info({ message: "Getting user tier" });
        const decoded = await this.authMiddleware.authenticate(req, res);
        if (!decoded) return; // 401 already sent

        try {
            const force = req.query.force === "true";
            const tier = await this.userService.getTier(decoded.id, { forceTwitch: force }, req.id);
            logger.info({ message: "Successfully retrieved user tier", data: { userId: decoded.id, tier, force } });
            res.send({ tier });
        } catch (err) {
            logger.error({ message: "Failed to get user tier", error: err as string | Error });
            if (err instanceof TError) {
                return res.status(err.status).send(err.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async refresh(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.user.refresh", req.id);
        logger.info({ message: "Token refresh requested" });
        const { refreshToken } = req.cookies;
        if (!refreshToken) {
            logger.warn({ message: "No refresh token provided" });
            return res.status(401).send({ message: "No refresh token" });
        }

        try {
            const tokens = await this.userService.refreshToken(refreshToken, req.id);

            setAuthCookies(res, tokens);

            logger.info({ message: "Token refreshed successfully" });
            res.send({ message: "Token refreshed" });
        } catch (err) {
            if (err instanceof TError) {
                logger.error({ message: err.message, error: err });
                clearAuthCookies(res);
                return res.status(err.status).send(err.toJSON());
            }
            logger.error({ message: "Token refresh failed", error: err as string | Error });
            clearAuthCookies(res);
            res.status(401).send({ message: "Invalid refresh token" });
        }
    }

    async listShowcase(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.user.listShowcase", req.id);
        logger.info({ message: "Listing user showcase" });
        try {
            const showcase = await this.userService.listShowcase(req.id);
            logger.info({ message: "Successfully retrieved user showcase" });
            res.send(showcase);
        } catch (err) {
            logger.error({ message: "Failed to list user showcase", error: err as string | Error });
            if (err instanceof TError) {
                return res.status(err.status).send(err.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async getReferralStatus(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.user.getReferralStatus", req.id);
        const decoded = await this.authMiddleware.authenticate(req, res);
        if (!decoded) return; // 401 already sent

        try {
            const user = await this.userService.get(decoded.id, req.id);
            const code = await this.referralService.getOrCreateCode(user.id, user.twitch_id, req.id);
            const status = await this.referralService.getReferralStatus(user.id, req.id);

            res.send({ ...status, code });
        } catch (err) {
            logger.error({ message: "Failed to get referral status", error: err as string | Error });
            if (err instanceof TError) {
                return res.status(err.status).send(err.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
