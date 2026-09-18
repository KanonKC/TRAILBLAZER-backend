import TwitchService from "@/services/twitch/twitch";
import { FastifyReply, FastifyRequest } from "fastify";
import { getUserFromRequest } from "../middleware";
import TLogger, { Layer } from "@/logging/logger";
import { TError } from "@/errors";

export default class TwitchController {
    private twitchService: TwitchService;
    private readonly logger: TLogger;

    constructor(twitchService: TwitchService) {
        this.twitchService = twitchService;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async listChannelRewards(req: FastifyRequest<{ Querystring: { user_input_required?: string } }>, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.twitch.getChannelRewards", req.id);
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        const { user_input_required } = req.query;

        try {
            const response = await this.twitchService.listChannelRewards(req.id, user.twitchId, {
                userInputRequired: user_input_required === "true"
            });
            return res.status(200).send(response);
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to get channel rewards", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async listEventSubs(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.twitch.listEventSubs", req.id);
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        try {
            const response = await this.twitchService.listEventSubs(user.twitchId);
            return res.status(200).send(response);
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to list event subs", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    async getUser(req: FastifyRequest<{ Querystring: { username?: string } }>, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.twitch.getUser", req.id);
        const user = getUserFromRequest(req);
        if (!user) {
            logger.warn({ message: "Unauthorized access attempt" });
            return res.status(401).send({ message: "Unauthorized" });
        }

        const { username } = req.query;

        try {
            let response;
            if (username) {
                response = await this.twitchService.getUserByName(req.id, user.twitchId, username);
            } else {
                response = await this.twitchService.getUser(req.id, user.twitchId);
            }
            return res.status(200).send(response);
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, data: { userId: user.id }, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to get user", data: { userId: user.id }, error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}