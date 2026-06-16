import { FastifyReply, FastifyRequest } from "fastify";
import { TwitchChannelChatMessageEventRequest } from "./request";
import FirstWordService from "@/services/widget/firstWord/firstWord.service";
import TLogger, { Layer } from "@/logging/logger";
import DropImageService from "@/services/widget/dropImage/dropImage.service";
import SpotifySongRequestService from "@/services/widget/spotifySongRequest/spotifySongRequest.service";

export default class TwitchChannelChatMessageEvent {

    private readonly firstWordService: FirstWordService;
    private readonly dropImageService: DropImageService;
    private readonly spotifySongRequestService: SpotifySongRequestService;
    private readonly logger: TLogger;

    constructor(firstWordService: FirstWordService, dropImageService: DropImageService, spotifySongRequestService: SpotifySongRequestService) {
        this.firstWordService = firstWordService;
        this.dropImageService = dropImageService;
        this.spotifySongRequestService = spotifySongRequestService;
        this.logger = new TLogger(Layer.EVENT);
    }

    async handle(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("event.twitch.channelChatMessage.handle");
        const body = req.body as any

        if (body.subscription.status === "webhook_callback_verification_pending") {
            this.logger.info({ message: "Verifying webhook callback", data: { challenge: body.challenge } });
            res.status(200).header("Content-Type", "text/plain").send(body.challenge)
            return
        }

        const event = body.event as TwitchChannelChatMessageEventRequest

        if (body.subscription.status === "enabled") {
            try {
                await Promise.allSettled([
                    this.firstWordService.greetNewChatter(event),
                    this.dropImageService.handleDropImage(event),
                    this.spotifySongRequestService.handleTwitchEvent(event),
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