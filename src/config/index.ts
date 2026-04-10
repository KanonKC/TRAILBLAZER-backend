export default interface Configurations {
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
}