import { createClient, SetOptions } from "redis";

// const TTL: { [time: string]: SetOptions } = {
//     TWO_HOURS: { expiration: { type: "EX", value: 60 * 60 * 2 } },
//     ONE_WEEK: { expiration: { type: "EX", value: 60 * 60 * 24 * 7 } },
//     ONE_DAY: { expiration: { type: "EX", value: 60 * 60 * 24 } },
//     QUARTER_HOUR: { expiration: { type: "EX", value: 60 * 15 } }
// }

export const TTL = {
    TEN_SECONDS: { expiration: { type: "EX", value: 10 } },
    ONE_MINUTE: { expiration: { type: "EX", value: 60 } },
    FIVE_MINUTES: { expiration: { type: "EX", value: 60 * 5 } },
    TWO_HOURS: { expiration: { type: "EX", value: 60 * 60 * 2 } },
    ONE_HOUR: { expiration: { type: "EX", value: 60 * 60 } },
    ONE_WEEK: { expiration: { type: "EX", value: 60 * 60 * 24 * 7 } },
    ONE_DAY: { expiration: { type: "EX", value: 60 * 60 * 24 } },
    QUARTER_HOUR: { expiration: { type: "EX", value: 60 * 15 } }
} as const

const redis = createClient({
    url: process.env.REDIS_URL,
    socket: {
        // ts-node compiles the whole module graph synchronously on boot, which blocks the
        // event loop for ~15s on a cold run. The default 5s connect timeout expires while
        // it is blocked, so a perfectly healthy connection is reported as a timeout.
        connectTimeout: 30_000,
        reconnectStrategy: (retries) => Math.min(retries * 200, 5_000)
    }
})

const publisher = redis.duplicate()
const subscriber = redis.duplicate()

const clients = [redis, publisher, subscriber]

// node-redis rethrows "error" events when nothing is listening, which kills the process.
for (const client of clients) {
    client.on("error", (err) => console.error("[redis] client error:", err))
}

let connecting: Promise<unknown> | null = null

export function connectRedis() {
    if (!connecting) {
        connecting = Promise.all(clients.map((client) => client.isOpen ? Promise.resolve() : client.connect()))
    }
    return connecting
}

// Defer connecting until the synchronous import of the app has finished, so the connect
// timeout is not being counted down while the event loop is blocked by ts-node.
setImmediate(() => {
    connectRedis().catch((err) => console.error("[redis] failed to connect:", err))
})

export { publisher, subscriber }
export default redis
