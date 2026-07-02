import { TError } from "@/errors";

export class EndCreditSubscriptionError extends TError {
    constructor(eventType: string) {
        super({ message: `Failed to subscribe to Twitch EventSub type: ${eventType}`, status: 502 });
    }
}
