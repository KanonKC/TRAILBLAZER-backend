import { Track } from "@spotify/web-api-ts-sdk";

export interface InsertSpotifyTrackResponse {
    name: string
    artists: string[]
    url: string
}