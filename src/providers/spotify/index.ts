import Configurations from "@/config/index";
import TLogger, { Layer } from "@/logging/logger";
import LinkedAccountRepository from "@/repositories/linkedAccount/linkedAccount.repository";
import { AccessToken, SpotifyApi } from "@spotify/web-api-ts-sdk";
import axios from "axios";
import { SpotifyTokenResponse } from "./response";

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

        const url = "https://accounts.spotify.com/api/token";

        const payload = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: this.cfg.spotify.clientId
            },
        }

        const response = await axios.post<SpotifyTokenResponse>(url, payload)
        const accessToken = response.data.access_token as unknown as AccessToken

        const spotifyApi = SpotifyApi.withAccessToken(this.cfg.spotify.clientId, accessToken)

        return spotifyApi
    }


}