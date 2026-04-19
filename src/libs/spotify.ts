import config from "@/config";
import { SpotifyApi } from "@spotify/web-api-ts-sdk";

const clientId = config.spotify.clientId
const clientSecret = config.spotify.clientSecret

const spotifyAPI = SpotifyApi.withClientCredentials(clientId, clientSecret, ["user-modify-playback-state"])

export { spotifyAPI }