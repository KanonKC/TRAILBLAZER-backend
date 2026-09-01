import { FastifyReply, FastifyRequest } from "fastify"
import { TwitchStreamOnlineEventRequest } from "./request"
import FirstWordService from "@/services/widget/firstWord/firstWord.service"
import EndCreditService from "@/services/widget/endCredit/endCredit.service"
import TLogger, { Layer } from "@/logging/logger"

export default class TwitchStreamOnlineEvent {
    private readonly firstWordService: FirstWordService;
    private readonly endCreditService: EndCreditService;
    private readonly logger: TLogger;

    constructor(firstWordService: FirstWordService, endCreditService: EndCreditService) {
        this.firstWordService = firstWordService;
        this.endCreditService = endCreditService;
        this.logger = new TLogger(Layer.EVENT);
    }

    async handle(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("event.twitch.streamOnline.handle");
        const body = req.body as any

        if (body.subscription.status === "webhook_callback_verification_pending") {
            this.logger.info({ message: "Verifying webhook callback", data: { challenge: body.challenge } });
            res.status(200).header("Content-Type", "text/plain").send(body.challenge)
            return
        }

        const event = body.event as TwitchStreamOnlineEventRequest

        if (body.subscription.status === "enabled") {
            this.logger.info({ message: "Handling stream online event", data: event })
            this.firstWordService.resetChattersOnStartStream(event)
            this.endCreditService.handleTwitchStreamOnlineEvent(event)
            res.status(204).send()
            return
        }

        this.logger.warn({ message: "Invalid subscription status", data: { status: body.subscription.status } });
        res.status(400).send({ message: "Invalid subscription status" })
    }
}