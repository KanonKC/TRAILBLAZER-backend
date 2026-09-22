import { FastifyReply, FastifyRequest } from "fastify";
import { subscriber } from "@/libs/redis";
import FirstWordService from "@/services/widget/firstWord/firstWord.service";
import TLogger, { Layer } from "@/logging/logger";

export default class FirstWordEventController {
    private firstWordService: FirstWordService;
    private readonly logger: TLogger;

    constructor(firstWordService: FirstWordService) {
        this.firstWordService = firstWordService;
        this.logger = new TLogger(Layer.EVENT_CONTROLLER);
    }
    // Map of userId -> Set of connections
    private connections: Map<string, Set<FastifyReply>> = new Map();

    // TODO: Make rate limited
    async sse(req: FastifyRequest<{ Params: { userId: string }, Querystring: { key: string } }>, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.firstWordEvent.sse", req.id);
        const { userId } = req.params;
        const { key } = req.query;

        logger.info({ message: "SSE connection attempt", data: { userId } });

        const isValid = await this.firstWordService.validateOverlayAccess(userId, key);
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

        await sub.subscribe("first-word-audio", (message) => {
            const payload = JSON.parse(message);
            if (payload.userId === userId) {
                res.sse({
                    event: "audio",
                    data: JSON.stringify({ url: payload.audioUrl, volume: payload.volume ?? 100, jobId: payload.jobId, duration_ms: payload.duration_ms })
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
    }

    public disconnectUser(userId: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.firstWordEvent.disconnectUser");
        const userConns = this.connections.get(userId);
        if (userConns) {
            logger.info({ message: "Disconnecting clients", data: { userId, clientCount: userConns.size } });
            for (const res of userConns) {
                res.raw.end();
            }
            this.connections.delete(userId);
        }
    }
}
