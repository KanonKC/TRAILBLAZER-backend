import Configurations from "@/config/index";
import axios from "axios";
import { ImageMatureContentDetection } from "./response";
import TLogger, { Layer } from "@/logging/logger";

export default class Sightengine {
    private readonly cfg: Configurations;
    private readonly logger = new TLogger(Layer.PROVIDER);
    constructor(cfg: Configurations) {
        this.cfg = cfg;
    }

    async detectMatureContent(imageUrl: string, transactionId?: string): Promise<ImageMatureContentDetection> {
        const logger = this.logger.setContext("provider.sightengine.detectMatureContent", transactionId);
        try {
            const response = await axios.get<ImageMatureContentDetection>('https://api.sightengine.com/1.0/check.json', {
                params: {
                    url: imageUrl,
                    models: 'nudity-2.1,gore-2.0',
                    api_user: this.cfg.sightengine.apiUser,
                    api_secret: this.cfg.sightengine.apiSecret,
                }
            });
            logger.info({ message: "Image moderation request completed" });
            return response.data;
        } catch (error) {
            logger[axios.isAxiosError(error) && error.response?.status && error.response.status >= 400 && error.response.status < 500 ? "warn" : "error"]({ message: "Image moderation request failed", error: error as Error });
            throw error;
        }
    }
}
