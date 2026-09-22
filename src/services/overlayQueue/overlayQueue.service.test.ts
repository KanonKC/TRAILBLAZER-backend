import OverlayQueueService from "./overlayQueue.service";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { GAP_MS } from "./constants";
import { publisher } from "@/libs/redis";
import { twitchAppAPI } from "@/libs/twurple";
import { ENQUEUE_SCRIPT, FINISH_SCRIPT, TRY_DISPATCH_SCRIPT, runScript } from "./overlayQueue.scripts";

jest.mock("@/libs/redis", () => ({
    __esModule: true,
    default: {
        pExpire: jest.fn().mockResolvedValue(1),
        set: jest.fn().mockResolvedValue("OK"),
        get: jest.fn().mockResolvedValue(null),
        del: jest.fn().mockResolvedValue(1),
        zRangeByScore: jest.fn().mockResolvedValue([]),
    },
    publisher: { publish: jest.fn().mockResolvedValue(1) },
    TTL: {},
}));

jest.mock("@/libs/twurple", () => ({
    twitchAppAPI: { chat: { sendChatMessageAsApp: jest.fn().mockResolvedValue(undefined) } },
}));

jest.mock("./overlayQueue.scripts", () => {
    const actual = jest.requireActual("./overlayQueue.scripts");
    return { ...actual, runScript: jest.fn() };
});

/**
 * Stands in for Redis with the same contract the Lua scripts provide: one
 * owner at a time per queue, FIFO, expired jobs skipped, capped length. The
 * atomicity those scripts buy is a property of Redis itself and is covered by
 * the multi-instance integration check, not here — what these tests pin down is
 * the service's ordering, pacing and effect timing.
 */
class FakeRedisQueue {
    lists = new Map<string, string[]>()
    jobs = new Map<string, { json: string; expiresAt: number }>()
    busy = new Map<string, string>()
    /** When each queue is next allowed to dispatch — this is what enforces the gap. */
    due = new Map<string, number>()
    maxItems = 100

    run = (script: string, keys: string[], args: string[]): unknown => {
        if (script === ENQUEUE_SCRIPT) return this.enqueue(keys, args)
        if (script === TRY_DISPATCH_SCRIPT) return this.tryDispatch(keys, args)
        if (script === FINISH_SCRIPT) return this.finish(keys, args)
        throw new Error("unknown script")
    }

    private enqueue(keys: string[], args: string[]) {
        const [listKey, jobKey, dedupeKey] = keys
        const [jobId, jobJson, ttlMs, maxItems, dedupeTtlMs] = args

        if (Number(dedupeTtlMs) > 0 && this.jobs.has(`dedupe:${dedupeKey}`)) {
            return [0, "duplicate"]
        }
        if (Number(dedupeTtlMs) > 0) {
            this.jobs.set(`dedupe:${dedupeKey}`, { json: "1", expiresAt: Date.now() + Number(dedupeTtlMs) })
        }

        const list = this.lists.get(listKey) ?? []
        if (list.length >= Math.min(Number(maxItems), this.maxItems)) return [0, "queue_full"]

        this.jobs.set(jobKey, { json: jobJson, expiresAt: Date.now() + Number(ttlMs) })
        if (args[7] === "front") list.unshift(jobId)
        else list.push(jobId)
        this.lists.set(listKey, list)
        if (!this.due.has(listKey)) this.due.set(listKey, Date.now())
        return [1, jobId]
    }

    private tryDispatch(keys: string[], args: string[]) {
        const [busyKey, listKey] = keys
        const [token, , jobPrefix] = args

        // Checked before the lock, exactly as the Lua script does: a caller that
        // decided to dispatch before the previous item finished must still wait.
        const due = this.due.get(listKey)
        if (due !== undefined && due > Date.now()) return false

        if (this.busy.has(busyKey)) return false
        this.busy.set(busyKey, token)

        const list = this.lists.get(listKey) ?? []
        while (list.length > 0) {
            const id = list.shift() as string
            const jobKey = `${jobPrefix}${id}`
            const job = this.jobs.get(jobKey)
            if (job && job.expiresAt > Date.now()) {
                this.jobs.delete(jobKey)
                return job.json
            }
        }
        this.busy.delete(busyKey)
        return false
    }

    private finish(keys: string[], args: string[]) {
        const [busyKey] = keys
        if (this.busy.get(busyKey) === args[0]) this.busy.delete(busyKey)
        const listKey = busyKey.replace(":busy:", ":q:")
        this.due.set(listKey, Number(args[1]))
        return 1
    }
}

describe("OverlayQueueService", () => {
    let queue: OverlayQueueService
    let fake: FakeRedisQueue
    const DURATION = 5_000

    const enqueueGreeting = (name: string, overrides: Record<string, unknown> = {}) =>
        queue.enqueue({
            userId: "user_1",
            widgetSlug: WidgetTypeSlug.FIRST_WORD,
            payload: { name },
            effects: [{ type: "chat", senderId: "bot", broadcasterId: "channel", message: name }],
            durationMs: DURATION,
            ...overrides,
        })

    beforeEach(() => {
        jest.useFakeTimers()
        jest.clearAllMocks()
        fake = new FakeRedisQueue()
        ;(runScript as jest.Mock).mockImplementation(async (script, keys, args) =>
            fake.run(script, keys, args)
        )

        queue = new OverlayQueueService()
        queue.register<{ name: string }>(WidgetTypeSlug.FIRST_WORD, {
            channel: "first-word-audio",
            event: "audio",
            resolve: async (job) => ({ name: job.payload.name }),
            estimateDurationMs: () => DURATION,
        })
    })

    afterEach(() => {
        queue.stop()
        jest.useRealTimers()
    })

    /** Lets the setImmediate/await chain inside enqueue and dispatch settle. */
    const flush = async () => {
        for (let i = 0; i < 10; i++) {
            jest.advanceTimersByTime(0)
            await Promise.resolve()
        }
    }

    const advance = async (ms: number) => {
        jest.advanceTimersByTime(ms)
        await flush()
    }

    /**
     * Runs the current item to its end and lets the gap elapse. The two steps
     * are separate because the gap timer is only scheduled once the finish
     * promise settles, which happens after the duration has been advanced.
     */
    const playOutItem = async () => {
        await advance(DURATION)
        await advance(GAP_MS)
    }

    const publishedNames = () =>
        (publisher.publish as jest.Mock).mock.calls.map((call) => JSON.parse(call[1]).name)

    it("plays the first item immediately", async () => {
        await enqueueGreeting("first")
        await flush()

        expect(publishedNames()).toEqual(["first"])
    })

    it("makes a second event wait instead of cutting the first one off", async () => {
        await enqueueGreeting("first")
        await flush()
        await enqueueGreeting("second")
        await flush()

        expect(publishedNames()).toEqual(["first"])

        // Still mid-item: the newcomer must not have taken over.
        jest.advanceTimersByTime(DURATION - 1)
        await flush()
        expect(publishedNames()).toEqual(["first"])
    })

    it("leaves the configured gap between items", async () => {
        await enqueueGreeting("first")
        await flush()
        await enqueueGreeting("second")
        await flush()

        jest.advanceTimersByTime(DURATION)
        await flush()
        expect(publishedNames()).toEqual(["first"])

        jest.advanceTimersByTime(GAP_MS)
        await flush()
        expect(publishedNames()).toEqual(["first", "second"])
    })

    it("keeps queued items in arrival order", async () => {
        await enqueueGreeting("first")
        await flush()
        await enqueueGreeting("second")
        await enqueueGreeting("third")
        await flush()

        for (let i = 0; i < 3; i++) {
            await playOutItem()
        }

        expect(publishedNames()).toEqual(["first", "second", "third"])
    })

    it("sends the chat message with the overlay event, not when the event arrived", async () => {
        await enqueueGreeting("first")
        await flush()
        await enqueueGreeting("second")
        await flush()

        expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledTimes(1)
        expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith("bot", "channel", "first", {})

        await playOutItem()

        expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledTimes(2)
        expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenLastCalledWith("bot", "channel", "second", {})
    })

    it("holds a deliberately delayed effect back by its own offset", async () => {
        await queue.enqueue({
            userId: "user_1",
            widgetSlug: WidgetTypeSlug.FIRST_WORD,
            payload: { name: "spoiler" },
            effects: [
                { type: "chat", senderId: "bot", broadcasterId: "channel", message: "result", delayMs: 3_000 },
            ],
            durationMs: DURATION,
        })
        await flush()

        expect(publishedNames()).toEqual(["spoiler"])
        expect(twitchAppAPI.chat.sendChatMessageAsApp).not.toHaveBeenCalled()

        jest.advanceTimersByTime(3_000)
        await flush()
        expect(twitchAppAPI.chat.sendChatMessageAsApp).toHaveBeenCalledWith("bot", "channel", "result", {})
    })

    it("refuses to grow past the queue cap", async () => {
        fake.maxItems = 2
        await enqueueGreeting("first")
        await flush()
        await enqueueGreeting("second")
        await enqueueGreeting("third")
        const overflow = await enqueueGreeting("fourth")

        expect(overflow).toEqual({ enqueued: false, reason: "queue_full" })
    })

    it("rejects a duplicate within the dedupe window", async () => {
        await enqueueGreeting("first", { dedupeKey: "chatter_1", dedupeTtlMs: 10_000 })
        await flush()
        const second = await enqueueGreeting("first", { dedupeKey: "chatter_1", dedupeTtlMs: 10_000 })

        expect(second).toEqual({ enqueued: false, reason: "duplicate" })
    })

    it("skips items that expired while they waited", async () => {
        await enqueueGreeting("first")
        await flush()
        await enqueueGreeting("stale")
        await flush()

        // The queued item ages out before its turn comes around.
        for (const job of fake.jobs.values()) job.expiresAt = Date.now() - 1

        await enqueueGreeting("fresh")
        await playOutItem()

        expect(publishedNames()).toEqual(["first", "fresh"])
    })

    it("moves on without playing anything when the handler drops the job", async () => {
        queue.register<{ name: string }>(WidgetTypeSlug.FIRST_WORD, {
            channel: "first-word-audio",
            event: "audio",
            // Widget disabled / asset deleted between enqueue and dispatch.
            resolve: async (job) => (job.payload.name === "gone" ? null : { name: job.payload.name }),
            estimateDurationMs: () => DURATION,
        })

        await enqueueGreeting("gone")
        await flush()
        await enqueueGreeting("kept")
        await flush()

        expect(publishedNames()).toEqual(["kept"])
    })

    it("still waits out the gap when a sweeper pumps the moment the lock frees", async () => {
        await enqueueGreeting("first")
        await flush()
        await enqueueGreeting("second")
        await flush()

        // A sweeper decides to pump from a stale view of the queue and arrives
        // just as the first item releases the lock.
        await advance(DURATION)
        await (queue as unknown as { pump: (member: string) => Promise<void> })
            .pump(`{user_1:${WidgetTypeSlug.FIRST_WORD}}`)
        await flush()

        expect(publishedNames()).toEqual(["first"])

        await advance(GAP_MS)
        expect(publishedNames()).toEqual(["first", "second"])
    })

    it("ignores an ack for an item that already finished", async () => {
        const redis = jest.requireMock("@/libs/redis").default

        await enqueueGreeting("first")
        await flush()
        await enqueueGreeting("second")
        await flush()

        // A late ack arrives naming the item that has already been replaced.
        redis.get.mockResolvedValueOnce("some-other-job-id")
        await queue.ack("user_1", WidgetTypeSlug.FIRST_WORD, "stale-job-id")
        await flush()

        // The queue kept playing the current item rather than skipping ahead.
        expect(publishedNames()).toEqual(["first"])
    })

    it("only one caller can be playing a queue at a time", async () => {
        await enqueueGreeting("first")
        await flush()

        // A sweeper tick from another instance while an item is in flight.
        await enqueueGreeting("second")
        await flush()

        expect(publishedNames()).toEqual(["first"])
    })
})
