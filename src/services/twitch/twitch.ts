import { HelixCustomRewardData } from "@twurple/api/lib/interfaces/endpoints/channelPoints.external";
import { rawDataSymbol } from "@twurple/common";
import AuthService from "../auth/auth.service";
import { HelixUserData } from "@twurple/api/lib/interfaces/endpoints/user.external";
import { NotFoundError, TError } from "@/errors";
import { HelixErrorResponse } from "./response";
import { ListChannelRewardsOptions } from "./request";

export default class TwitchService {
    private readonly authService: AuthService;
    constructor(authService: AuthService) {
        this.authService = authService;
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

    async listChannelRewards(channelId: string, options?: ListChannelRewardsOptions): Promise<{
        data: HelixCustomRewardData[];
    }> {
        try {
            const twitchUserAPI = await this.authService.createTwitchUserAPI(channelId)
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

    async listUsers(userIds: string[]): Promise<{
        data: HelixUserData[];
    }> {
        try {
            const twitchUserAPI = await this.authService.createTwitchUserAPI(userIds[0])
            let res = await twitchUserAPI.users.getUsersByIds(userIds)
            return { data: res.map(r => r[rawDataSymbol]) }
        } catch (error) {
            throw await this.convertHelixError(error)
        }
    }

    async getUser(userId: string): Promise<HelixUserData> {
        try {
            const twitchUserAPI = await this.authService.createTwitchUserAPI(userId)
            let res = await twitchUserAPI.users.getUserById(userId)
            if (!res) {
                throw new NotFoundError("Twitch user not found")
            }
            return res[rawDataSymbol]
        } catch (error) {
            throw await this.convertHelixError(error)
        }
    }

    async getUserByName(channelId: string, userName: string): Promise<HelixUserData> {
        try {
            const twitchUserAPI = await this.authService.createTwitchUserAPI(channelId)
            let res = await twitchUserAPI.users.getUserByName(userName)
            if (!res) {
                throw new NotFoundError("Twitch user not found")
            }
            return res[rawDataSymbol]
        } catch (error) {
            throw await this.convertHelixError(error)
        }
    }
}