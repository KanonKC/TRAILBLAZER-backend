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
        this.logger = new TLogger(Layer.SERVICE)
    }

    async createUserAPI(userId: string): Promise<SpotifyApi> {
        this.logger.setContext("provider.spotify.createUserAPI")
        this.logger.info({ message: "Creating user Spotify API", data: { userId } })

        const linkedAccount = await this.linkedAccountRepository.getByUserIdAndPlatform(userId, "spotify")
        const refreshToken = linkedAccount?.refresh_token
        if (!refreshToken) {
            this.logger.error({ message: "No refresh token found", data: { userId } })
            throw new Error("No refresh token found")
        }

        const auth = await this.refresh(refreshToken)

        return SpotifyApi.withAccessToken(this.cfg.spotify.clientId, auth)
    }

    async refresh(token: string): Promise<AccessToken> {
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

        const response = await axios.post<AccessToken>(authOptions.url, authOptions.form, {
            headers: authOptions.headers
        })

        // Spotify doesn't always return a new refresh_token on refresh; preserve the original
        // so the SDK's auto-refresh mechanism can use it if the access token expires mid-session.
        return {
            ...response.data,
            refresh_token: response.data.refresh_token ?? token,
        }
    }

}