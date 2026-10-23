import EventSubReconcilerService, { EventSubSubscribeError } from "./eventSubReconciler.service";
import { pool } from "@/libs/prisma";
import { WidgetTypeSlug } from "@/services/constant";
import { twitchAppAPI } from "@/libs/twurple";

jest.mock("@/config", () => ({
    __esModule: true,
    default: { origin: "https://api.test", twitch: { eventSubHealthCheck: { deleteEnabled: true, liveLookbackMs: 65 * 60 * 1000 } } },
}));
jest.mock("@/libs/prisma", () => ({ pool: { connect: jest.fn() } }));
jest.mock("@/libs/twurple", () => ({
    createESTransport: jest.fn((route: string) => ({ method: "webhook", callback: route, secret: "s" })),
    twitchAppAPI: {
        eventSub: {
            getSubscriptionsPaginated: jest.fn(),
            deleteSubscription: jest.fn(),
            subscribeToStreamOnlineEvents: jest.fn(),
            subscribeToStreamOfflineEvents: jest.fn(),
            subscribeToChannelChatMessageEvents: jest.fn(),
            subscribeToChannelRedemptionAddEvents: jest.fn(),
            subscribeToChannelChatNotificationEvents: jest.fn(),
            getSubscriptionsForUser: jest.fn(),
        },
        streams: { getStreamsByUserIds: jest.fn() },
    },
}));

const eventSub = twitchAppAPI.eventSub as unknown as Record<string, jest.Mock>;
const streams = twitchAppAPI.streams as unknown as { getStreamsByUserIds: jest.Mock };

const makeSub = (id: string, type: string, status: string, owner: string, ageMs = 60 * 60 * 1000) => ({
    id, type, status,
    transportMethod: "webhook",
    _transport: { method: "webhook", callback: "https://api.test/webhook/v1/twitch/event-sub/x" },
    condition: { broadcaster_user_id: owner },
    creationDate: new Date(Date.now() - ageMs),
});

describe("EventSubReconcilerService", () => {
    const eventSubReconcilerRepository = { listEnabledWidgets: jest.fn() };
    const firstWordService = { resetChattersOnStartStream: jest.fn().mockResolvedValue(undefined) };
    const endCreditService = { handleTwitchStreamOnlineEvent: jest.fn().mockResolvedValue(undefined) };
    let service: EventSubReconcilerService;
    let lockResult: boolean;
    let client: { query: jest.Mock; release: jest.Mock };

    const mockSubs = (subs: unknown[]) => eventSub.getSubscriptionsPaginated.mockReturnValue({ getAll: jest.fn().mockResolvedValue(subs) });

    beforeEach(() => {
        jest.clearAllMocks();
        lockResult = true;
        client = {
            query: jest.fn().mockImplementation(async (sql: string) =>
                sql.includes("pg_try_advisory_lock") ? { rows: [{ locked: lockResult }] } : { rows: [] }),
            release: jest.fn(),
        };
        (pool.connect as jest.Mock).mockResolvedValue(client);
        eventSub.deleteSubscription.mockResolvedValue(undefined);
        Object.values(eventSub).forEach(fn => { if (fn !== eventSub.getSubscriptionsPaginated && fn !== eventSub.deleteSubscription) fn.mockResolvedValue(undefined); });
        eventSub.getSubscriptionsForUser.mockResolvedValue({ data: [] });
        streams.getStreamsByUserIds.mockResolvedValue([]);
        service = new EventSubReconcilerService(eventSubReconcilerRepository as any, firstWordService as any, endCreditService as any);
    });

    it("does nothing when another instance holds the lock", async () => {
        lockResult = false;
        const summary = await service.run("tx");
        expect(summary.skipped).toBe(true);
        expect(eventSubReconcilerRepository.listEnabledWidgets).not.toHaveBeenCalled();
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    it("skips everything when ORIGIN is not configured", async () => {
        const config = (await import("@/config")).default;
        const originalOrigin = config.origin;
        config.origin = "";
        try {
            const summary = await service.run("tx");
            expect(summary.skipped).toBe(true);
            expect(pool.connect).not.toHaveBeenCalled();
            expect(eventSub.getSubscriptionsPaginated).not.toHaveBeenCalled();
        } finally {
            config.origin = originalOrigin;
        }
    });

    it("holds the lock on a dedicated connection and releases both afterwards", async () => {
        eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([]);
        mockSubs([]);
        await service.run("tx");
        const sqls = client.query.mock.calls.map(call => call[0] as string);
        expect(sqls[0]).toContain("pg_try_advisory_lock");
        expect(sqls[sqls.length - 1]).toContain("pg_advisory_unlock");
        expect(client.release).toHaveBeenCalledWith(false);
    });

    it("releases the lock and connection even when the round throws", async () => {
        eventSubReconcilerRepository.listEnabledWidgets.mockRejectedValue(new Error("db down"));
        const summary = await service.run("tx");
        expect(summary.failed).toBe(1);
        expect(client.query.mock.calls.map(call => call[0] as string).some(sql => sql.includes("pg_advisory_unlock"))).toBe(true);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    it("destroys the connection when the unlock query fails", async () => {
        eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([]);
        mockSubs([]);
        client.query.mockImplementation(async (sql: string) => {
            if (sql.includes("pg_advisory_unlock")) throw new Error("connection lost");
            return { rows: [{ locked: true }] };
        });
        await service.run("tx");
        expect(client.release).toHaveBeenCalledWith(true);
    });

    it("creates missing subscriptions required by enabled widgets", async () => {
        eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([{ twitch_id: "1", widget_type_slug: "export-video" }]);
        mockSubs([]);
        const summary = await service.run("tx");
        expect(eventSub.subscribeToStreamOfflineEvents).toHaveBeenCalledTimes(1);
        expect(summary.created).toBe(1);
    });

    it("deletes an unhealthy subscription and creates a new one", async () => {
        eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([{ twitch_id: "1", widget_type_slug: "export-video" }]);
        mockSubs([makeSub("a", "stream.offline", "notification_failures_exceeded", "1")]);
        const summary = await service.run("tx");
        expect(eventSub.deleteSubscription).toHaveBeenCalledWith("a");
        expect(eventSub.subscribeToStreamOfflineEvents).toHaveBeenCalledTimes(1);
        expect(summary).toMatchObject({ created: 1, deleted: 1 });
    });

    it("leaves healthy subscriptions alone and does not duplicate", async () => {
        eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([{ twitch_id: "1", widget_type_slug: "export-video" }]);
        mockSubs([makeSub("a", "stream.offline", "enabled", "1")]);
        const summary = await service.run("tx");
        expect(eventSub.deleteSubscription).not.toHaveBeenCalled();
        expect(eventSub.subscribeToStreamOfflineEvents).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ created: 0, deleted: 0 });
    });

    it("deletes subscriptions no enabled widget needs", async () => {
        eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([{ twitch_id: "2", widget_type_slug: "export-video" }]);
        mockSubs([makeSub("a", "stream.offline", "enabled", "1"), makeSub("b", "stream.offline", "enabled", "2")]);
        await service.run("tx");
        expect(eventSub.deleteSubscription).toHaveBeenCalledWith("a");
        expect(eventSub.deleteSubscription).not.toHaveBeenCalledWith("b");
    });

    it("refuses to delete when no widget needs any subscription at all", async () => {
        eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([]);
        mockSubs([makeSub("a", "stream.offline", "enabled", "1")]);
        await service.run("tx");
        expect(eventSub.deleteSubscription).not.toHaveBeenCalled();
    });

    it("does not delete anything while deletes are disabled", async () => {
        const cfg = jest.requireMock("@/config").default;
        cfg.twitch.eventSubHealthCheck.deleteEnabled = false;
        try {
            eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([{ twitch_id: "2", widget_type_slug: "export-video" }]);
            mockSubs([makeSub("a", "stream.offline", "enabled", "1"), makeSub("b", "stream.offline", "enabled", "2")]);
            await service.run("tx");
            expect(eventSub.deleteSubscription).not.toHaveBeenCalled();
        } finally {
            cfg.twitch.eventSubHealthCheck.deleteEnabled = true;
        }
    });

    it("keeps an event type while at least one widget still uses it", async () => {
        eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([{ twitch_id: "1", widget_type_slug: "first-word" }]);
        mockSubs([
            makeSub("a", "channel.chat.message", "enabled", "1"),
            makeSub("b", "stream.online", "enabled", "1"),
            makeSub("c", "stream.offline", "enabled", "1"),
        ]);
        const summary = await service.run("tx");
        expect(summary).toMatchObject({ created: 0, deleted: 0 });
    });

    it("removes duplicate healthy subscriptions", async () => {
        eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([{ twitch_id: "1", widget_type_slug: "export-video" }]);
        mockSubs([makeSub("a", "stream.offline", "enabled", "1"), makeSub("b", "stream.offline", "enabled", "1")]);
        await service.run("tx");
        expect(eventSub.deleteSubscription).toHaveBeenCalledTimes(1);
        expect(eventSub.subscribeToStreamOfflineEvents).not.toHaveBeenCalled();
    });

    it("does not recreate a freshly pending verification subscription", async () => {
        eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([{ twitch_id: "1", widget_type_slug: "export-video" }]);
        mockSubs([makeSub("a", "stream.offline", "webhook_callback_verification_pending", "1", 60 * 1000)]);
        const summary = await service.run("tx");
        expect(summary).toMatchObject({ created: 0, deleted: 0 });
    });

    it("continues with other users when one fails", async () => {
        eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([
            { twitch_id: "1", widget_type_slug: "export-video" },
            { twitch_id: "2", widget_type_slug: "export-video" },
        ]);
        mockSubs([]);
        eventSub.subscribeToStreamOfflineEvents.mockRejectedValueOnce(new Error("token expired")).mockResolvedValueOnce(undefined);
        const summary = await service.run("tx");
        expect(summary).toMatchObject({ created: 1, failed: 1 });
    });

    it("treats HTTP 409 on create as success", async () => {
        eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([{ twitch_id: "1", widget_type_slug: "export-video" }]);
        mockSubs([]);
        eventSub.subscribeToStreamOfflineEvents.mockRejectedValueOnce(Object.assign(new Error("conflict"), { statusCode: 409 }));
        const summary = await service.run("tx");
        expect(summary).toMatchObject({ created: 1, failed: 0 });
    });

    it("ignores subscriptions of other callback origins, other transports and unknown types", async () => {
        eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([]);
        mockSubs([
            { ...makeSub("a", "user.update", "enabled", "1") },
            { ...makeSub("b", "stream.offline", "enabled", "1"), transportMethod: "websocket" },
            { ...makeSub("c", "stream.offline", "enabled", "1"), _transport: { method: "webhook", callback: "https://other-env.example/webhook/x" } },
        ]);
        await service.run("tx");
        expect(eventSub.deleteSubscription).not.toHaveBeenCalled();
    });

    it("never deletes event types that no widget can require (e.g. channel.subscribe)", async () => {
        eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([]);
        mockSubs([makeSub("a", "channel.subscribe", "enabled", "1")]);
        await service.run("tx");
        expect(eventSub.deleteSubscription).not.toHaveBeenCalled();
    });

    describe("live fallback", () => {
        const liveStream = (startedAgoMs: number) => ({
            id: "s1", userId: "1", userName: "u", userDisplayName: "U", startDate: new Date(Date.now() - startedAgoMs),
        });

        it("runs stream.online handlers for a user who went live recently and whose stream.online was re-created", async () => {
            eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([{ twitch_id: "1", widget_type_slug: "end-credit" }]);
            mockSubs([]);
            streams.getStreamsByUserIds.mockResolvedValue([liveStream(10 * 60 * 1000)]);
            const summary = await service.run("tx");
            expect(firstWordService.resetChattersOnStartStream).toHaveBeenCalledWith(expect.objectContaining({ broadcaster_user_id: "1" }));
            expect(endCreditService.handleTwitchStreamOnlineEvent).toHaveBeenCalledTimes(1);
            expect(summary.liveFallbackTriggered).toBe(1);
        });

        it("ignores streams that started before the lookback window", async () => {
            eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([{ twitch_id: "1", widget_type_slug: "end-credit" }]);
            mockSubs([]);
            streams.getStreamsByUserIds.mockResolvedValue([liveStream(5 * 60 * 60 * 1000)]);
            await service.run("tx");
            expect(endCreditService.handleTwitchStreamOnlineEvent).not.toHaveBeenCalled();
        });

        it("does not check live status when stream.online was not re-created", async () => {
            eventSubReconcilerRepository.listEnabledWidgets.mockResolvedValue([{ twitch_id: "1", widget_type_slug: "end-credit" }]);
            mockSubs([
                makeSub("a", "stream.online", "enabled", "1"),
                makeSub("b", "channel.follow", "enabled", "1"),
                makeSub("c", "channel.bits.use", "enabled", "1"),
                makeSub("d", "channel.chat.notification", "enabled", "1"),
                { ...makeSub("e", "channel.raid", "enabled", "1"), condition: { from_broadcaster_user_id: "1" } },
            ]);
            await service.run("tx");
            expect(streams.getStreamsByUserIds).not.toHaveBeenCalled();
        });
    });

    describe("ensureEventSubs", () => {
        it("subscribes only to event types without an enabled subscription", async () => {
            eventSub.getSubscriptionsForUser.mockResolvedValue({ data: [{ type: "stream.online", status: "enabled" }, { type: "stream.offline", status: "authorization_revoked" }] });
            const subscribed = await EventSubReconcilerService.ensureEventSubs("1", ["stream.online", "stream.offline"], "tx");
            expect(subscribed).toEqual(["stream.offline"]);
            expect(eventSub.subscribeToStreamOnlineEvents).not.toHaveBeenCalled();
            expect(eventSub.subscribeToStreamOfflineEvents).toHaveBeenCalledTimes(1);
        });

        it("throws EventSubSubscribeError carrying the failing event type", async () => {
            eventSub.subscribeToStreamOfflineEvents.mockRejectedValueOnce(new Error("boom"));
            await expect(EventSubReconcilerService.ensureEventSubs("1", ["stream.offline"])).rejects.toMatchObject({ eventType: "stream.offline" });
            await expect(EventSubReconcilerService.ensureEventSubs("1", ["unknown.type"])).rejects.toBeInstanceOf(EventSubSubscribeError);
        });
    });

    describe("getRequiredEventTypes", () => {
        it("returns empty list when no widgets are enabled", () => {
            expect(EventSubReconcilerService.getRequiredEventTypes([])).toEqual([]);
        });

        it("dedupes event types shared by several widgets", () => {
            const result = EventSubReconcilerService.getRequiredEventTypes([
                WidgetTypeSlug.FIRST_WORD, WidgetTypeSlug.SPOTIFY_SONG_REQUEST, WidgetTypeSlug.DROP_IMAGE, WidgetTypeSlug.EXPORT_VIDEO,
            ]);
            expect(result.length).toBe(new Set(result).size);
            expect(result).toEqual(expect.arrayContaining(["channel.chat.message", "stream.offline", "stream.online"]));
        });

        it("skips unknown widget slugs", () => {
            expect(EventSubReconcilerService.getRequiredEventTypes(["unknown-widget", WidgetTypeSlug.CLIP_SHOUTOUT])).toEqual(["channel.chat.notification"]);
        });
    });
});
