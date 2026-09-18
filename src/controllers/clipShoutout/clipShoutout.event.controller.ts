import { FastifyReply, FastifyRequest } from "fastify";
import { subscriber } from "@/libs/redis";
import ClipShoutoutService from "@/services/widget/clipShoutout/clipShoutout.service";
import TLogger, { Layer } from "@/logging/logger";
import { TError } from "@/errors";

export default class ClipShoutoutEventController {
    private clipShoutoutService: ClipShoutoutService;
    private readonly logger: TLogger;

    constructor(clipShoutoutService: ClipShoutoutService) {
        this.clipShoutoutService = clipShoutoutService;
        this.logger = new TLogger(Layer.EVENT_CONTROLLER);
    }
    // Map of userId -> Set of connections
    private connections: Map<string, Set<FastifyReply>> = new Map();

    // TODO: Make rate limited
    async sse(req: FastifyRequest<{ Params: { userId: string }, Querystring: { key: string } }>, res: FastifyReply) {
        let logger: TLogger = this.logger;
        const { userId } = req.params;
        const { key } = req.query;

        logger = this.logger.setContext("controller.clipShoutoutEvent.sse", req.id);
        logger.info({ message: "SSE connection attempt", data: { userId } });

        try {
            const isValid = await this.clipShoutoutService.validateOverlayAccess(userId, key, req.id);
            if (!isValid) {
                logger.warn({ message: "Invalid key for SSE connection", data: { userId } });
                return res.status(401).send({ message: "Invalid overlay key" });
            }

            res.sse({
                event: "connected",
                data: "connected"
            });

            // Track connection
            if (!this.connections.has(userId)) {
                this.connections.set(userId, new Set());
            }
            this.connections.get(userId)!.add(res);

            const sub = subscriber.duplicate();
            await sub.connect();

            await sub.subscribe("clip-shoutout-clip", (message) => {
                const payload = JSON.parse(message);
                if (payload.userId === userId) {
                    res.sse({
                        event: "clip",
                        data: JSON.stringify({ url: payload.url, duration: payload.duration })
                    });
                }
            });

            req.raw.on("close", () => {
                sub.quit();
                const userConns = this.connections.get(userId);
                if (userConns) {
                    userConns.delete(res);
                    if (userConns.size === 0) {
                        this.connections.delete(userId);
                    }
                }
            });
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, error });
                return res.status(error.status).send({ message: error.message });
            }
            logger.error({ message: "SSE connection failed", error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }

    public disconnectUser(userId: string) {
        let logger: TLogger = this.logger;
        const userConns = this.connections.get(userId);
        if (userConns) {
            logger = this.logger.setContext("controller.clipShoutoutEvent.disconnectUser");
            logger.info({ message: "Disconnecting clients", data: { userId, clientCount: userConns.size } });
            for (const res of userConns) {
                res.raw.end();
            }
            this.connections.delete(userId);
        }
    }
}
