import { assertEventSubSecretConfigured } from "./validateEventSubSecret";

describe("assertEventSubSecretConfigured", () => {
    it("fails when the secret is missing", () => {
        expect(() => assertEventSubSecretConfigured("")).toThrow("TWITCH_EVENTSUB_SECRET is required");
    });

    it("fails when the secret is shorter than Twitch allows", () => {
        expect(() => assertEventSubSecretConfigured("a".repeat(9))).toThrow("10-100 characters");
    });

    it("fails when the secret is longer than Twitch allows", () => {
        expect(() => assertEventSubSecretConfigured("a".repeat(101))).toThrow("10-100 characters");
    });

    it.each([10, 64, 100])("accepts a secret of %i characters", (secretLength) => {
        expect(() => assertEventSubSecretConfigured("a".repeat(secretLength))).not.toThrow();
    });

    it("never puts the secret in the error message", () => {
        const tooShortSecret = "short-one";
        expect(() => assertEventSubSecretConfigured(tooShortSecret)).toThrow(expect.objectContaining({
            message: expect.not.stringContaining(tooShortSecret),
        }));
    });
});
