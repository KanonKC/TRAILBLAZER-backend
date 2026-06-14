import Configurations from "@/config/index";
import TLogger, { Layer } from "@/logging/logger";
import LinkedAccountRepository from "@/repositories/linkedAccount/linkedAccount.repository";
import { SpotifyApi } from "@spotify/web-api-ts-sdk";

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

        return SpotifyApi.withAccessToken(this.cfg.spotify.clientId, {
            access_token: "",
            token_type: "Bearer",
            expires_in: 0,
            refresh_token: refreshToken,
        })
    }

}