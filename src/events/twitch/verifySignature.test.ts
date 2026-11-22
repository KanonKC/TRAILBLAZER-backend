import { createHmac } from "crypto";
import { SIGNATURE_MAX_AGE_MS, verifyTwitchSignature } from "./verifySignature";

const SECRET = "unit-test-secret-0123456789";
const NOW_MS = Date.parse("2026-11-07T12:00:00.000Z");

function signDelivery(secret: string, messageId: string, timestamp: string, rawBody: Buffer): string {
    return `sha256=${createHmac("sha256", secret).update(messageId).update(timestamp).update(rawBody).digest("hex")}`;
}

function buildDelivery(overrides: { secret?: string; timestamp?: string; body?: string; signature?: string } = {}) {
    const rawBody = Buffer.from(overrides.body ?? JSON.stringify({ event: { id: "redemption-1" } }));
    const timestamp = overrides.timestamp ?? new Date(NOW_MS - 1000).toISOString();
    return {
        rawBody,
        headers: {
            "twitch-eventsub-message-id": "message-1",
            "twitch-eventsub-message-timestamp": timestamp,
            "twitch-eventsub-message-signature": overrides.signature ?? signDelivery(overrides.secret ?? SECRET, "message-1", timestamp, rawBody),
        },
    };
}

describe("verifyTwitchSignature", () => {
    it("accepts a correctly signed delivery", () => {
        const { headers, rawBody } = buildDelivery();
        expect(verifyTwitchSignature({ headers, rawBody, secret: SECRET, nowMs: NOW_MS })).toEqual({ valid: true });
    });

    it("rejects a delivery signed with a different secret", () => {
        const { headers, rawBody } = buildDelivery({ secret: "another-secret-0123456789" });
        expect(verifyTwitchSignature({ headers, rawBody, secret: SECRET, nowMs: NOW_MS })).toEqual({ valid: false, reason: "mismatch" });
    });

    it("rejects a body that changed after it was signed", () => {
        const { headers } = buildDelivery();
        const tamperedBody = Buffer.from(JSON.stringify({ event: { id: "forged" } }));
        expect(verifyTwitchSignature({ headers, rawBody: tamperedBody, secret: SECRET, nowMs: NOW_MS })).toEqual({ valid: false, reason: "mismatch" });
    });

    it("rejects a signature of the wrong length without throwing", () => {
        const { headers, rawBody } = buildDelivery({ signature: "sha256=abc" });
        expect(verifyTwitchSignature({ headers, rawBody, secret: SECRET, nowMs: NOW_MS })).toEqual({ valid: false, reason: "mismatch" });
    });

    it.each([
        "twitch-eventsub-message-id",
        "twitch-eventsub-message-timestamp",
        "twitch-eventsub-message-signature",
    ])("rejects a delivery missing %s", (missingHeader) => {
        const { headers, rawBody } = buildDelivery();
        const incompleteHeaders: Record<string, string> = { ...headers };
        delete incompleteHeaders[missingHeader];
        expect(verifyTwitchSignature({ headers: incompleteHeaders, rawBody, secret: SECRET, nowMs: NOW_MS })).toEqual({ valid: false, reason: "missing_headers" });
    });

    it("rejects a header that was sent more than once", () => {
        const { headers, rawBody } = buildDelivery();
        const duplicatedHeaders = { ...headers, "twitch-eventsub-message-id": ["message-1", "message-2"] };
        expect(verifyTwitchSignature({ headers: duplicatedHeaders, rawBody, secret: SECRET, nowMs: NOW_MS })).toEqual({ valid: false, reason: "missing_headers" });
    });

    it("rejects a correctly signed delivery older than ten minutes", () => {
        const staleTimestamp = new Date(NOW_MS - SIGNATURE_MAX_AGE_MS - 1000).toISOString();
        const { headers, rawBody } = buildDelivery({ timestamp: staleTimestamp });
        expect(verifyTwitchSignature({ headers, rawBody, secret: SECRET, nowMs: NOW_MS })).toEqual({ valid: false, reason: "stale_timestamp" });
    });

    it("accepts a correctly signed delivery just inside the ten minute window", () => {
        const recentTimestamp = new Date(NOW_MS - SIGNATURE_MAX_AGE_MS + 1000).toISOString();
        const { headers, rawBody } = buildDelivery({ timestamp: recentTimestamp });
        expect(verifyTwitchSignature({ headers, rawBody, secret: SECRET, nowMs: NOW_MS })).toEqual({ valid: true });
    });

    it("rejects a timestamp that is not a date", () => {
        const { headers, rawBody } = buildDelivery({ timestamp: "not-a-date" });
        expect(verifyTwitchSignature({ headers, rawBody, secret: SECRET, nowMs: NOW_MS })).toEqual({ valid: false, reason: "invalid_timestamp" });
    });
});
