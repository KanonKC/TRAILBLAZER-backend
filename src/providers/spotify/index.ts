import Configurations from "@/config/index";
import TLogger, { Layer } from "@/logging/logger";
import LinkedAccountRepository from "@/repositories/linkedAccount/linkedAccount.repository";
import { AccessToken, SpotifyApi } from "@spotify/web-api-ts-sdk";
import axios from "axios";

export default class Spotify {

    private readonly cfg: Configurations
    private readonly linkedAccountRepository: LinkedAccountRepository
    private readonly logger: TLogger

    constructor(
        cfg: Configurations,
        linkedAccountRepository: LinkedAccountRepository
    ) {
        this.cfg = cfg
        this.linkedAccountRepository = linkedAccountRepository
        this.logger = new TLogger(Layer.PROVIDER)
    }

    async createUserAPI(userId: string, transactionId?: string): Promise<SpotifyApi> {
        const logger = this.logger.setContext("provider.spotify.createUserAPI", transactionId)
        logger.info({ message: "Creating user Spotify API", data: { userId } })

        const linkedAccount = await this.linkedAccountRepository.getByUserIdAndPlatform(userId, "spotify", transactionId)
        const refreshToken = linkedAccount?.refresh_token
        if (!refreshToken) {
            logger.warn({ message: "No refresh token found", data: { userId } })
            throw new Error("No refresh token found")
        }

        const auth = await this.refresh(refreshToken, transactionId)
        logger.info({ message: "Created user Spotify API", data: { userId } })
        return SpotifyApi.withAccessToken(this.cfg.spotify.clientId, auth)
    }

    async refresh(token: string, transactionId?: string): Promise<AccessToken> {
        const logger = this.logger.setContext("provider.spotify.refresh", transactionId)
        const authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            form: {
                refresh_token: token,
                client_id: this.cfg.spotify.clientId,
                grant_type: 'refresh_token'
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' +
                    (Buffer.from(this.cfg.spotify.clientId + ':' + this.cfg.spotify.clientSecret).toString('base64'))
            },
            json: true
        };

        let response;
        try {
            response = await axios.post<AccessToken>(authOptions.url, authOptions.form, {
                headers: authOptions.headers
            })
            logger.info({ message: "Spotify access token refreshed" })
        } catch (error) {
            logger[axios.isAxiosError(error) && error.response?.status && error.response.status >= 400 && error.response.status < 500 ? "warn" : "error"]({ message: "Failed to refresh Spotify access token", error: error as Error })
            throw error
        }

        // Spotify doesn't always return a new refresh_token on refresh; preserve the original
        // so the SDK's auto-refresh mechanism can use it if the access token expires mid-session.
        return {
            ...response.data,
            refresh_token: response.data.refresh_token ?? token,
        }
    }

}
