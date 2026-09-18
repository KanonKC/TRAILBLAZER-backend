import { FastifyReply, FastifyRequest } from "fastify";
import RandomDbdPerkService from "@/services/widget/randomDbdPerk/randomDbdPerk.service";
import DropImageService from "@/services/widget/dropImage/dropImage.service";
import RandomDBDKillerService from "@/services/widget/randomDBDKiller/randomDBDKiller.service";
import TLogger, { Layer } from "@/logging/logger";
import { TwitchChannelRedemptionAddEventRequest } from "./request";

export default class TwitchChannelRedemptionAddEvent {
    private readonly randomDbdPerkService: RandomDbdPerkService;
    private readonly dropImageService: DropImageService;
    private readonly randomDBDKillerService: RandomDBDKillerService;
    private readonly logger: TLogger;

    constructor(randomDbdPerkService: RandomDbdPerkService, dropImageService: DropImageService, randomDBDKillerService: RandomDBDKillerService) {
        this.randomDbdPerkService = randomDbdPerkService;
        this.dropImageService = dropImageService;
        this.randomDBDKillerService = randomDBDKillerService;
        this.logger = new TLogger(Layer.EVENT);
    }

    async handle(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("event.twitch.channelRedemptionAdd.handle", req.id);
        const body = req.body as any

        if (body.subscription.status === "webhook_callback_verification_pending") {
            logger.info({ message: "Verifying webhook callback", data: { challenge: body.challenge } });
            res.status(200).header("Content-Type", "text/plain").send(body.challenge)
            return
        }

        const event = body.event as TwitchChannelRedemptionAddEventRequest

        if (body.subscription.status === "enabled") {
            logger.info({ message: "Handling channel redemption add event", data: event })
            try {
                await Promise.allSettled([
                    this.randomDbdPerkService.randomPerk(req.id, event),
                    this.randomDBDKillerService.randomizeKiller(req.id, event),
                ])
            } catch (err: any) {
                logger.error({ message: "Handle event failed", error: err })
            }
            res.status(204).send()
            return
        }

        logger.warn({ message: "Invalid subscription status", data: { status: body.subscription.status } });
        res.status(400).send({ message: "Invalid subscription status" })
    }
}
