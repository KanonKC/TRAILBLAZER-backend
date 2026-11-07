import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CHANNEL_REDEMPTION_ADD_V2_ROUTE } from "../routePaths";

/**
 * Registers the signed redemption route in its own encapsulated Fastify scope.
 *
 * Signature verification needs the exact bytes Twitch sent, so this scope hands the handler the body as a Buffer
 * instead of letting Fastify parse it. Because the parser lives in a child scope, every other route keeps the
 * default JSON parsing.
 */
export function registerChannelRedemptionAddV2Route(
    server: FastifyInstance,
    handler: (req: FastifyRequest, res: FastifyReply) => Promise<unknown>,
) {
    server.register(async (signedScope) => {
        signedScope.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
        signedScope.post(CHANNEL_REDEMPTION_ADD_V2_ROUTE, handler);
    });
}
