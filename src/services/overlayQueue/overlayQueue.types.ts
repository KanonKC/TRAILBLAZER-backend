import { WidgetTypeSlug } from "@/services/widget/constant"

/**
 * A side effect that belongs to an event and therefore must fire at the same
 * moment the overlay shows that event — not when the event arrived.
 *
 * Splitting these out is the whole point of the queue: if the chat message or
 * the Twitch shoutout escaped early, viewer #3 would be greeted in chat while
 * the overlay is still showing viewer #1.
 */
export type OverlayEffect =
    | {
        type: "chat"
        senderId: string
        broadcasterId: string
        message: string
        replyParentMessageId?: string
        /** Offset from dispatch. Only used where the delay is intentional. */
        delayMs?: number
    }
    | {
        type: "shoutout"
        /** The channel running the shoutout. */
        broadcasterId: string
        /** The channel being shouted out. */
        targetUserId: string
        /** Bot account whose user token performs the shoutout. */
        senderId: string
    }

export interface OverlayJob<P = unknown> {
    id: string
    userId: string
    widgetSlug: WidgetTypeSlug
    /** Widget row id, so the trigger counter increments when it actually shows. */
    widgetId?: string
    enqueuedAt: number
    expiresAt: number
    transactionId?: string

    /**
     * Stable references only — never a signed URL. Anything that expires is
     * minted by the handler at dispatch time, which is why a job can sit in the
     * queue longer than a signed URL lives.
     */
    payload: P

    /** Everything that must happen alongside the overlay event. */
    effects: OverlayEffect[]

    /** Known up front where possible; otherwise the handler estimates it. */
    durationMs?: number

    /**
     * The overlay can report the true end of this item (audio ended, spinner
     * landed). When true, durationMs is only the ceiling that keeps the queue
     * moving if that report never arrives.
     */
    awaitsAck?: boolean
}

export interface EnqueueInput<P = unknown> {
    userId: string
    widgetSlug: WidgetTypeSlug
    payload: P
    effects?: OverlayEffect[]
    widgetId?: string
    durationMs?: number
    awaitsAck?: boolean
    /** Optional short-lived guard against the exact same trigger twice. */
    dedupeKey?: string
    dedupeTtlMs?: number
    /** Jump the queue. Only for streamer-initiated test triggers. */
    priority?: "front" | "back"
    transactionId?: string
}

export type EnqueueResult =
    | { enqueued: true; jobId: string }
    | { enqueued: false; reason: "duplicate" | "queue_full" }

/**
 * Per-widget behaviour. `resolve` runs at dispatch, which is where late-bound
 * data (signed URLs, "is this widget still enabled?") belongs.
 */
export interface WidgetHandler<P = unknown> {
    /** Redis pub/sub channel the SSE controller subscribes to. */
    channel: string
    /** SSE event name the overlay listens for. */
    event: string
    /**
     * Builds the payload that goes out over SSE. Returning null drops the job
     * (widget disabled, asset deleted, tier downgraded) without burning the gap.
     */
    resolve(job: OverlayJob<P>): Promise<Record<string, unknown> | null>
    /** Fallback when the job carries no duration. */
    estimateDurationMs(job: OverlayJob<P>): number
}
