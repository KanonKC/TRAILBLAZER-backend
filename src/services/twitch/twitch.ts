import { HelixCustomRewardData } from "@twurple/api/lib/interfaces/endpoints/channelPoints.external";
import { rawDataSymbol } from "@twurple/common";
import AuthService from "../auth/auth.service";
import { HelixUserData } from "@twurple/api/lib/interfaces/endpoints/user.external";
import { NotFoundError, TError } from "@/errors";
import { HelixErrorResponse } from "./response";
import { ListChannelRewardsOptions } from "./request";
import { HelixEventSubSubscriptionData } from "@twurple/api/lib/interfaces/endpoints/eventSub.external";
import { createESTransport, twitchAppAPI } from "@/libs/twurple";
import { TWITCH_EVENT_DEFINITIONS } from "./events";
import TLogger, { Layer } from "@/logging/logger";

export default class TwitchService {
    private readonly authService: AuthService;
    private readonly logger: TLogger;
    constructor(authService: AuthService) {
        this.authService = authService;
        this.logger = new TLogger(Layer.SERVICE);
    }

    async convertHelixError(error: unknown): Promise<TError> {
        const errorString = String(error)
        const errorJson: HelixErrorResponse = JSON.parse(errorString.split("\n").pop() || "{}")
        return new TError({
            message: errorJson.message,
            status: errorJson.status,
            error_code: errorJson.status.toString(),
        })
    }

    async listChannelRewards(channelId: string, options?: ListChannelRewardsOptions, transactionId?: string): Promise<{
        data: HelixCustomRewardData[];
    }> {
        try {
            const twitchUserAPI = await this.authService.createTwitchUserAPI(channelId, transactionId)
            let res = await twitchUserAPI.channelPoints.getCustomRewards(channelId)
            if (options?.userInputRequired) {
                res = res.filter(r => r.userInputRequired)
            }
            res = res.sort((a, b) => a.cost - b.cost)
            return { data: res.map(r => r[rawDataSymbol]) }
        } catch (error) {
            throw await this.convertHelixError(error)
        }
    }

    async listUsers(userIds: string[], transactionId?: string): Promise<{
        data: HelixUserData[];
    }> {
        try {
            const twitchUserAPI = await this.authService.createTwitchUserAPI(userIds[0], transactionId)
            let res = await twitchUserAPI.users.getUsersByIds(userIds)
            return { data: res.map(r => r[rawDataSymbol]) }
        } catch (error) {
            throw await this.convertHelixError(error)
        }
    }

    async getUser(userId: string, transactionId?: string): Promise<HelixUserData> {
        try {
            const twitchUserAPI = await this.authService.createTwitchUserAPI(userId, transactionId)
            let res = await twitchUserAPI.users.getUserById(userId)
            if (!res) {
                throw new NotFoundError("Twitch user not found")
            }
            return res[rawDataSymbol]
        } catch (error) {
            throw await this.convertHelixError(error)
        }
    }

    async getUserByName(channelId: string, userName: string, transactionId?: string): Promise<HelixUserData> {
        try {
            const twitchUserAPI = await this.authService.createTwitchUserAPI(channelId, transactionId)
            let res = await twitchUserAPI.users.getUserByName(userName)
            if (!res) {
                throw new NotFoundError("Twitch user not found")
            }
            return res[rawDataSymbol]
        } catch (error) {
            throw await this.convertHelixError(error)
        }
    }

    async listEventSubs(twitchId: string): Promise<{
        data: HelixEventSubSubscriptionData[];
    }> {
        try {
            const res = await twitchAppAPI.eventSub.getSubscriptionsForUser(twitchId)
            return { data: res.data.map(r => r[rawDataSymbol]) }
        } catch (error) {
            throw await this.convertHelixError(error)
        }
    }

    listEventDefinitions(): { data: { type: string; route: string }[] } {
        return { data: TWITCH_EVENT_DEFINITIONS.map(({ type, route }) => ({ type, route })) }
    }

    async subscribeEvent(twitchId: string, type: string, transactionId?: string): Promise<void> {
        const logger = this.logger.setContext("service.twitch.subscribeEvent", transactionId);
        const definition = TWITCH_EVENT_DEFINITIONS.find(d => d.type === type)
        if (!definition) {
            throw new NotFoundError("Twitch event type not found")
        }
        try {
            const existing = await twitchAppAPI.eventSub.getSubscriptionsForUser(twitchId)
            if (existing.data.some(sub => sub.type === type && sub.status === "enabled")) {
                logger.info({ message: "Event already subscribed", data: { twitchId, type } })
                return
            }
            await definition.subscribe(twitchId, createESTransport(definition.route))
            logger.info({ message: "Subscribed to event", data: { twitchId, type } })
        } catch (error) {
            logger.error({ message: "Failed to subscribe to event", data: { twitchId, type }, error: error as Error })
            throw await this.convertHelixError(error)
        }
    }

    async unsubscribeEvent(twitchId: string, type: string, transactionId?: string): Promise<void> {
        const logger = this.logger.setContext("service.twitch.unsubscribeEvent", transactionId);
        try {
            const existing = await twitchAppAPI.eventSub.getSubscriptionsForUser(twitchId)
            const targets = existing.data.filter(sub => sub.type === type)
            await Promise.all(targets.map(sub => twitchAppAPI.eventSub.deleteSubscription(sub.id)))
            logger.info({ message: "Unsubscribed from event", data: { twitchId, type, count: targets.length } })
        } catch (error) {
            logger.error({ message: "Failed to unsubscribe from event", data: { twitchId, type }, error: error as Error })
            throw await this.convertHelixError(error)
        }
    }
}