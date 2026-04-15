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
    url: process.env.REDIS_URL
})

const publisher = redis.duplicate()
const subscriber = redis.duplicate()

Promise.all([
    redis.connect(),
    publisher.connect(),
    subscriber.connect()
])

export { publisher, subscriber }
export default redis
