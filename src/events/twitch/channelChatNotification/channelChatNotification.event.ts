import { FastifyReply, FastifyRequest } from "fastify";
import ClipShoutoutService from "@/services/widget/clipShoutout/clipShoutout.service";
import { TwitchChannelChatNotificationEventRequest } from "./request";
import TLogger, { Layer } from "@/logging/logger";

export default class TwitchChannelChatNotificationEvent {
    private readonly clipShoutoutService: ClipShoutoutService;
    private readonly logger: TLogger;

    constructor(clipShoutoutService: ClipShoutoutService) {
        this.clipShoutoutService = clipShoutoutService;
        this.logger = new TLogger(Layer.EVENT);
    }

    async handle(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("event.twitch.channelChatNotification.handle");
        const body = req.body as any

        if (body.subscription.status === "webhook_callback_verification_pending") {
            this.logger.info({ message: "Verifying webhook callback", data: { challenge: body.challenge } });
            res.status(200).header("Content-Type", "text/plain").send(body.challenge)
            return
        }

        const event = body.event as TwitchChannelChatNotificationEventRequest

        if (body.subscription.status === "enabled") {
            this.logger.info({ message: "Handling chat notification event", data: event })
            try {
                this.clipShoutoutService.shoutoutRaider(event)
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