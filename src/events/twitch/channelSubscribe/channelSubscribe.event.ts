import { FastifyReply, FastifyRequest } from "fastify";
import EndCreditService from "@/services/widget/endCredit/endCredit.service";
import TLogger, { Layer } from "@/logging/logger";
import { TwitchChannelSubscribeEventRequest } from "./request";

export default class TwitchChannelSubscribeEvent {
    private readonly endCreditService: EndCreditService;
    private readonly logger: TLogger;

    constructor(endCreditService: EndCreditService) {
        this.endCreditService = endCreditService;
        this.logger = new TLogger(Layer.EVENT);
    }

    async handle(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("event.twitch.channelSubscribe.handle", req.id);
        const body = req.body as any

        if (body.subscription.status === "webhook_callback_verification_pending") {
            logger.info({ message: "Verifying webhook callback", data: { challenge: body.challenge } });
            res.status(200).header("Content-Type", "text/plain").send(body.challenge)
            return
        }

        const event = body.event as TwitchChannelSubscribeEventRequest

        if (body.subscription.status === "enabled") {
            // No-op: subs are recorded via channel.chat.notification instead (see
            // EndCreditService.handleTwitchChannelChatNotificationEvent). This route/handler
            // is not currently subscribed to in Twitch EventSub — kept as a placeholder for a
            // future direct channel.subscribe integration.
            logger.info({ message: "Handling channel subscribe event", data: event })
            res.status(204).send()
            return
        }

        logger.warn({ message: "Invalid subscription status", data: { status: body.subscription.status } });
        res.status(400).send({ message: "Invalid subscription status" })
    }
}
