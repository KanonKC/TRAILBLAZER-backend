import { EventEmitter } from "events";

// In-memory stand-in for the Redis client. It exposes only the subset of the node-redis
// API this codebase uses, so call sites stay untouched. State lives in the memory of a
// single process: it is lost on restart and is not shared between instances.

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

type SetOptions = { expiration?: { type: string, value: number } }

type StoredEntry = { value: string, expiresAtMs: number | null }

const entries = new Map<string, StoredEntry>()
const channelBus = new EventEmitter().setMaxListeners(0)

function readLiveEntry(key: string): StoredEntry | undefined {
    const entry = entries.get(key)
    if (entry && entry.expiresAtMs !== null && entry.expiresAtMs <= Date.now()) {
        entries.delete(key)
        return undefined
    }
    return entry
}

function convertGlobToRegExp(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")
    return new RegExp(`^${escaped}$`)
}

// Evict expired entries so keys that are never read again do not accumulate.
setInterval(() => {
    for (const key of Array.from(entries.keys())) readLiveEntry(key)
}, 60_000).unref()

class InMemorySubscriber {
    private listenersByChannel = new Map<string, (message: string) => void>()

    async subscribe(channel: string, listener: (message: string) => void) {
        this.listenersByChannel.set(channel, listener)
        channelBus.on(channel, listener)
    }

    on(_event: string, _listener: (...args: any[]) => void) {
        return this
    }

    async connect() {}

    async quit() {
        for (const [channel, listener] of this.listenersByChannel) channelBus.off(channel, listener)
        this.listenersByChannel.clear()
    }

    duplicate() {
        return new InMemorySubscriber()
    }
}

const redis = {
    async get(key: string): Promise<string | null> {
        return readLiveEntry(key)?.value ?? null
    },
    async set(key: string, value: string | number, options?: SetOptions): Promise<"OK"> {
        const expirySeconds = options?.expiration?.value
        entries.set(key, { value: String(value), expiresAtMs: expirySeconds ? Date.now() + expirySeconds * 1000 : null })
        return "OK"
    },
    async del(keys: string | string[]): Promise<number> {
        const keyList = Array.isArray(keys) ? keys : [keys]
        return keyList.filter((key) => entries.delete(key)).length
    },
    async keys(pattern: string): Promise<string[]> {
        const matcher = convertGlobToRegExp(pattern)
        return Array.from(entries.keys()).filter((key) => matcher.test(key) && readLiveEntry(key))
    },
    async ping(): Promise<string> {
        return "PONG"
    },
    duplicate() {
        return redis
    }
}

const publisher = {
    async publish(channel: string, message: string): Promise<number> {
        return channelBus.emit(channel, message) ? channelBus.listenerCount(channel) : 0
    }
}

const subscriber = new InMemorySubscriber()

export function connectRedis() {
    return Promise.resolve()
}

export { publisher, subscriber }
export default redis
