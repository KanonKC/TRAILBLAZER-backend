import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { TError } from "@/errors";
import TLogger, { Layer } from "@/logging/logger";
import OverlayQueueService from "@/services/overlayQueue/overlayQueue.service";
import WidgetService from "@/services/widget/widget.service";
import { WidgetTypeSlug } from "@/services/widget/constant";

const paramsSchema = z.object({
    userId: z.string(),
    slug: z.nativeEnum(WidgetTypeSlug),
});

const bodySchema = z.object({
    jobId: z.string(),
});

/**
 * Lets an overlay report that the item it was showing has genuinely finished —
 * the audio ended, the spinner landed, the credits scrolled off. Without it the
 * queue would always wait out a conservative estimate before the next viewer.
 */
export default class OverlayQueueController {
    private readonly overlayQueue: OverlayQueueService;
    private readonly widgetService: WidgetService;
    private readonly logger: TLogger;

    constructor(overlayQueue: OverlayQueueService, widgetService: WidgetService) {
        this.overlayQueue = overlayQueue;
        this.widgetService = widgetService;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async ack(
        req: FastifyRequest<{
            Params: { userId: string; slug: string };
            Querystring: { key?: string };
        }>,
        res: FastifyReply
    ) {
        const logger = this.logger.setContext("controller.overlayQueue.ack", req.id);
        try {
            const { userId, slug } = paramsSchema.parse(req.params);
            const { jobId } = bodySchema.parse(req.body);
            const key = req.query.key;

            if (!key || !(await this.widgetService.validateOverlayAccess(userId, key))) {
                logger.warn({ message: "Invalid overlay key on ack", data: { userId, slug } });
                return res.status(401).send({ message: "Invalid overlay key" });
            }

            await this.overlayQueue.ack(userId, slug, jobId);
            logger.info({ message: "Overlay job acked", data: { userId, slug, jobId } });
            return res.status(204).send();
        } catch (error) {
            logger.error({ message: "Failed to ack overlay job", error: error as Error });

            if (error instanceof z.ZodError) {
                return res.status(400).send({ message: "Validation Error", errors: error.issues });
            }
            if (error instanceof TError) {
                return res.status(error.status).send({ message: error.message });
            }
            return res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
