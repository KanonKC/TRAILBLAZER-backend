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
        this.logger.setContext("controller.dbdKillerMaster.list");
        try {
            const data = await this.repository.list();
            res.send({ data });
        } catch (error) {
            this.logger.error({ message: "Failed to list DBD killer masters", error: error as Error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
