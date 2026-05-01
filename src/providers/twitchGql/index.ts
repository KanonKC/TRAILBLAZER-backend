import axios, { AxiosInstance } from "axios";
import Configurations from "@/config/index";
import { ExportVideoToYoutubeResponse, TwitchClipResponse } from "./response";
import { ExportVideoToYoutubeRequest } from "./request";
import AuthService from "@/services/auth/auth.service";

export default class TwitchGql {
    private readonly endpoint: string = "https://gql.twitch.tv/gql";
    private readonly api: AxiosInstance;
    private readonly cfg: Configurations;

    constructor(cfg: Configurations) {
        this.cfg = cfg;
        this.api = axios.create({
            baseURL: this.endpoint,
            headers: {
                "Client-ID": this.cfg.twitchGql.clientId
            }
        })
    }

    async getClip(slug: string): Promise<TwitchClipResponse> {
        const body = {
            "operationName": "VideoAccessToken_Clip",
            "variables": {
                "slug": slug
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": this.cfg.twitchGql.sha256Hash
                }
            }
        }
        const response = await this.api.post("/", body);
        return response.data;
    }

    async getClipProductionUrl(slug: string): Promise<string> {
        const response = await this.getClip(slug)
        const clipData = response.data.clip;
        const playbackToken = clipData.playbackAccessToken;
        const videoQualities = clipData.videoQualities;

        const distinctQuality = videoQualities.find(q => q.quality === "1080") || videoQualities[0];

        if (distinctQuality) {
            const sourceUrl = distinctQuality.sourceURL;
            const signature = playbackToken.signature;
            const token = encodeURIComponent(playbackToken.value);

            const finalLink = `${sourceUrl}?sig=${signature}&token=${token}`;
            return finalLink;
        } else {
            throw new Error("No suitable video quality found.");
        }
    }

    async exportVideosToYoutube(req: ExportVideoToYoutubeRequest[], token: string): Promise<ExportVideoToYoutubeResponse[]> {
        const body = req.map(r => ({
            "operationName": "YoutubeExportModal_ExportVideoToYoutube",
            "variables": {
                "input": {
                    "videoID": r.videoId,
                    "title": r.title,
                    "description": r.description || "",
                    "tags": r.tags || [],
                    "privacyStatus": r.privacyStatus || "PRIVATE",
                    "doSplit": r.doSplit || false
                }
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": this.cfg.twitchGql.exportVideo.sha256Hash
                }
            }
        }))
        const response = await this.api.post("/", body, {
            headers: {
                "Authorization": `OAuth ${token}`
            }
        });

        return response.data;
    }
}