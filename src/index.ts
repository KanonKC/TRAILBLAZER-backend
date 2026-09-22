import "dotenv/config";
import server, { overlayQueueService } from "@/routes";
import { connectRedis } from "@/libs/redis";
import TLogger, { Layer } from "@/logging/logger";

const logger = new TLogger(Layer.OTHER, "index.main");

async function main() {
  await connectRedis();

  server.listen({ port: 8080, host: "0.0.0.0" }, (err, address) => {
    if (err) {
      logger.error({ message: "Server failed to start", error: err });
      process.exit(1);
    }
    logger.info({ message: `Server listening at ${address}` });
  });
}

// Queue state lives in Redis, so a restart keeps the queue; this only stops
// this instance's local timers so it does not act on a queue it is leaving.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    logger.info({ message: `Received ${signal}, shutting down` });
    overlayQueueService.stop();
    server.close().finally(() => process.exit(0));
  });
}

main().catch((err) => {
  logger.error({ message: "Fatal error during startup", error: err });
  process.exit(1);
});
