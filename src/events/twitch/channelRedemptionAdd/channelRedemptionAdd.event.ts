import { FastifyReply, FastifyRequest } from "fastify";
import RandomDbdPerkService from "@/services/widget/randomDbdPerk/randomDbdPerk.service";
import DropImageService from "@/services/widget/dropImage/dropImage.service";
import TLogger, { Layer } from "@/logging/logger";
import { TwitchChannelRedemptionAddEventRequest } from "./request";

export default class TwitchChannelRedemptionAddEvent {
    private readonly randomDbdPerkService: RandomDbdPerkService;
    private readonly dropImageService: DropImageService;
    private readonly logger: TLogger;

    constructor(randomDbdPerkService: RandomDbdPerkService, dropImageService: DropImageService) {
        this.randomDbdPerkService = randomDbdPerkService;
        this.dropImageService = dropImageService;
        this.logger = new TLogger(Layer.EVENT);
    }

    async handle(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("event.twitch.channelRedemptionAdd.handle");
        const body = req.body as any

        if (body.subscription.status === "webhook_callback_verification_pending") {
            this.logger.info({ message: "Verifying webhook callback", data: { challenge: body.challenge } });
            res.status(200).header("Content-Type", "text/plain").send(body.challenge)
            return
        }

        const event = body.event as TwitchChannelRedemptionAddEventRequest

        if (body.subscription.status === "enabled") {
            this.logger.info({ message: "Handling channel redemption add event", data: event })
            try {
                await Promise.allSettled([
                    this.randomDbdPerkService.randomPerk(event),
                ])
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
