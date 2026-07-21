import Configurations from "@/config/index";
import axios from "axios";
import TLogger, { Layer } from "@/logging/logger";

export default class DiscordProvider {
    private readonly cfg: Configurations;
    private readonly logger: TLogger;

    constructor(cfg: Configurations) {
        this.cfg = cfg;
        this.logger = new TLogger(Layer.OTHER);
    }

    async sendStatMessage(content: string): Promise<void> {
        this.logger.setContext("provider.discord.sendStatMessage");
        if (!this.cfg.discord.statWebhookUrl) {
            return;
        }
        try {
            await axios.post(this.cfg.discord.statWebhookUrl, { content });
        } catch (err) {
            this.logger.error({ message: "Failed to send Discord stat webhook message", error: err as Error });
        }
    }
}
