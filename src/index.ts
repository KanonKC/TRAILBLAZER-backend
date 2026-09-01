import "dotenv/config";
import server from "@/routes";
import { connectRedis } from "@/libs/redis";

async function main() {
  await connectRedis();

  server.listen({ port: 8080, host: "0.0.0.0" }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Server listening at ${address}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
