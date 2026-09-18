import { FastifyReply, FastifyRequest } from "fastify";
import TwitchGql from "@/providers/twitchGql";
import { ExportVideoToYoutubeRequest } from "@/providers/twitchGql/request";
import TLogger, { Layer } from "@/logging/logger";
import { TError } from "@/errors";

export default class TwitchGqlController {
    private readonly twitchGql: TwitchGql;
    private readonly logger: TLogger;

    constructor(twitchGql: TwitchGql) {
        this.twitchGql = twitchGql;
        this.logger = new TLogger(Layer.CONTROLLER);
    }

    async exportVideoToYoutube(req: FastifyRequest<{ Body: ExportVideoToYoutubeRequest[] }>, res: FastifyReply) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("controller.twitchGql.exportVideoToYoutube", req.id);
        
        try {
            // const result = await this.twitchGql.exportVideosToYoutube(req.body);
            return res.status(204).send();
        } catch (error) {
            if (error instanceof TError) {
                logger.error({ message: error.message, error });
                return res.status(error.status).send(error.toJSON());
            }
            logger.error({ message: "Failed to export video", error: error as Error });
            return res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
