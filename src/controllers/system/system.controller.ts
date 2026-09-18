import { FastifyReply, FastifyRequest } from "fastify";
import SystemService from "@/services/system/system.service";
import TLogger, { Layer } from "@/logging/logger";

export default class SystemController {
    private readonly systemService: SystemService;
    private readonly logger: TLogger;

    constructor(systemService: SystemService) {
        this.systemService = systemService;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async health(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.system.health", req.id);
        logger.info({ message: "Health check initiated" });
        const health = await this.systemService.getHealth(req.id);

        const isHealthy = health.database && Object.values(health.libs).every(x => x);

        if (!isHealthy) {
            logger.error({ message: "Health check failed", data: { health } });
            return res.status(503).send(health);
        }

        logger.info({ message: "Health check passed", data: { health } });
        res.send(health);
    }
}
