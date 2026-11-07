import RandomPoolService from "@/services/randomPool/randomPool.service";
import { FastifyReply, FastifyRequest } from "fastify";
import RandomDbdPerkService from "@/services/widget/randomDbdPerk/randomDbdPerk.service";
import DropImageService from "@/services/widget/dropImage/dropImage.service";
import RandomDBDKillerService from "@/services/widget/randomDBDKiller/randomDBDKiller.service";
import RedemptionClaimService from "@/services/redemptionClaim/redemptionClaim.service";
import ReactiveRewardService from "@/services/reactiveReward/reactiveReward.service";
import TLogger, { Layer } from "@/logging/logger";
import { verifyTwitchSignature } from "../verifySignature";
import { TwitchChannelRedemptionAddEventRequest } from "./request";

type EventSubMessageType = "notification" | "webhook_callback_verification" | "revocation";

interface EventSubEnvelope {
    challenge?: string;
    subscription?: { id?: string; status?: string; type?: string };
    event?: TwitchChannelRedemptionAddEventRequest;
}

export default class TwitchChannelRedemptionAddEvent {
    private readonly randomDbdPerkService: RandomDbdPerkService;
    private readonly dropImageService: DropImageService;
    private readonly randomDBDKillerService: RandomDBDKillerService;
    private readonly logger: TLogger;

    constructor(
        randomDbdPerkService: RandomDbdPerkService,
        dropImageService: DropImageService,
        randomDBDKillerService: RandomDBDKillerService,
        private readonly randomPoolService?: RandomPoolService,
        private readonly redemptionClaimService?: RedemptionClaimService,
        private readonly eventSubSecret: string = "",
        private readonly reactiveRewardService?: ReactiveRewardService,
    ) {
        this.randomDbdPerkService = randomDbdPerkService;
        this.dropImageService = dropImageService;
        this.randomDBDKillerService = randomDBDKillerService;
        this.logger = new TLogger(Layer.EVENT);
    }

    /** v1 route. Unverified, kept running unchanged until no subscription points at it any more. */
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
                await this.runClaimedWidgets(event, req.id)
            } catch (err: any) {
                logger.error({ message: "Handle event failed", error: err })
            }
            res.status(204).send()
            return
        }

        logger.warn({ message: "Invalid subscription status", data: { status: body.subscription.status } });
        res.status(400).send({ message: "Invalid subscription status" })
    }

    /**
     * v2 route. The body arrives as a raw Buffer (see registerChannelRedemptionAddV2Route) and is verified against the
     * Twitch signature before a single byte of it is parsed, so a forged event can never reach a widget.
     */
    async handleSigned(req: FastifyRequest, res: FastifyReply) {
        const logger = this.logger.setContext("event.twitch.channelRedemptionAdd.handleSigned", req.id);

        const rawBody = req.body;
        if (!Buffer.isBuffer(rawBody)) {
            logger.warn({ message: "Signed route received a body that is not a raw buffer" });
            return res.status(400).send({ message: "Invalid body" });
        }

        const verification = verifyTwitchSignature({ headers: req.headers, rawBody, secret: this.eventSubSecret });
        if (!verification.valid) {
            logger.warn({ message: "Rejected webhook delivery with an invalid signature", data: { reason: verification.reason } });
            return res.status(403).send({ message: "Invalid signature" });
        }

        let envelope: EventSubEnvelope;
        try {
            envelope = JSON.parse(rawBody.toString("utf8")) as EventSubEnvelope;
        } catch (error) {
            logger.warn({ message: "Verified webhook delivery has an unparseable body", error: error as Error });
            return res.status(400).send({ message: "Invalid body" });
        }

        const messageType = req.headers["twitch-eventsub-message-type"] as EventSubMessageType | undefined;

        if (messageType === "webhook_callback_verification") {
            logger.info({ message: "Verifying webhook callback" });
            return res.status(200).header("Content-Type", "text/plain").send(envelope.challenge ?? "");
        }

        if (messageType === "revocation") {
            // Twitch has stopped sending events for this subscription; the health check recreates it if it is still wanted
            logger.warn({ message: "Subscription revoked by Twitch", data: { subscription: envelope.subscription } });
            return res.status(204).send();
        }

        if (messageType === "notification") {
            if (!envelope.event) {
                logger.warn({ message: "Notification has no event" });
                return res.status(400).send({ message: "Invalid body" });
            }
            logger.info({ message: "Handling channel redemption add event", data: envelope.event });
            // Reactive Reward only listens here, in the verified route, and sits outside the claim: the overlay queue
            // dedupes on the redemption id itself, so a second delivery of the same redemption plays nothing twice.
            const results = await Promise.allSettled([
                this.runClaimedWidgets(envelope.event, req.id),
                this.reactiveRewardService?.redeem(envelope.event, req.id),
            ]);
            for (const result of results) {
                if (result.status === "rejected") logger.error({ message: "Handle event failed", error: result.reason });
            }
            return res.status(204).send();
        }

        // Twitch asks receivers to acknowledge message types they do not know with a 2xx
        logger.warn({ message: "Ignoring unknown message type", data: { messageType } });
        return res.status(204).send();
    }

    /**
     * Widgets that fire on this event without a dedupe of their own. The v1 and v2 subscriptions overlap during the
     * migration, so both routes receive every redemption and only the first delivery to claim it runs them.
     */
    private async runClaimedWidgets(event: TwitchChannelRedemptionAddEventRequest, transactionId: string) {
        const logger = this.logger.setContext("event.twitch.channelRedemptionAdd.runClaimedWidgets", transactionId);
        if (this.redemptionClaimService && !(await this.redemptionClaimService.claim(event.id, transactionId))) {
            logger.info({ message: "Skipping duplicate delivery of redemption", data: { redemptionId: event.id } });
            return;
        }
        await Promise.allSettled([
            this.randomPoolService?.redeem(event, transactionId),
            this.randomDbdPerkService.randomPerk(event, transactionId),
            this.randomDBDKillerService.randomizeKiller(event, transactionId),
        ]);
    }
}
