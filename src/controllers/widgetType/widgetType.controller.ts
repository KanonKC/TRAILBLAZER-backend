import { FastifyReply, FastifyRequest } from "fastify";
import WidgetTypeRepository from "@/repositories/widgetType/widgetType.repository";
import TLogger, { Layer } from "@/logging/logger";

export default class WidgetTypeController {
    private readonly repository: WidgetTypeRepository;
    private readonly logger: TLogger;

    constructor(repository: WidgetTypeRepository) {
        this.repository = repository;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async list(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.widgetType.list");
        try {
            const data = await this.repository.list();
            res.send({ data });
        } catch (error) {
            this.logger.error({ message: "Failed to list widget types", error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
