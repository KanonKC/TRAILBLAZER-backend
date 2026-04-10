import type Configurations from "@/config/index";
import { configDotenv } from "dotenv";

configDotenv()

const config: Configurations = {
    origin: process.env.ORIGIN || "",
    rootDomain: process.env.ROOT_DOMAIN || "",
    jwtSecret: process.env.JWT_SECRET || "",
    cookieSecret: process.env.COOKIE_SECRET || "",
    frontendOrigin: process.env.FRONTEND_ORIGIN || "",
    twitch: {
        clientId: process.env.TWITCH_CLIENT_ID || "",
        clientSecret: process.env.TWITCH_CLIENT_SECRET || "",
        redirectUrl: process.env.TWITCH_REDIRECT_URL || "",
        defaultBotId: process.env.TWITCH_DEFAULT_BOT_ID || "",
        paymentChannelId: process.env.TWITCH_PAYMENT_CHANNEL_ID || ""
    },
    twitchGql: {
        clientId: process.env.TWITCH_GQL_CLIENT_ID || "",
        sha256Hash: process.env.TWITCH_GQL_SHA256_HASH || ""
    },
    sightengine: {
        apiUser: process.env.SIGHTENGINE_API_USER || "",
        apiSecret: process.env.SIGHTENGINE_API_SECRET || ""
    },
    admin: {
        apiKey: process.env.ADMIN_API_KEY || ""
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
    }
}

export default config;
