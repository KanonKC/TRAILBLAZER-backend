// Webhook paths shared by the EventSub definitions (what Twitch is told to call) and the Fastify route registration,
// so the two can never drift apart.
export const CHANNEL_REDEMPTION_ADD_V1_ROUTE = "/webhook/v1/twitch/event-sub/channel-redemption-add";
export const CHANNEL_REDEMPTION_ADD_V2_ROUTE = "/webhook/v2/twitch/event-sub/channel-redemption-add";
