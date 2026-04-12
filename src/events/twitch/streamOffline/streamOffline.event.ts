import { FastifyReply, FastifyRequest } from "fastify"
import { TwitchStreamOfflineEventRequest } from "./request"
import ExportVideoService from "@/services/widget/exportVideo/exportVideo.service"
import TLogger, { Layer } from "@/logging/logger"

export default class TwitchStreamOfflineEvent {
    private readonly exportVideoService: ExportVideoService;
    private readonly logger: TLogger;

    constructor(exportVideoService: ExportVideoService) {
        this.exportVideoService = exportVideoService;
        this.logger = new TLogger(Layer.EVENT);
    }

    async handle(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("event.twitch.streamOffline.handle");
        const body = req.body as any

        if (body.subscription.status === "webhook_callback_verification_pending") {
            this.logger.info({ message: "Verifying webhook callback", data: { challenge: body.challenge } });
            res.status(200).header("Content-Type", "text/plain").send(body.challenge)
            return
        }

        const event = body.event as TwitchStreamOfflineEventRequest

        if (body.subscription.status === "enabled") {
            this.logger.info({ message: "Handling stream offline event", data: event })
            await this.exportVideoService.onTwitchStreamOffline(event)
            res.status(204).send()
            return
        }

        this.logger.warn({ message: "Invalid subscription status", data: { status: body.subscription.status } });
        res.status(400).send({ message: "Invalid subscription status" })
    }
}
