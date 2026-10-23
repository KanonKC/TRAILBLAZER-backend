import type Configurations from "@/config/index";
import { configDotenv } from "dotenv";
import { Environment, makeEnvironment } from "./constants/environment";

configDotenv()

const environment = makeEnvironment(process.env.ENV || "")

const config: Configurations = {
    env: environment,
    origin: process.env.ORIGIN || "",
    rootDomain: process.env.ROOT_DOMAIN || "",
    cdnOrigin: process.env.CDN_ORIGIN || "",
    cdnBucketName: process.env.CDN_S3_BUCKET_NAME || "",
    jwtSecret: process.env.JWT_SECRET || "",
    cookieSecret: process.env.COOKIE_SECRET || "",
    frontendOrigin: process.env.FRONTEND_ORIGIN || "",
    twitch: {
        clientId: process.env.TWITCH_CLIENT_ID || "",
        clientSecret: process.env.TWITCH_CLIENT_SECRET || "",
        redirectUrl: process.env.TWITCH_REDIRECT_URL || "",
        defaultBotId: process.env.TWITCH_DEFAULT_BOT_ID || "",
        paymentChannelId: process.env.TWITCH_PAYMENT_CHANNEL_ID || "",
        eventSubHealthCheck: {
            // Explicit env var wins; otherwise on only for dev/prod so a local run never touches the shared Twitch app's subscriptions
            enabled: process.env.EVENTSUB_HEALTHCHECK_ENABLED
                ? process.env.EVENTSUB_HEALTHCHECK_ENABLED === "true"
                : environment !== Environment.Local,
            cron: process.env.EVENTSUB_HEALTHCHECK_CRON || "0 * * * *",
            // A stream counts as "started while the subscription was down" if it began within this window (interval + buffer)
            // Deleting subscriptions is opt-in: a wrong 'desired' set would otherwise unsubscribe live users
            deleteEnabled: process.env.EVENTSUB_HEALTHCHECK_DELETE_ENABLED === "true",
            liveLookbackMs: Number(process.env.EVENTSUB_HEALTHCHECK_LIVE_LOOKBACK_MS) || 65 * 60 * 1000
        }
    },
    twitchGql: {
        clientId: process.env.TWITCH_GQL_CLIENT_ID || "",
        sha256Hash: process.env.TWITCH_GQL_SHA256_HASH || "",
        exportVideo: {
            sha256Hash: process.env.TWITCH_GQL_EXPORT_VIDEO_SHA256_HASH || "",
            oAuth: process.env.TWITCH_GQL_EXPORT_VIDEO_OAUTH || ""
        }
    },
    sightengine: {
        apiUser: process.env.SIGHTENGINE_API_USER || "",
        apiSecret: process.env.SIGHTENGINE_API_SECRET || ""
    },
    admin: {
        jwtSecret: process.env.ADMIN_JWT_SECRET || "",
        frontendOrigin: process.env.ADMIN_FRONTEND_ORIGIN || "",
        cookieDomain: process.env.ADMIN_COOKIE_DOMAIN || "",
        bootstrapEmail: process.env.BOOTSTRAP_ADMIN_EMAIL || "",
        bootstrapName: process.env.BOOTSTRAP_ADMIN_NAME || "",
        bootstrapRole: process.env.BOOTSTRAP_ADMIN_ROLE || "ADMIN"
    },
    googleAdmin: {
        clientId: process.env.GOOGLE_ADMIN_CLIENT_ID || "",
        clientSecret: process.env.GOOGLE_ADMIN_CLIENT_SECRET || "",
        redirectUrl: process.env.GOOGLE_ADMIN_REDIRECT_URL || ""
    },
    youtube: {
        clientId: process.env.YOUTUBE_CLIENT_ID || "",
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET || "",
        redirectUrl: process.env.YOUTUBE_REDIRECT_URL || ""
    },
    discord: {
        clientId: process.env.DISCORD_CLIENT_ID || "",
        clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
        redirectUrl: process.env.DISCORD_REDIRECT_URL || ""
    },
    spotify: {
        clientId: process.env.SPOTIFY_CLIENT_ID || "",
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
        redirectUrl: process.env.SPOTIFY_REDIRECT_URL || ""
    },
    randomDbdPerk: {
        totalKillerPerkCount: Number(process.env.RANDOM_DBD_PERK_TOTAL_KILLER_PERK_COUNT) || 145,
        totalSurvivorPerkCount: Number(process.env.RANDOM_DBD_PERK_TOTAL_SURVIVOR_PERK_COUNT) || 180
    }
}

export default config;
