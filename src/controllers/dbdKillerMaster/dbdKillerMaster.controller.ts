import { FastifyReply, FastifyRequest } from "fastify";
import DBDKillerMasterRepository from "@/repositories/dbdKillerMaster/dbdKillerMaster.repository";
import TLogger, { Layer } from "@/logging/logger";

export default class DBDKillerMasterController {
    private readonly repository: DBDKillerMasterRepository;
    private readonly logger: TLogger;

    constructor(repository: DBDKillerMasterRepository) {
        this.repository = repository;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async list(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.dbdKillerMaster.list", req.id);
        try {
            const data = await this.repository.list(req.id);
            res.send({ data });
        } catch (error) {
            logger.error({ message: "Failed to list DBD killer masters", error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
