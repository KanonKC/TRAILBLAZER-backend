import UserService from "@/services/user/user.service";
import ReferralService from "@/services/referral/referral.service";
import { FastifyReply, FastifyRequest } from "fastify";
import { getUserFromRequest } from "../middleware";
import { GetTierQuery, LoginQuery } from "./request";
import { loginSchema } from "./schemas";
import { z } from "zod";

import Configurations from "@/config/index";
import TLogger, { Layer } from "@/logging/logger";
import { verifyToken } from "@/libs/jwt";
import { TError } from "@/errors";

export default class UserController {

    private readonly cfg: Configurations;
    private readonly userService: UserService;
    private readonly referralService: ReferralService;
    private readonly logger: TLogger;

    constructor(cfg: Configurations, userService: UserService, referralService: ReferralService) {
        this.cfg = cfg;
        this.userService = userService;
        this.referralService = referralService;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async login(req: FastifyRequest<{ Querystring: LoginQuery }>, res: FastifyReply) {
        this.logger.setContext("controller.user.login");
        this.logger.info({ message: "Login attempt initiated" });
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

            const { accessToken, refreshToken, user } = await this.userService.login(request);

            res.setCookie('accessToken', accessToken, {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                domain: this.cfg.rootDomain,
                maxAge: 60 * 15 // 15 minutes
            });

            res.setCookie('refreshToken', refreshToken, {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                domain: this.cfg.rootDomain,
                maxAge: 60 * 60 * 24 * 30 // 30 days
            });
            res.redirect(this.cfg.frontendOrigin);
            this.logger.info({ message: "Login successful", data: user });
        } catch (err) {
            if (err instanceof z.ZodError) {
                this.logger.warn({ message: "Validation error", data: req.query, error: err.message });
                return res.status(400).send({ message: "Validation Error", errors: err.issues });
            }
            if (err instanceof TError) {
                this.logger.error({ message: err.message, data: req.query, error: err });
                return res.status(err.status).send(err.toJSON());
            }
            this.logger.error({ message: "Login failed", data: req.query, error: err as Error | string });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async me(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.user.me");
        this.logger.info({ message: "Getting current user info" });
        const token = req.cookies.accessToken;
        if (!token) {
            this.logger.warn({ message: "No access token provided" });
            return res.status(401).send({ message: "Unauthorized" });
        }
        try {
            // TODO: Define interface for decoded token to avoid using any
            const decoded = verifyToken(token) as any;
            const user = await this.userService.get(decoded.id);
            decoded.tier = await this.userService.getTier(user.id);
            decoded.extraWidgetQuota = user.extra_widget_quota;
            decoded.hasTwitchGqlToken = await this.userService.hasTwitchGqlToken(user.id);
            this.logger.info({ message: "Successfully retrieved user info", data: decoded });
            res.send(decoded);
        } catch (err) {
            this.logger.warn({ message: "Invalid token", error: err as string | Error });
            return res.status(401).send({ message: "Invalid token" });
        }
    }

    async getTier(req: FastifyRequest<{ Querystring: GetTierQuery }>, res: FastifyReply) {
        this.logger.setContext("controller.user.getTier");
        this.logger.info({ message: "Getting user tier" });
        const token = req.cookies.accessToken;
        if (!token) {
            this.logger.warn({ message: "No access token provided" });
            return res.status(401).send({ message: "Unauthorized" });
        }
        try {
            const decoded = verifyToken(token);
            const force = req.query.force === "true";
            const tier = await this.userService.getTier(decoded.id, { forceTwitch: force });
            this.logger.info({ message: "Successfully retrieved user tier", data: { userId: decoded.id, tier, force } });
            res.send({ tier });
        } catch (err) {
            this.logger.error({ message: "Failed to get user tier", error: err as string | Error });
            if (err instanceof TError) {
                return res.status(err.status).send(err.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async refresh(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.user.refresh");
        this.logger.info({ message: "Token refresh requested" });
        const { refreshToken } = req.cookies;
        if (!refreshToken) {
            this.logger.warn({ message: "No refresh token provided" });
            return res.status(401).send({ message: "No refresh token" });
        }

        try {
            const tokens = await this.userService.refreshToken(refreshToken);

            res.setCookie('accessToken', tokens.accessToken, {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                domain: this.cfg.rootDomain,
                maxAge: 60 * 15 // 15 minutes
            });

            res.setCookie('refreshToken', tokens.refreshToken, {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                domain: this.cfg.rootDomain,
                maxAge: 60 * 60 * 24 * 30 // 30 days
            });

            this.logger.info({ message: "Token refreshed successfully" });
            res.send({ message: "Token refreshed" });
        } catch (err) {
            if (err instanceof TError) {
                this.logger.error({ message: err.message, error: err });
                res.clearCookie('accessToken', { path: '/' });
                res.clearCookie('refreshToken', { path: '/' });
                return res.status(err.status).send(err.toJSON());
            }
            this.logger.error({ message: "Token refresh failed", error: err as string | Error });
            res.clearCookie('accessToken', { path: '/' });
            res.clearCookie('refreshToken', { path: '/' });
            res.status(401).send({ message: "Invalid refresh token" });
        }
    }

    async listShowcase(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.user.listShowcase");
        this.logger.info({ message: "Listing user showcase" });
        try {
            const showcase = await this.userService.listShowcase();
            this.logger.info({ message: "Successfully retrieved user showcase" });
            res.send(showcase);
        } catch (err) {
            this.logger.error({ message: "Failed to list user showcase", error: err as string | Error });
            if (err instanceof TError) {
                return res.status(err.status).send(err.toJSON());
            }
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async getReferralStatus(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.user.getReferralStatus");
        const token = req.cookies.accessToken;
        if (!token) return res.status(401).send({ message: "Unauthorized" });

        try {
            const decoded = verifyToken(token);
            const user = await this.userService.get(decoded.id);
            const code = await this.referralService.getOrCreateCode(user.id, user.twitch_id);
            const status = await this.referralService.getReferralStatus(user.id);

            res.send({ ...status, code });
        } catch (err) {
            this.logger.error({ message: "Failed to get referral status", error: err as string | Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
