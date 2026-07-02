import { FastifyReply, FastifyRequest } from "fastify";
import EndCreditService from "@/services/widget/endCredit/endCredit.service";
import TLogger, { Layer } from "@/logging/logger";
import { TwitchChannelFollowEventRequest } from "./request";

export default class TwitchChannelFollowEvent {
    private readonly endCreditService: EndCreditService;
    private readonly logger: TLogger;

    constructor(endCreditService: EndCreditService) {
        this.endCreditService = endCreditService;
        this.logger = new TLogger(Layer.EVENT);
    }

    async handle(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("event.twitch.channelFollow.handle");
        const body = req.body as any

        if (body.subscription.status === "webhook_callback_verification_pending") {
            this.logger.info({ message: "Verifying webhook callback", data: { challenge: body.challenge } });
            res.status(200).header("Content-Type", "text/plain").send(body.challenge)
            return
        }

        const event = body.event as TwitchChannelFollowEventRequest

        if (body.subscription.status === "enabled") {
            this.logger.info({ message: "Handling channel follow event", data: event })
            try {
                await this.endCreditService.recordViewerAction(event.broadcaster_user_id, event.user_id, event, new Date(event.followed_at))
            } catch (err: any) {
                this.logger.error({ message: "Handle event failed", error: err })
            }
            res.status(204).send()
            return
        }

        this.logger.warn({ message: "Invalid subscription status", data: { status: body.subscription.status } });
        res.status(400).send({ message: "Invalid subscription status" })
    }
}
