import redis from "@/libs/redis";
import TLogger, { Layer } from "@/logging/logger";

const CLAIM_KEY_PREFIX = "eventsub:redemption:";
const CLAIM_TTL_SECONDS = 24 * 60 * 60;

type RedisSetClient = Pick<typeof redis, "set">;

/**
 * While the v1 and v2 redemption subscriptions overlap, Twitch delivers every redemption to both routes.
 * Widgets that have no dedupe of their own (Random DBD Perk, Random DBD Killer) would fire twice, so each delivery
 * first tries to claim the redemption id and only the winner runs them.
 */
export default class RedemptionClaimService {
    private readonly logger: TLogger;

    constructor(private readonly redisClient: RedisSetClient = redis) {
        this.logger = new TLogger(Layer.SERVICE);
    }

    /**
     * Returns true when this delivery owns the redemption and should process it.
     * Fails open: if Redis is unreachable we would rather risk a double fire than drop a viewer's redemption.
     */
    async claim(redemptionId: string, transactionId?: string): Promise<boolean> {
        const logger = this.logger.setContext("service.redemptionClaim.claim", transactionId);
        try {
            const reply = await this.redisClient.set(`${CLAIM_KEY_PREFIX}${redemptionId}`, "1", {
                condition: "NX",
                expiration: { type: "EX", value: CLAIM_TTL_SECONDS },
            });
            const claimed = reply === "OK";
            logger.info({ message: claimed ? "Claimed redemption" : "Redemption already claimed by another delivery", data: { redemptionId } });
            return claimed;
        } catch (error) {
            logger.warn({ message: "Redemption claim failed, processing anyway", data: { redemptionId }, error: error as Error });
            return true;
        }
    }
}
