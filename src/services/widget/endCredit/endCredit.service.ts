import EndCreditRepository from "@/repositories/endCredit/endCredit.repository";
import { EndCreditWidget } from "@/repositories/endCredit/response";
import TLogger, { Layer } from "@/logging/logger";
import { CreateEndCreditServiceRequest } from "./request";
import UserRepository from "@/repositories/user/user.repository";
import { NotFoundError, BadRequestError } from "@/errors";
import WidgetService from "../widget.service";
import { randomBytes } from "node:crypto";
import { createESTransport, twitchAppAPI } from "@/libs/twurple";
import { EndCreditSubscriptionError } from "./error";

interface EndCreditEventSubscription {
    eventType: string;
    route: string;
    subscribe: (twitchId: string, transport: ReturnType<typeof createESTransport>) => Promise<unknown>;
}

const END_CREDIT_EVENT_SUBSCRIPTIONS: EndCreditEventSubscription[] = [
    {
        eventType: "channel.follow",
        route: "/webhook/v1/twitch/event-sub/channel-follow",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelFollowEvents(twitchId, transport),
    },
    {
        eventType: "channel.subscribe",
        route: "/webhook/v1/twitch/event-sub/channel-subscribe",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelSubscriptionEvents(twitchId, transport),
    },
    {
        eventType: "channel.raid",
        route: "/webhook/v1/twitch/event-sub/channel-raid",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelRaidEventsTo(twitchId, transport),
    },
    {
        eventType: "channel.bits.use",
        route: "/webhook/v1/twitch/event-sub/channel-bits-use",
        subscribe: (twitchId, transport) => twitchAppAPI.eventSub.subscribeToChannelBitsUseEvents(twitchId, transport),
    },
];

export default class EndCreditService {
    private readonly logger: TLogger;

    constructor(
        private readonly endCreditRepository: EndCreditRepository,
        private readonly userRepository: UserRepository,
        private readonly widgetService: WidgetService
    ) {
        this.logger = new TLogger(Layer.SERVICE);
    }

    async create(request: CreateEndCreditServiceRequest): Promise<EndCreditWidget> {
        this.logger.setContext("service.endCredit.create");
        this.logger.info({ message: "Creating end credit config", data: request });
        try {
            const user = await this.userRepository.get(request.userId);
            if (!user) {
                this.logger.warn({ message: "User not found for setup", data: request });
                throw new NotFoundError("User not found");
            }

            const existing = await this.endCreditRepository.getByOwnerId(user.id);
            if (existing) {
                this.logger.warn({ message: "End credit config already exists", data: request });
                throw new BadRequestError("End credit config already exists");
            }

            await this.subscribeToEndCreditEvents(user.twitch_id, user.id);

            const res = await this.endCreditRepository.create({
                twitch_id: user.twitch_id,
                owner_id: user.id,
                overlay_key: randomBytes(16).toString("hex"),
                followers_header: request.followers_header,
                subscribes_header: request.subscribes_header,
                raids_header: request.raids_header,
                bits_header: request.bits_header,
                viewers_header: request.viewers_header,
                is_show_viewer_avatars: request.is_show_viewer_avatars,
            });
            await this.widgetService.setInitialEnabled(res.widget_id, user.id);
            return res;
        } catch (error) {
            this.logger.error({ message: "Failed to create end credit widget", error: error as Error, data: request });
            throw error;
        }
    }

    private async subscribeToEndCreditEvents(twitchId: string, userId: string): Promise<void> {
        this.logger.setContext("service.endCredit.subscribeToEndCreditEvents");
        for (const { eventType, route, subscribe } of END_CREDIT_EVENT_SUBSCRIPTIONS) {
            try {
                const transport = createESTransport(route);
                await subscribe(twitchId, transport);
                this.logger.info({ message: "Subscribed to EventSub type", data: { userId, twitchId, eventType } });
            } catch (error) {
                this.logger.error({ message: "Failed to subscribe to EventSub type", error: error as Error, data: { userId, twitchId, eventType } });
                throw new EndCreditSubscriptionError(eventType);
            }
        }
    }
}
