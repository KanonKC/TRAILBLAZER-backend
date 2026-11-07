import { createHmac } from "crypto";
import fastify, { FastifyInstance } from "fastify";
import { CHANNEL_REDEMPTION_ADD_V2_ROUTE } from "../routePaths";
import TwitchChannelRedemptionAddEvent from "./channelRedemptionAdd.event";
import { registerChannelRedemptionAddV2Route } from "./channelRedemptionAdd.route";

const SECRET = "route-test-secret-0123456789";

const redemptionEvent = {
    id: "redemption-1",
    broadcaster_user_id: "100",
    reward: { id: "reward-1", title: "Reward", cost: 100, prompt: "" },
};

function buildSignedRequest(options: { secret?: string; messageType?: string; body?: object; timestamp?: string; rawBodyOverride?: string } = {}) {
    const rawBody = options.rawBodyOverride ?? JSON.stringify(options.body ?? { subscription: { id: "sub-1", status: "enabled" }, event: redemptionEvent });
    const messageId = "message-1";
    const timestamp = options.timestamp ?? new Date().toISOString();
    const signature = `sha256=${createHmac("sha256", options.secret ?? SECRET).update(messageId).update(timestamp).update(rawBody).digest("hex")}`;
    return {
        method: "POST" as const,
        url: CHANNEL_REDEMPTION_ADD_V2_ROUTE,
        headers: {
            "content-type": "application/json",
            "twitch-eventsub-message-id": messageId,
            "twitch-eventsub-message-timestamp": timestamp,
            "twitch-eventsub-message-signature": signature,
            "twitch-eventsub-message-type": options.messageType ?? "notification",
        },
        payload: rawBody,
    };
}

describe("signed channel redemption add route", () => {
    const randomDbdPerkService = { randomPerk: jest.fn() };
    const randomDBDKillerService = { randomizeKiller: jest.fn() };
    const randomPoolService = { redeem: jest.fn() };
    const redemptionClaimService = { claim: jest.fn() };
    let server: FastifyInstance;

    beforeEach(async () => {
        jest.clearAllMocks();
        redemptionClaimService.claim.mockResolvedValue(true);
        const event = new TwitchChannelRedemptionAddEvent(
            randomDbdPerkService as any,
            {} as any,
            randomDBDKillerService as any,
            randomPoolService as any,
            redemptionClaimService as any,
            SECRET,
        );
        server = fastify();
        registerChannelRedemptionAddV2Route(server, event.handleSigned.bind(event));
        // A route outside the signed scope, registered the way routes.ts registers the rest
        server.post("/plain-json", async (req) => ({ bodyType: typeof req.body, body: req.body }));
        await server.ready();
    });

    afterEach(async () => {
        await server.close();
    });

    function expectNothingPlayed() {
        expect(redemptionClaimService.claim).not.toHaveBeenCalled();
        expect(randomPoolService.redeem).not.toHaveBeenCalled();
        expect(randomDbdPerkService.randomPerk).not.toHaveBeenCalled();
        expect(randomDBDKillerService.randomizeKiller).not.toHaveBeenCalled();
    }

    it("returns 204 and runs the widgets for a correctly signed notification", async () => {
        const response = await server.inject(buildSignedRequest());
        expect(response.statusCode).toBe(204);
        expect(randomPoolService.redeem).toHaveBeenCalledWith(redemptionEvent, expect.any(String));
        expect(randomDbdPerkService.randomPerk).toHaveBeenCalledWith(redemptionEvent, expect.any(String));
        expect(randomDBDKillerService.randomizeKiller).toHaveBeenCalledWith(redemptionEvent, expect.any(String));
    });

    it("returns 403 and plays nothing for a signature made with the wrong secret", async () => {
        const response = await server.inject(buildSignedRequest({ secret: "attacker-secret-0123456789" }));
        expect(response.statusCode).toBe(403);
        expectNothingPlayed();
    });

    it("returns 403 and plays nothing when the body was altered after signing", async () => {
        const signedRequest = buildSignedRequest();
        const forgedBody = JSON.stringify({ subscription: { status: "enabled" }, event: { ...redemptionEvent, id: "forged" } });
        const response = await server.inject({ ...signedRequest, payload: forgedBody });
        expect(response.statusCode).toBe(403);
        expectNothingPlayed();
    });

    it("returns 403 and plays nothing when the signature headers are absent", async () => {
        const response = await server.inject({
            method: "POST",
            url: CHANNEL_REDEMPTION_ADD_V2_ROUTE,
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({ subscription: { status: "enabled" }, event: redemptionEvent }),
        });
        expect(response.statusCode).toBe(403);
        expectNothingPlayed();
    });

    it("returns 403 and plays nothing for a correctly signed but stale delivery", async () => {
        const staleTimestamp = new Date(Date.now() - 11 * 60 * 1000).toISOString();
        const response = await server.inject(buildSignedRequest({ timestamp: staleTimestamp }));
        expect(response.statusCode).toBe(403);
        expectNothingPlayed();
    });

    it("answers a signed verification request with the challenge as plain text", async () => {
        const response = await server.inject(buildSignedRequest({
            messageType: "webhook_callback_verification",
            body: { challenge: "pogchamp-kappa-360noscope-vohiyo", subscription: { status: "webhook_callback_verification_pending" } },
        }));
        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toContain("text/plain");
        expect(response.body).toBe("pogchamp-kappa-360noscope-vohiyo");
        expectNothingPlayed();
    });

    it("does not answer a forged verification request", async () => {
        const response = await server.inject(buildSignedRequest({
            secret: "attacker-secret-0123456789",
            messageType: "webhook_callback_verification",
            body: { challenge: "forged" },
        }));
        expect(response.statusCode).toBe(403);
        expect(response.body).not.toContain("forged");
    });

    it("acknowledges a signed revocation with 2xx and plays nothing", async () => {
        const response = await server.inject(buildSignedRequest({
            messageType: "revocation",
            body: { subscription: { id: "sub-1", status: "authorization_revoked" } },
        }));
        expect(response.statusCode).toBe(204);
        expectNothingPlayed();
    });

    it("acknowledges an unknown signed message type with 2xx and plays nothing", async () => {
        const response = await server.inject(buildSignedRequest({ messageType: "something_new" }));
        expect(response.statusCode).toBe(204);
        expectNothingPlayed();
    });

    it("rejects a signed notification that carries no event", async () => {
        const response = await server.inject(buildSignedRequest({ body: { subscription: { status: "enabled" } } }));
        expect(response.statusCode).toBe(400);
        expectNothingPlayed();
    });

    it("rejects a signed body that is not JSON", async () => {
        const response = await server.inject(buildSignedRequest({ rawBodyOverride: "{not json" }));
        expect(response.statusCode).toBe(400);
        expectNothingPlayed();
    });

    it("skips the claimed widgets for a duplicate delivery, but still acknowledges it", async () => {
        redemptionClaimService.claim.mockResolvedValue(false);
        const response = await server.inject(buildSignedRequest());
        expect(response.statusCode).toBe(204);
        expect(redemptionClaimService.claim).toHaveBeenCalledWith("redemption-1", expect.any(String));
        expect(randomPoolService.redeem).not.toHaveBeenCalled();
        expect(randomDbdPerkService.randomPerk).not.toHaveBeenCalled();
        expect(randomDBDKillerService.randomizeKiller).not.toHaveBeenCalled();
    });

    it("keeps parsing JSON on routes outside the signed scope", async () => {
        const response = await server.inject({
            method: "POST",
            url: "/plain-json",
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({ hello: "world" }),
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ bodyType: "object", body: { hello: "world" } });
    });
});
