import { WidgetTypeSlug } from "@/services/constant";
import { WIDGET_EVENT_TYPES } from "./constant";
import { TWITCH_EVENT_DEFINITIONS } from "./events";

jest.mock("@/libs/twurple", () => ({ twitchAppAPI: { eventSub: {} }, createESTransport: jest.fn() }));

describe("twitch constant", () => {
    it("maps every widget type slug", () => {
        Object.values(WidgetTypeSlug).forEach(slug => expect(WIDGET_EVENT_TYPES[slug]).toBeDefined());
    });

    it("only maps to event types that have a subscribe definition", () => {
        const known = new Set(TWITCH_EVENT_DEFINITIONS.map(definition => definition.type));
        Object.values(WIDGET_EVENT_TYPES).flat().forEach(eventType => expect(known.has(eventType)).toBe(true));
    });
});
