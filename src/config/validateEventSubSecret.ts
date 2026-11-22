// Twitch rejects an EventSub subscription whose secret is outside this range.
export const EVENTSUB_SECRET_MIN_LENGTH = 10;
export const EVENTSUB_SECRET_MAX_LENGTH = 100;

/**
 * Called once at boot. A missing or unusable secret would make every signed webhook route reject real
 * Twitch deliveries, and every new subscription fail at Twitch, so failing fast here is safer than failing later.
 * The secret itself is never included in the error message.
 */
export function assertEventSubSecretConfigured(eventSubSecret: string): void {
    if (!eventSubSecret) {
        throw new Error("TWITCH_EVENTSUB_SECRET is required but not set");
    }
    if (eventSubSecret.length < EVENTSUB_SECRET_MIN_LENGTH || eventSubSecret.length > EVENTSUB_SECRET_MAX_LENGTH) {
        throw new Error(
            `TWITCH_EVENTSUB_SECRET must be ${EVENTSUB_SECRET_MIN_LENGTH}-${EVENTSUB_SECRET_MAX_LENGTH} characters long`,
        );
    }
}
