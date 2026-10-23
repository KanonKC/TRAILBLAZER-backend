import { randomUUID } from "crypto";
import { HelixEventSubSubscription } from "@twurple/api";
import config from "@/config";
import { pool } from "@/libs/prisma";
import { createESTransport, twitchAppAPI } from "@/libs/twurple";
import TLogger, { Layer } from "@/logging/logger";
import EventSubReconcilerRepository from "@/repositories/eventSubReconciler/eventSubReconciler.repository";
import type FirstWordService from "@/services/widget/firstWord/firstWord.service";
import type EndCreditService from "@/services/widget/endCredit/endCredit.service";
import { TwitchStreamOnlineEventRequest } from "@/events/twitch/streamOnline/request";
import { TWITCH_EVENT_DEFINITIONS } from "../events";
import { ReconcileSummary } from "./response";
import { TwitchEventType, WIDGET_EVENT_TYPES, WIDGET_MANAGED_EVENT_TYPES } from "../constant";
import { WidgetTypeSlug } from "@/services/constant";

// Arbitrary constant key shared by every instance for pg_try_advisory_xact_lock
const ADVISORY_LOCK_KEY = 7301001;
const FRESH_PENDING_VERIFICATION_MS = 10 * 60 * 1000;
const USER_CONCURRENCY = 5;
const STREAMS_BATCH_SIZE = 100;
const MISSING_STATUS = "missing";
const MAX_DELETE_RATIO = 0.3;
const MIN_MANAGED_FOR_RATIO_CHECK = 20;

export class EventSubSubscribeError extends Error {
    constructor(public readonly eventType: string, public readonly cause: unknown) {
        super(`Failed to subscribe to EventSub type ${eventType}`);
    }
}

type ReconcileAction =
    | { kind: "create"; twitchId: string; eventType: string; previousStatus: string }
    | { kind: "delete"; twitchId: string; eventType: string; subscription: HelixEventSubSubscription; reason: string };

export default class EventSubReconcilerService {
    private static readonly staticLogger = new TLogger(Layer.SERVICE, "twitch.eventSubReconciler");
    private readonly logger: TLogger;

    constructor(
        private readonly eventSubReconcilerRepository: EventSubReconcilerRepository,
        private readonly firstWordService: FirstWordService,
        private readonly endCreditService: EndCreditService,
    ) {
        this.logger = new TLogger(Layer.SERVICE);
    }

    /** Unique EventSub event types a user needs, given the widget slugs they have enabled. Unknown slugs are skipped. */
    static getRequiredEventTypes(widgetSlugs: readonly string[]): TwitchEventType[] {
        const required = new Set<TwitchEventType>();
        for (const slug of widgetSlugs) {
            const eventTypes = WIDGET_EVENT_TYPES[slug as WidgetTypeSlug];
            if (!eventTypes) {
                EventSubReconcilerService.staticLogger.warn({ message: "Widget slug has no EventSub mapping, skipping", data: { slug } });
                continue;
            }
            eventTypes.forEach(eventType => required.add(eventType));
        }
        return [...required];
    }

    /**
     * Subscribes the user to every given event type that has no `enabled` subscription yet.
     * Uses a single list call. Throws EventSubSubscribeError on the first failed subscribe.
     * Never deletes — removal is the health check job's responsibility.
     * Static so widget services can call it without depending on a reconciler instance
     * (the reconciler itself depends on FirstWordService/EndCreditService, which would make the injection circular).
     */
    static async ensureEventSubs(twitchId: string, eventTypes: readonly string[], transactionId?: string): Promise<string[]> {
        const logger = EventSubReconcilerService.staticLogger.setContext("service.twitch.eventSubReconciler.ensureEventSubs", transactionId);
        const existing = await twitchAppAPI.eventSub.getSubscriptionsForUser(twitchId);
        const enabledTypes = new Set(existing.data.filter(sub => sub.status === "enabled").map(sub => sub.type));

        const subscribed: string[] = [];
        for (const eventType of eventTypes) {
            if (enabledTypes.has(eventType)) continue;
            const definition = TWITCH_EVENT_DEFINITIONS.find(d => d.type === eventType);
            if (!definition) {
                throw new EventSubSubscribeError(eventType, new Error("Unknown EventSub definition"));
            }
            try {
                await definition.subscribe(twitchId, createESTransport(definition.route));
                subscribed.push(eventType);
                logger.info({ message: "Subscribed to EventSub type", data: { twitchId, eventType } });
            } catch (error) {
                logger.error({ message: "Failed to subscribe to EventSub type", data: { twitchId, eventType }, error: error as Error });
                throw new EventSubSubscribeError(eventType, error);
            }
        }
        return subscribed;
    }

    /** Runs one health-check round. Safe to call from several instances at once: only the lock holder does work. */
    async run(transactionId: string = randomUUID()): Promise<ReconcileSummary> {
        const logger = this.logger.setContext("service.twitch.eventSubReconciler.run", transactionId);
        const startedAt = Date.now();
        let summary: ReconcileSummary = { skipped: true, created: 0, deleted: 0, failed: 0, liveFallbackTriggered: 0, durationMs: 0 };

        if (!config.origin) {
            // Without an origin every webhook subscription of the Twitch app would look like ours
            logger.warn({ message: "EventSub health check skipped, ORIGIN is not configured" });
            return { ...summary, durationMs: Date.now() - startedAt };
        }

        // Session-level lock on a dedicated connection: it stays held for exactly as long as the round runs
        // (a transaction timeout would release it while the work is still going) and is dropped by Postgres if the process dies.
        const client = await pool.connect();
        let destroyClient = false;
        try {
            const { rows } = await client.query("SELECT pg_try_advisory_lock($1::bigint) AS locked", [ADVISORY_LOCK_KEY]);
            if (!rows[0]?.locked) {
                logger.info({ message: "EventSub health check skipped, another instance holds the lock" });
            } else {
                try {
                    summary = await this.reconcile(transactionId);
                } finally {
                    try {
                        await client.query("SELECT pg_advisory_unlock($1::bigint)", [ADVISORY_LOCK_KEY]);
                    } catch (unlockError) {
                        // Closing the connection is what guarantees the lock is released
                        destroyClient = true;
                        logger.error({ message: "Failed to release EventSub health check lock, closing connection", error: unlockError as Error });
                    }
                }
            }
        } catch (error) {
            logger.error({ message: "EventSub health check failed", error: error as Error });
            summary = { ...summary, skipped: false, failed: summary.failed + 1 };
        } finally {
            client.release(destroyClient);
        }

        summary.durationMs = Date.now() - startedAt;
        logger.info({ message: "EventSub health check finished", data: summary });
        return summary;
    }

    private async reconcile(transactionId: string): Promise<ReconcileSummary> {
        const logger = this.logger.setContext("service.twitch.eventSubReconciler.reconcile", transactionId);
        const summary: ReconcileSummary = { skipped: false, created: 0, deleted: 0, failed: 0, liveFallbackTriggered: 0, durationMs: 0 };

        const desired = await this.computeDesired(transactionId);

        const fetchStartedAt = Date.now();
        const allSubscriptions = await twitchAppAPI.eventSub.getSubscriptionsPaginated().getAll();
        const managed = allSubscriptions.filter(sub => this.isManaged(sub));
        logger.info({
            message: "Fetched EventSub subscriptions",
            data: { total: allSubscriptions.length, managed: managed.length, duration_ms: Date.now() - fetchStartedAt },
        });

        const actionsByUser = this.diff(desired, managed);
        this.guardDeletes(actionsByUser, desired, managed.length, transactionId);

        const resubscribedOnline: string[] = [];
        let rateLimited = false;
        const queue = [...actionsByUser.entries()];
        const workers = Array.from({ length: USER_CONCURRENCY }, async () => {
            while (queue.length > 0 && !rateLimited) {
                const [twitchId, actions] = queue.shift()!;
                try {
                    for (const action of actions) {
                        const result = await this.execute(action, transactionId);
                        if (result === "failed") summary.failed++;
                        else if (action.kind === "create") summary.created++;
                        else summary.deleted++;
                        if (result === "rate_limited") rateLimited = true;
                        if (result === "ok" && action.kind === "create" && action.eventType === TwitchEventType.STREAM_ONLINE) {
                            resubscribedOnline.push(twitchId);
                        }
                        if (rateLimited) break;
                    }
                } catch (error) {
                    summary.failed++;
                    logger.error({ message: "Unexpected error reconciling user, continuing", data: { twitchId }, error: error as Error });
                }
            }
        });
        await Promise.all(workers);
        if (rateLimited) {
            logger.warn({ message: "Twitch rate limit hit, remaining users will be retried next round" });
        }

        summary.liveFallbackTriggered = await this.triggerLiveFallback(resubscribedOnline, transactionId);
        return summary;
    }

    private async computeDesired(transactionId: string): Promise<Map<string, Set<string>>> {
        const widgets = await this.eventSubReconcilerRepository.listEnabledWidgets(transactionId);
        const slugsByUser = new Map<string, string[]>();
        for (const widget of widgets) {
            if (!widget.widget_type_slug) continue;
            const slugs = slugsByUser.get(widget.twitch_id) ?? [];
            slugs.push(widget.widget_type_slug);
            slugsByUser.set(widget.twitch_id, slugs);
        }
        const desired = new Map<string, Set<string>>();
        for (const [twitchId, slugs] of slugsByUser) {
            const eventTypes = EventSubReconcilerService.getRequiredEventTypes(slugs);
            if (eventTypes.length > 0) desired.set(twitchId, new Set(eventTypes));
        }
        return desired;
    }

    /**
     * Only touch webhook subscriptions of our own callback origin and of event types some widget can require.
     * Types no widget uses (e.g. channel.subscribe) and other deployments' subscriptions are never touched.
     */
    private isManaged(subscription: HelixEventSubSubscription): boolean {
        if (subscription.transportMethod !== "webhook") return false;
        if (!WIDGET_MANAGED_EVENT_TYPES.has(subscription.type as TwitchEventType)) return false;
        const callback = (subscription._transport as { callback?: string }).callback ?? "";
        return config.origin !== "" && callback.startsWith(config.origin);
    }

    private ownerOf(subscription: HelixEventSubSubscription): string | undefined {
        const condition = subscription.condition;
        const owner = condition.broadcaster_user_id ?? condition.from_broadcaster_user_id;
        return typeof owner === "string" ? owner : undefined;
    }

    private diff(desired: Map<string, Set<string>>, managed: HelixEventSubSubscription[]): Map<string, ReconcileAction[]> {
        const subscriptionsByKey = new Map<string, HelixEventSubSubscription[]>();
        const users = new Set<string>(desired.keys());
        for (const subscription of managed) {
            const owner = this.ownerOf(subscription);
            if (!owner) continue;
            users.add(owner);
            const key = `${owner}|${subscription.type}`;
            subscriptionsByKey.set(key, [...(subscriptionsByKey.get(key) ?? []), subscription]);
        }

        const actionsByUser = new Map<string, ReconcileAction[]>();
        const push = (twitchId: string, action: ReconcileAction) => actionsByUser.set(twitchId, [...(actionsByUser.get(twitchId) ?? []), action]);

        for (const twitchId of users) {
            const wanted = desired.get(twitchId) ?? new Set<string>();
            const eventTypes = new Set<string>([...wanted, ...managed.filter(s => this.ownerOf(s) === twitchId).map(s => s.type)]);
            for (const eventType of eventTypes) {
                const existing = subscriptionsByKey.get(`${twitchId}|${eventType}`) ?? [];
                if (!wanted.has(eventType)) {
                    existing.forEach(subscription => push(twitchId, { kind: "delete", twitchId, eventType, subscription, reason: "not required by any enabled widget" }));
                    continue;
                }
                const healthy = existing.filter(s => s.status === "enabled");
                const freshPending = existing.filter(s => s.status === "webhook_callback_verification_pending"
                    && Date.now() - s.creationDate.getTime() < FRESH_PENDING_VERIFICATION_MS);
                const broken = existing.filter(s => !healthy.includes(s) && !freshPending.includes(s));

                healthy.slice(1).forEach(subscription => push(twitchId, { kind: "delete", twitchId, eventType, subscription, reason: "duplicate subscription" }));
                broken.forEach(subscription => push(twitchId, { kind: "delete", twitchId, eventType, subscription, reason: `unhealthy status ${subscription.status}` }));
                if (healthy.length === 0 && freshPending.length === 0) {
                    push(twitchId, { kind: "create", twitchId, eventType, previousStatus: broken[0]?.status ?? MISSING_STATUS });
                }
            }
        }
        return actionsByUser;
    }

    /**
     * Removes delete actions unless they are enabled and plausible. A wrong
     * "desired" set (partial widget list, unmapped slug) would otherwise
     * unsubscribe live users, and nothing re-creates the subscriptions until
     * the next round. Creates are never affected.
     */
    private guardDeletes(actionsByUser: Map<string, ReconcileAction[]>, desired: Map<string, Set<string>>, managedCount: number, transactionId: string) {
        const logger = this.logger.setContext("service.twitch.eventSubReconciler.guardDeletes", transactionId);
        let deletes = 0;
        for (const actions of actionsByUser.values()) deletes += actions.filter(a => a.kind === "delete").length;
        if (deletes === 0) return;

        let reason: string | null = null;
        if (!config.twitch.eventSubHealthCheck.deleteEnabled) reason = "deletes disabled";
        else if (desired.size === 0 && managedCount > 0) reason = "no desired subscriptions but managed ones exist";
        else if (managedCount >= MIN_MANAGED_FOR_RATIO_CHECK && deletes / managedCount > MAX_DELETE_RATIO) reason = "delete ratio too high";
        if (!reason) return;

        logger.warn({ message: "Skipping EventSub deletes", data: { reason, deletes, managed: managedCount } });
        for (const [twitchId, actions] of actionsByUser) {
            const kept = actions.filter(a => a.kind !== "delete");
            if (kept.length > 0) actionsByUser.set(twitchId, kept);
            else actionsByUser.delete(twitchId);
        }
    }

    private async execute(action: ReconcileAction, transactionId: string): Promise<"ok" | "failed" | "rate_limited"> {
        const logger = this.logger.setContext("service.twitch.eventSubReconciler.execute", transactionId);
        const startedAt = Date.now();
        try {
            if (action.kind === "delete") {
                await twitchAppAPI.eventSub.deleteSubscription(action.subscription.id);
                logger.info({
                    message: "Deleted EventSub subscription",
                    data: { twitchId: action.twitchId, eventType: action.eventType, previousStatus: action.subscription.status, reason: action.reason, duration_ms: Date.now() - startedAt },
                });
                return "ok";
            }
            const definition = TWITCH_EVENT_DEFINITIONS.find(d => d.type === action.eventType)!;
            try {
                await definition.subscribe(action.twitchId, createESTransport(definition.route));
            } catch (error) {
                // 409 = Twitch already has this exact subscription, which is the state we want
                if ((error as { statusCode?: number }).statusCode !== 409) throw error;
            }
            logger.info({
                message: "Re-subscribed EventSub subscription",
                data: { twitchId: action.twitchId, eventType: action.eventType, previousStatus: action.previousStatus, result: "success", duration_ms: Date.now() - startedAt },
            });
            return "ok";
        } catch (error) {
            const statusCode = (error as { statusCode?: number }).statusCode;
            logger.error({
                message: action.kind === "create" ? "Failed to re-subscribe EventSub subscription" : "Failed to delete EventSub subscription",
                data: {
                    twitchId: action.twitchId,
                    eventType: action.eventType,
                    previousStatus: action.kind === "create" ? action.previousStatus : action.subscription.status,
                    result: "error",
                    statusCode,
                },
                error: error as Error,
            });
            return statusCode === 429 ? "rate_limited" : "failed";
        }
    }

    /**
     * stream.online may have been missed while its subscription was down. For users whose stream.online we just
     * re-created, check whether they went live within the lookback window and, if so, run the stream.online handlers.
     * Limiting to freshly re-created subscriptions keeps later rounds from re-triggering (and wiping mid-stream state).
     */
    private async triggerLiveFallback(twitchIds: string[], transactionId: string): Promise<number> {
        if (twitchIds.length === 0) return 0;
        const logger = this.logger.setContext("service.twitch.eventSubReconciler.triggerLiveFallback", transactionId);
        const lookbackStart = Date.now() - config.twitch.eventSubHealthCheck.liveLookbackMs;
        let triggered = 0;

        for (let offset = 0; offset < twitchIds.length; offset += STREAMS_BATCH_SIZE) {
            const batch = twitchIds.slice(offset, offset + STREAMS_BATCH_SIZE);
            try {
                const startedAt = Date.now();
                const streams = await twitchAppAPI.streams.getStreamsByUserIds(batch);
                logger.info({ message: "Fetched live streams", data: { requested: batch.length, live: streams.length, duration_ms: Date.now() - startedAt } });

                for (const stream of streams) {
                    if (stream.startDate.getTime() < lookbackStart) continue;
                    const event: TwitchStreamOnlineEventRequest = {
                        id: stream.id,
                        broadcaster_user_id: stream.userId,
                        broadcaster_user_login: stream.userName,
                        broadcaster_user_name: stream.userDisplayName,
                        type: "live",
                        started_at: stream.startDate.toISOString(),
                    };
                    logger.info({ message: "Treating live user as stream.online", data: { twitchId: stream.userId, startedAt: event.started_at } });
                    await Promise.allSettled([
                        this.firstWordService.resetChattersOnStartStream(event),
                        this.endCreditService.handleTwitchStreamOnlineEvent(event),
                    ]);
                    triggered++;
                }
            } catch (error) {
                logger.error({ message: "Live fallback failed for batch, continuing", data: { batchSize: batch.length }, error: error as Error });
            }
        }
        return triggered;
    }
}
