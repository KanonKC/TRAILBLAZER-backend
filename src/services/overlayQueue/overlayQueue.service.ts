import { randomUUID } from "crypto"
import redis, { publisher } from "@/libs/redis"
import { twitchAppAPI } from "@/libs/twurple"
import TLogger, { Layer } from "@/logging/logger"
import AuthService from "@/services/auth/auth.service"
import WidgetService from "@/services/widget/widget.service"
import { WidgetTypeSlug } from "@/services/widget/constant"
import {
    BOOTSTRAP_LOCK_MS,
    GAP_MS,
    JOB_TTL_MS,
    LOCK_SLACK_MS,
    MAX_EXPIRED_SKIP,
    MAX_QUEUE_ITEMS,
    SWEEP_INTERVAL_MS,
} from "./constants"
import { ENQUEUE_SCRIPT, FINISH_SCRIPT, TRY_DISPATCH_SCRIPT, runScript } from "./overlayQueue.scripts"
import {
    EnqueueInput,
    EnqueueResult,
    OverlayEffect,
    OverlayJob,
    WidgetHandler,
} from "./overlayQueue.types"

const KEY_PREFIX = "oq"
const DUE_KEY = `${KEY_PREFIX}:due`

/**
 * Paces overlay events so one viewer's moment finishes before the next begins.
 *
 * Everything an event produces — the overlay push, the chat message, a Twitch
 * shoutout, the trigger counter — travels together in one job and fires
 * together at dispatch. Widget services enqueue; they never publish directly.
 *
 * Two things drive the queue:
 *  - a local timer, set when this instance dispatches (the fast path), and
 *  - a sweeper that every instance runs, so a queue whose owner died or was
 *    redeployed still drains (the correctness path).
 */
export default class OverlayQueueService {
    private readonly logger: TLogger
    private readonly instanceId = randomUUID()
    private readonly handlers = new Map<WidgetTypeSlug, WidgetHandler<never>>()
    private readonly timers = new Map<string, NodeJS.Timeout>()
    private sweeper: NodeJS.Timeout | null = null

    private widgetService?: WidgetService
    private authService?: AuthService

    constructor() {
        this.logger = new TLogger(Layer.SERVICE)
    }

    /** Wired from routes.ts after construction to keep the graph acyclic. */
    public setWidgetService(widgetService: WidgetService) {
        this.widgetService = widgetService
    }

    /** Only needed by effects that act as the streamer (shoutout). */
    public setAuthService(authService: AuthService) {
        this.authService = authService
    }

    public register<P>(slug: WidgetTypeSlug, handler: WidgetHandler<P>) {
        this.handlers.set(slug, handler as unknown as WidgetHandler<never>)
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    public start() {
        const logger = this.logger.setContext("service.overlayQueue.start")
        if (this.sweeper) return
        this.sweeper = setInterval(() => {
            this.sweep().catch((error) =>
                logger.error({ message: "Overlay queue sweep failed", error: error as Error })
            )
        }, SWEEP_INTERVAL_MS)
        logger.info({ message: "Overlay queue started", data: { instanceId: this.instanceId } })
    }

    public stop() {
        if (this.sweeper) {
            clearInterval(this.sweeper)
            this.sweeper = null
        }
        for (const timer of this.timers.values()) clearTimeout(timer)
        this.timers.clear()
    }

    // -----------------------------------------------------------------------
    // Enqueue
    // -----------------------------------------------------------------------

    /**
     * Never throws: callers are Twitch webhook handlers that must not fail a
     * delivery because a queue was full.
     */
    public async enqueue<P>(input: EnqueueInput<P>): Promise<EnqueueResult> {
        const logger = this.logger.setContext("service.overlayQueue.enqueue", input.transactionId)
        const now = Date.now()
        const job: OverlayJob<P> = {
            id: randomUUID(),
            userId: input.userId,
            widgetSlug: input.widgetSlug,
            widgetId: input.widgetId,
            enqueuedAt: now,
            expiresAt: now + JOB_TTL_MS,
            transactionId: input.transactionId,
            payload: input.payload,
            effects: input.effects ?? [],
            durationMs: input.durationMs,
            awaitsAck: input.awaitsAck,
        }

        const member = this.member(input.userId, input.widgetSlug)
        try {
            const result = (await runScript(
                ENQUEUE_SCRIPT,
                [
                    this.listKey(member),
                    this.jobKey(member, job.id),
                    this.dedupeKey(member, input.dedupeKey ?? "none"),
                    DUE_KEY,
                ],
                [
                    job.id,
                    JSON.stringify(job),
                    String(JOB_TTL_MS),
                    String(MAX_QUEUE_ITEMS),
                    String(input.dedupeKey ? input.dedupeTtlMs ?? 10_000 : 0),
                    String(now),
                    member,
                    input.priority === "front" ? "front" : "back",
                ]
            )) as [number, string]

            if (result[0] !== 1) {
                logger.warn({
                    message: "Overlay job not enqueued",
                    data: { member, reason: result[1] },
                })
                return { enqueued: false, reason: result[1] as "duplicate" | "queue_full" }
            }
        } catch (error) {
            logger.error({ message: "Failed to enqueue overlay job", data: { member }, error: error as Error })
            return { enqueued: false, reason: "queue_full" }
        }

        logger.info({ message: "Overlay job enqueued", data: { member, jobId: job.id } })
        // Start an idle queue immediately instead of waiting for the sweeper.
        setImmediate(() => this.pump(member))
        return { enqueued: true, jobId: job.id }
    }

    // -----------------------------------------------------------------------
    // Dispatch
    // -----------------------------------------------------------------------

    private async sweep() {
        const members = await redis.zRangeByScore(DUE_KEY, "-inf", Date.now(), {
            LIMIT: { offset: 0, count: 200 },
        })
        for (const member of members) {
            await this.pump(member)
        }
    }

    /**
     * Attempts to take ownership of a queue and dispatch its head. A no-op when
     * another instance (or this one) is already playing an item.
     */
    private async pump(member: string) {
        const logger = this.logger.setContext("service.overlayQueue.pump")
        const token = `${this.instanceId}:${randomUUID()}`

        let raw: unknown
        try {
            raw = await runScript(
                TRY_DISPATCH_SCRIPT,
                [this.busyKey(member), this.listKey(member), DUE_KEY],
                [
                    token,
                    String(BOOTSTRAP_LOCK_MS),
                    `${KEY_PREFIX}:job:${member}:`,
                    member,
                    String(MAX_EXPIRED_SKIP),
                    String(Date.now()),
                ]
            )
        } catch (error) {
            logger.error({ message: "Failed to dispatch overlay job", data: { member }, error: error as Error })
            return
        }

        if (typeof raw !== "string") return

        let job: OverlayJob
        try {
            job = JSON.parse(raw) as OverlayJob
        } catch (error) {
            logger.error({ message: "Unparsable overlay job", data: { member }, error: error as Error })
            await this.finish(member, token, 0)
            return
        }

        await this.dispatch(member, token, job)
    }

    private async dispatch(member: string, token: string, job: OverlayJob) {
        const logger = this.logger.setContext("service.overlayQueue.dispatch", job.transactionId)
        const handler = this.handlers.get(job.widgetSlug)

        if (!handler) {
            logger.error({ message: "No handler registered for widget", data: { slug: job.widgetSlug } })
            await this.finish(member, token, 0)
            return
        }

        let payload: Record<string, unknown> | null
        try {
            payload = await (handler as WidgetHandler<unknown>).resolve(job)
        } catch (error) {
            logger.error({ message: "Failed to resolve overlay job", data: { jobId: job.id }, error: error as Error })
            payload = null
        }

        if (!payload) {
            // Widget disabled, asset gone, config deleted — move on without
            // spending the gap on something nobody will see.
            logger.info({ message: "Overlay job dropped at dispatch", data: { jobId: job.id, slug: job.widgetSlug } })
            await this.finish(member, token, 0)
            return
        }

        const durationMs = job.durationMs ?? (handler as WidgetHandler<unknown>).estimateDurationMs(job)
        const holdMs = durationMs + GAP_MS + LOCK_SLACK_MS
        await redis.pExpire(this.busyKey(member), holdMs).catch(() => undefined)
        // Recorded so a late ack for an item that already ended cannot cut the
        // next one short.
        await redis.set(this.currentKey(member), job.id, { PX: holdMs }).catch(() => undefined)

        try {
            await publisher.publish(
                handler.channel,
                JSON.stringify({ ...payload, userId: job.userId, jobId: job.id, duration_ms: durationMs })
            )
        } catch (error) {
            logger.error({ message: "Failed to publish overlay event", data: { jobId: job.id }, error: error as Error })
        }

        // Fired here, not at trigger time — this is what keeps chat, shoutout
        // and the overlay talking about the same viewer.
        this.runEffects(job)

        if (job.widgetId) {
            this.widgetService?.increaseTriggeredCount(job.widgetId)
        }

        logger.info({
            message: "Overlay job dispatched",
            data: { jobId: job.id, slug: job.widgetSlug, durationMs, awaitsAck: !!job.awaitsAck },
        })

        // The ack (when the overlay reports the real end) races this timer;
        // whichever lands first releases the queue, the other becomes a no-op.
        const timer = setTimeout(() => {
            this.timers.delete(member)
            this.finish(member, token, GAP_MS).catch((error) =>
                logger.error({ message: "Failed to finish overlay job", error: error as Error })
            )
        }, durationMs)
        this.timers.set(member, timer)
    }

    /**
     * Runs a job's effects outside the queue. Used when an event produces no
     * overlay output at all, so there is nothing for its chat message or Twitch
     * action to wait for.
     */
    public runJobEffects(job: OverlayJob) {
        this.runEffects(job)
    }

    private runEffects(job: OverlayJob) {
        for (const effect of job.effects) {
            const delay = "delayMs" in effect && effect.delayMs ? effect.delayMs : 0
            if (delay > 0) {
                setTimeout(() => void this.runEffect(effect, job), delay)
            } else {
                void this.runEffect(effect, job)
            }
        }
    }

    /** One failing effect must never stall the queue or block its siblings. */
    private async runEffect(effect: OverlayEffect, job: OverlayJob) {
        const logger = this.logger.setContext("service.overlayQueue.runEffect", job.transactionId)
        try {
            switch (effect.type) {
                case "chat":
                    await twitchAppAPI.chat.sendChatMessageAsApp(
                        effect.senderId,
                        effect.broadcasterId,
                        effect.message,
                        effect.replyParentMessageId
                            ? { replyParentMessageId: effect.replyParentMessageId }
                            : {}
                    )
                    break
                case "shoutout": {
                    if (!this.authService) {
                        logger.error({ message: "Shoutout effect requires AuthService", data: { jobId: job.id } })
                        return
                    }
                    const api = await this.authService.createTwitchUserAPI(effect.senderId)
                    await api.chat.shoutoutUser(effect.broadcasterId, effect.targetUserId)
                    break
                }
            }
        } catch (error) {
            logger.error({
                message: "Overlay effect failed",
                data: { jobId: job.id, effect: effect.type },
                error: error as Error,
            })
        }
    }

    // -----------------------------------------------------------------------
    // Finish
    // -----------------------------------------------------------------------

    /**
     * Reported by the overlay when an item truly ended (audio finished, spinner
     * landed), so the next viewer does not wait out a conservative estimate.
     */
    public async ack(userId: string, widgetSlug: WidgetTypeSlug, jobId: string) {
        const logger = this.logger.setContext("service.overlayQueue.ack")
        const member = this.member(userId, widgetSlug)

        const current = await redis.get(this.currentKey(member))
        if (current !== jobId) {
            logger.info({ message: "Ignoring ack for an item that is no longer playing", data: { member, jobId, current } })
            return
        }

        const token = await redis.get(this.busyKey(member))
        if (!token) return

        const timer = this.timers.get(member)
        if (timer) {
            clearTimeout(timer)
            this.timers.delete(member)
        }

        logger.info({ message: "Overlay job acked", data: { member, jobId } })
        await this.finish(member, token, GAP_MS)
    }

    private async finish(member: string, token: string, gapMs: number) {
        await runScript(
            FINISH_SCRIPT,
            [this.busyKey(member), DUE_KEY],
            [token, String(Date.now() + gapMs), member]
        )
        if (gapMs > 0) {
            setTimeout(() => void this.pump(member), gapMs)
        } else {
            setImmediate(() => void this.pump(member))
        }
    }

    // -----------------------------------------------------------------------
    // Keys
    //
    // The {user}:{slug} segment is written as one hash tag so a future move to
    // Redis Cluster keeps a queue's keys in the same slot.
    // -----------------------------------------------------------------------

    private member(userId: string, slug: WidgetTypeSlug) {
        return `{${userId}:${slug}}`
    }
    private listKey(member: string) {
        return `${KEY_PREFIX}:q:${member}`
    }
    private jobKey(member: string, jobId: string) {
        return `${KEY_PREFIX}:job:${member}:${jobId}`
    }
    private busyKey(member: string) {
        return `${KEY_PREFIX}:busy:${member}`
    }
    private currentKey(member: string) {
        return `${KEY_PREFIX}:cur:${member}`
    }
    private dedupeKey(member: string, key: string) {
        return `${KEY_PREFIX}:dedupe:${member}:${key}`
    }
}
