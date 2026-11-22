import { createHmac, timingSafeEqual } from "crypto";
import type { IncomingHttpHeaders } from "http";

// Twitch asks receivers to reject deliveries older than this, which also blunts replays of captured requests.
export const SIGNATURE_MAX_AGE_MS = 10 * 60 * 1000;

const SIGNATURE_PREFIX = "sha256=";

export type SignatureFailureReason = "missing_headers" | "invalid_timestamp" | "stale_timestamp" | "mismatch";

export type SignatureVerification = { valid: true } | { valid: false; reason: SignatureFailureReason };

export interface VerifyTwitchSignatureParams {
    headers: IncomingHttpHeaders;
    /** The request body exactly as received. Parsing and re-serializing it would change the bytes that were signed. */
    rawBody: Buffer;
    secret: string;
    /** Injectable for tests. */
    nowMs?: number;
}

function singleHeaderValue(headers: IncomingHttpHeaders, headerName: string): string | undefined {
    const value = headers[headerName];
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Verifies an EventSub webhook delivery: HMAC-SHA256 of `message id + message timestamp + raw body`, keyed with the
 * subscription secret, compared in constant time.
 * https://dev.twitch.tv/docs/eventsub/handling-webhook-events/#verifying-the-event-message
 */
export function verifyTwitchSignature({ headers, rawBody, secret, nowMs = Date.now() }: VerifyTwitchSignatureParams): SignatureVerification {
    const messageId = singleHeaderValue(headers, "twitch-eventsub-message-id");
    const messageTimestamp = singleHeaderValue(headers, "twitch-eventsub-message-timestamp");
    const providedSignature = singleHeaderValue(headers, "twitch-eventsub-message-signature");
    if (!messageId || !messageTimestamp || !providedSignature) {
        return { valid: false, reason: "missing_headers" };
    }

    const timestampMs = Date.parse(messageTimestamp);
    if (Number.isNaN(timestampMs)) {
        return { valid: false, reason: "invalid_timestamp" };
    }
    if (nowMs - timestampMs > SIGNATURE_MAX_AGE_MS) {
        return { valid: false, reason: "stale_timestamp" };
    }

    const expectedDigest = createHmac("sha256", secret).update(messageId).update(messageTimestamp).update(rawBody).digest("hex");
    const expectedSignature = Buffer.from(`${SIGNATURE_PREFIX}${expectedDigest}`);
    const providedSignatureBytes = Buffer.from(providedSignature);

    // timingSafeEqual throws on unequal lengths, and a length mismatch carries no secret information anyway
    if (expectedSignature.length !== providedSignatureBytes.length || !timingSafeEqual(expectedSignature, providedSignatureBytes)) {
        return { valid: false, reason: "mismatch" };
    }
    return { valid: true };
}
