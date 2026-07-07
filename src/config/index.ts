import { Environment } from "@/constants/environment";

export default interface Configurations {
    env: Environment;
    origin: string;
    rootDomain: string;
    jwtSecret: string;
    cookieSecret: string;
    frontendOrigin: string;
    twitch: {
        clientId: string;
        clientSecret: string;
        redirectUrl: string;
        defaultBotId: string;
        paymentChannelId: string;
    }
    twitchGql: {
        clientId: string;
        sha256Hash: string;
        exportVideo: {
            sha256Hash: string;
            oAuth: string;
        }
    }
    sightengine: {
        apiUser: string;
        apiSecret: string;
    }
    admin: {
        apiKey: string;
    }
    youtube: {
        clientId: string;
        clientSecret: string;
        redirectUrl: string;
    }
    discord: {
        clientId: string;
        clientSecret: string;
        redirectUrl: string;
    }
    spotify: {
        clientId: string;
        clientSecret: string;
        redirectUrl: string;
    }
    randomDbdPerk: {
        totalKillerPerkCount: number;
        totalSurvivorPerkCount: number;
    }
}