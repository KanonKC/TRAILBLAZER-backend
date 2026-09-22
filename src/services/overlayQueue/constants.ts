/**
 * Tuning knobs for the overlay queue.
 *
 * The queue exists because every overlay widget used to fire its events the
 * moment Twitch delivered them, so a burst of viewers would cut each other's
 * audio/animation off half way through. Everything here is about pacing that
 * burst, not about UX polish.
 */

/** Breathing room between two queue items, so exit animations finish cleanly. */
export const GAP_MS = 2_000

/** Hard cap per (user, widget). A spam wave past this is dropped, not queued. */
export const MAX_QUEUE_ITEMS = 100

/**
 * How long a job may sit in the queue before it is considered stale. This is a
 * system safety net (nothing should ever hold the queue for an hour), not a UX
 * rule.
 */
export const JOB_TTL_MS = 60 * 60 * 1_000

/** How often each instance looks for queues that are due but nobody is driving. */
export const SWEEP_INTERVAL_MS = 1_000

/**
 * Lock TTL taken at the instant a job is popped, before its real duration is
 * known. It is immediately extended once the handler has resolved the job.
 */
export const BOOTSTRAP_LOCK_MS = 15_000

/** Extra lock time beyond duration + gap, to absorb dispatch overhead. */
export const LOCK_SLACK_MS = 5_000

/** Upper bound on expired jobs skipped in a single dispatch attempt. */
export const MAX_EXPIRED_SKIP = 100

// ---------------------------------------------------------------------------
// Per-widget durations
//
// These are the backend's authoritative "how long does this occupy the screen"
// numbers. They ship inside the SSE payload so the overlay and the queue can
// never drift apart. Where the overlay can report the true end (audio ended,
// spinner finished), that ack wins and these are only the safety ceiling.
// ---------------------------------------------------------------------------

/** Used when an audio file has no duration_ms recorded yet (pre-backfill). */
export const FIRST_WORD_FALLBACK_DURATION_MS = 8_000

/**
 * Killer spin animations, measured from the overlay components. "frame" also
 * preloads images (up to 3s) before it starts, hence the larger budget.
 */
export const KILLER_SPIN_MS: Record<string, number> = {
    slot: 2_800,
    flip: 2_800,
    roulette: 2_800,
    frame: 9_000,
}
export const KILLER_DEFAULT_SPIN_MS = 2_800

/** How long the result stays up after the spinner lands. */
export const KILLER_HOLD_MS = 10_000

/**
 * The killer widget deliberately delays its chat message so it does not spoil
 * the result before the spinner stops. The offset counts from dispatch, not
 * from when the redemption arrived.
 */
export const KILLER_CHAT_DELAY_MS = 10_000

/** Rough row metrics for estimating an end credit roll's runtime. */
export const END_CREDIT_ROW_PX = 56
export const END_CREDIT_HEADER_PX = 140
export const END_CREDIT_VIEWPORT_PX = 1_080
export const END_CREDIT_ESTIMATE_SLACK = 1.25
export const END_CREDIT_DEFAULT_SCROLL_SPEED = 60

/** Clip playback gets a small tail so the video is never cut at the very end. */
export const CLIP_TAIL_MS = 3_000
