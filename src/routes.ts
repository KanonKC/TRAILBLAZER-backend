import fastify from "fastify";
import config from "./config";
import ClipShoutoutController from "./controllers/clipShoutout/clipShoutout.controller";
import FirstWordController from "./controllers/firstWord/firstWord.controller";
import RandomDbdPerkController from "./controllers/randomDbdPerk/randomDbdPerk.controller";
import RandomDBDKillerController from "./controllers/randomDBDKiller/randomDBDKiller.controller";
import RandomDBDKillerEventController from "./controllers/randomDBDKiller/randomDBDKiller.event.controller";
import DBDKillerMasterController from "./controllers/dbdKillerMaster/dbdKillerMaster.controller";
import WidgetTypeController from "./controllers/widgetType/widgetType.controller";
import UserController from "./controllers/user/user.controller";
import ExportVideoController from "./controllers/exportVideo/exportVideo.controller";
import AdminController from "./controllers/admin/admin.controller";
import WidgetController from "./controllers/widget/widget.controller";
import DropImageController from "./controllers/dropImage/dropImage.controller";
import TwitchChannelChatMessageEvent from "./events/twitch/channelChatMessage/channelChatMessage.event";
import UploadedFileController from "./controllers/uploadedFile/uploadedFile.controller";
import ExportVideoRepository from "./repositories/exportVideo/exportVideo.repository";
import TwitchChannelChatNotificationEvent from "./events/twitch/channelChatNotification/channelChatNotification.event";
import FirstWordRepository from "./repositories/firstWord/firstWord.repository";
import RandomDbdPerkRepository from "./repositories/randomDbdPerk/randomDbdPerk.repository";
import RandomDBDKillerRepository from "./repositories/randomDBDKiller/randomDBDKiller.repository";
import DBDKillerMasterRepository from "./repositories/dbdKillerMaster/dbdKillerMaster.repository";
import WidgetTypeRepository from "./repositories/widgetType/widgetType.repository";
import UserRepository from "./repositories/user/user.repository";
import WidgetRepository from "./repositories/widget/widget.repository";
import DropImageRepository from "./repositories/dropImage/dropImage.repository";
import { UploadedFileRepository } from "./repositories/uploadedFile/uploadedFile.repository";
import ReferralRepository from "./repositories/referral/referral.repository";
import ClipShoutoutService from "./services/widget/clipShoutout/clipShoutout.service";
import FirstWordService from "./services/widget/firstWord/firstWord.service";
import RandomDbdPerkService from "./services/widget/randomDbdPerk/randomDbdPerk.service";
import RandomDBDKillerService from "./services/widget/randomDBDKiller/randomDBDKiller.service";
import UserService from "./services/user/user.service";
import WidgetService from "./services/widget/widget.service";
import DropImageService from "./services/widget/dropImage/dropImage.service";
import ExportVideoService from "./services/widget/exportVideo/exportVideo.service";
import { UploadedFileService } from "./services/uploadedFile/uploadedFile.service";
import ReferralService from "./services/referral/referral.service";
import SpotifySongRequestRepository from "./repositories/spotifySongRequest/spotifySongRequest.repository";
import SpotifySongRequestService from "./services/widget/spotifySongRequest/spotifySongRequest.service";
import SpotifySongRequestController from "./controllers/spotifySongRequest/spotifySongRequest.controller";
import SpotifyProvider from "./providers/spotify/index";
import EndCreditRepository from "./repositories/endCredit/endCredit.repository";
import EndCreditService from "./services/widget/endCredit/endCredit.service";
import EndCreditController from "./controllers/endCredit/endCredit.controller";

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { FastifySSEPlugin } from "fastify-sse-v2";
import ClipShoutoutEventController from "./controllers/clipShoutout/clipShoutout.event.controller";
import DropImageEventController from "./controllers/dropImage/dropImage.event.controller";
import EndCreditEventController from "./controllers/endCredit/endCredit.event.controller";
import FirstWordEventController from "./controllers/firstWord/firstWord.event.controller";
import SystemController from "./controllers/system/system.controller";
import TwitchController from "./controllers/twitch/twitch.controller";
import TwitchGqlController from "./controllers/twitch/twitch-gql.controller";
import TwitchChannelRedemptionAddEvent from "./events/twitch/channelRedemptionAdd/channelRedemptionAdd.event";
import TwitchStreamOnlineEvent from "./events/twitch/streamOnline/streamOnline.event";
import TwitchStreamOfflineEvent from "./events/twitch/streamOffline/streamOffline.event";
import TwitchChannelFollowEvent from "./events/twitch/channelFollow/channelFollow.event";
import TwitchChannelSubscribeEvent from "./events/twitch/channelSubscribe/channelSubscribe.event";
import TwitchChannelRaidEvent from "./events/twitch/channelRaid/channelRaid.event";
import TwitchChannelBitsUseEvent from "./events/twitch/channelBitsUse/channelBitsUse.event";
import TwitchGql from "./providers/twitchGql";
import AuthRepository from "./repositories/auth/auth.repository";
import ClipShoutoutRepository from "./repositories/clipShoutout/clipShoutout.repository";
import AuthService from "./services/auth/auth.service";
import SystemService from "./services/system/system.service";
import TwitchService from "./services/twitch/twitch";
import Sightengine from "./providers/sightengine";
import AuthController from "./controllers/auth/auth.controller";
import LinkedAccountController from "./controllers/linkedAccount/linkedAccount.controller";
import LinkedAccountRepository from "./repositories/linkedAccount/linkedAccount.repository";
import LinkedAccountService from "./services/linkedAccount/linkedAccount.service";
import { Google, Discord, Spotify } from "arctic";
import TbCron from "./cron";

// Providers
const twitchGql = new TwitchGql(config);
const sightengine = new Sightengine(config);
const googleOAuth = new Google(config.youtube.clientId, config.youtube.clientSecret, config.youtube.redirectUrl);
const discordOAuth = new Discord(config.discord.clientId, config.discord.clientSecret, config.discord.redirectUrl);
const spotifyOAuth = new Spotify(config.spotify.clientId, config.spotify.clientSecret, config.spotify.redirectUrl);

// Repository Layer
const userRepository = new UserRepository();
const firstWordRepository = new FirstWordRepository();
const authRepository = new AuthRepository();

const clipShoutoutRepository = new ClipShoutoutRepository();
const dropImageRepository = new DropImageRepository();
const endCreditRepository = new EndCreditRepository();

const randomDbdPerkRepository = new RandomDbdPerkRepository();
const randomDBDKillerRepository = new RandomDBDKillerRepository();
const dbdKillerMasterRepository = new DBDKillerMasterRepository();
const widgetTypeRepository = new WidgetTypeRepository();
const widgetRepository = new WidgetRepository();
const uploadedFileRepository = new UploadedFileRepository();
const linkedAccountRepository = new LinkedAccountRepository();
const exportVideoRepository = new ExportVideoRepository();
const referralRepository = new ReferralRepository();

// Service Layer
const systemService = new SystemService();
const authService = new AuthService(config, authRepository, userRepository);
const userService = new UserService(config, userRepository, authRepository, authService);
const referralService = new ReferralService(referralRepository, userService);
userService.setReferralService(referralService);
const widgetService = new WidgetService(widgetRepository, userService, userRepository);
userService.setWidgetService(widgetService);
const firstWordService = new FirstWordService(config, firstWordRepository, userRepository, widgetService);

const clipShoutoutService = new ClipShoutoutService(config, clipShoutoutRepository, userRepository, authService, twitchGql, widgetService);
const dropImageService = new DropImageService(dropImageRepository, userRepository, sightengine, widgetService);
const endCreditService = new EndCreditService(endCreditRepository, userRepository, widgetService, authService);

const randomDbdPerkService = new RandomDbdPerkService(randomDbdPerkRepository, userRepository, widgetService);
const randomDBDKillerService = new RandomDBDKillerService(randomDBDKillerRepository, dbdKillerMasterRepository, userRepository, widgetService);
const uploadedFileService = new UploadedFileService(config, uploadedFileRepository, userService);
const twitchService = new TwitchService(authService);
const linkedAccountService = new LinkedAccountService(config, linkedAccountRepository, googleOAuth, discordOAuth, spotifyOAuth);
const exportVideoService = new ExportVideoService(exportVideoRepository, userService, authService, widgetService, twitchGql);
const spotifyProvider = new SpotifyProvider(config, linkedAccountRepository);
const spotifySongRequestRepository = new SpotifySongRequestRepository();
const spotifySongRequestService = new SpotifySongRequestService(spotifySongRequestRepository, userRepository, spotifyProvider, widgetService, authService);

// Controller Layer
const systemController = new SystemController(systemService);
const authController = new AuthController(authService);
const userController = new UserController(config, userService, referralService);
const adminController = new AdminController(userService);
const firstWordEventController = new FirstWordEventController(firstWordService);
const firstWordController = new FirstWordController(firstWordService, firstWordEventController);
const clipShoutoutEventController = new ClipShoutoutEventController(clipShoutoutService);

const clipShoutoutController = new ClipShoutoutController(clipShoutoutService, clipShoutoutEventController);
const dropImageController = new DropImageController(dropImageService);
const endCreditController = new EndCreditController(endCreditService);
const dropImageEventController = new DropImageEventController(widgetService);
const endCreditEventController = new EndCreditEventController(widgetService);
const randomDbdPerkController = new RandomDbdPerkController(randomDbdPerkService);
const randomDBDKillerController = new RandomDBDKillerController(randomDBDKillerService);
const randomDBDKillerEventController = new RandomDBDKillerEventController(widgetService);
const dbdKillerMasterController = new DBDKillerMasterController(dbdKillerMasterRepository);
const widgetTypeController = new WidgetTypeController(widgetTypeRepository);
const widgetController = new WidgetController(widgetService);
const uploadedFileController = new UploadedFileController(uploadedFileService);
const twitchController = new TwitchController(twitchService);
const linkedAccountController = new LinkedAccountController(linkedAccountService);
const twitchGqlController = new TwitchGqlController(twitchGql);
const exportVideoController = new ExportVideoController(exportVideoService);
const spotifySongRequestController = new SpotifySongRequestController(spotifySongRequestService);

// Event Layer
const twitchChannelChatMessageEvent = new TwitchChannelChatMessageEvent(firstWordService, dropImageService, spotifySongRequestService)
const twitchStreamOnlineEvent = new TwitchStreamOnlineEvent(firstWordService, endCreditService);
const twitchStreamOfflineEvent = new TwitchStreamOfflineEvent(exportVideoService);
const twitchChannelChatNotificationEvent = new TwitchChannelChatNotificationEvent(clipShoutoutService);
const twitchChannelRedemptionAddEvent = new TwitchChannelRedemptionAddEvent(randomDbdPerkService, dropImageService, randomDBDKillerService);
const twitchChannelFollowEvent = new TwitchChannelFollowEvent(endCreditService);
const twitchChannelSubscribeEvent = new TwitchChannelSubscribeEvent(endCreditService);
const twitchChannelRaidEvent = new TwitchChannelRaidEvent(endCreditService);
const twitchChannelBitsUseEvent = new TwitchChannelBitsUseEvent(endCreditService);

// Cron
const tbCron = new TbCron(userService, linkedAccountService)


const server = fastify();

server.register(cors, {
    origin: true, // Allow all origins (overlay SSE endpoints use key-based auth)
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]
})

server.register(multipart)

server.register(cookie, {
    secret: config.cookieSecret,
    parseOptions: {}
});


server.get("/health", systemController.health.bind(systemController))

server.put("/api/v1/admin/users/:id", adminController.updateUser.bind(adminController))
server.post("/api/v1/admin/bulk-adjust-tier", adminController.bulkAdjustTierAndWidgets.bind(adminController))

server.get("/api/v1/login", userController.login.bind(userController))
server.get("/api/v1/user/me", userController.me.bind(userController))
server.get("/api/v1/user/tier", userController.getTier.bind(userController))
server.get("/api/v1/user/referral-status", userController.getReferralStatus.bind(userController))
server.get("/api/v1/users/showcase", userController.listShowcase.bind(userController))
server.post("/api/v1/logout", authController.logout.bind(authController))
server.post("/api/v1/auth/twitch-gql-token", authController.syncTwitchGqlToken.bind(authController))
server.post("/api/v1/refresh-token", userController.refresh.bind(userController))

server.post("/api/v1/first-word", firstWordController.create.bind(firstWordController));
server.get("/api/v1/first-word", firstWordController.get.bind(firstWordController));
server.put("/api/v1/first-word", firstWordController.update.bind(firstWordController));
server.post("/api/v1/first-word/refresh-key", firstWordController.refreshKey.bind(firstWordController));
server.delete("/api/v1/first-word", firstWordController.delete.bind(firstWordController));
server.post("/api/v1/first-word/chatters/reset", firstWordController.resetChatters.bind(firstWordController));
server.get("/api/v1/first-word/chatters", firstWordController.listChatters.bind(firstWordController));

server.post("/api/v1/first-word/custom-replies", firstWordController.createCustomReply.bind(firstWordController));
server.get("/api/v1/first-word/custom-replies", firstWordController.listCustomReplies.bind(firstWordController));
server.put("/api/v1/first-word/custom-replies/:id", firstWordController.updateCustomReply.bind(firstWordController));
server.delete("/api/v1/first-word/custom-replies/:id", firstWordController.deleteCustomReply.bind(firstWordController));

server.post("/api/v1/clip-shoutout", clipShoutoutController.create.bind(clipShoutoutController));
server.get("/api/v1/clip-shoutout", clipShoutoutController.get.bind(clipShoutoutController));
server.put("/api/v1/clip-shoutout", clipShoutoutController.update.bind(clipShoutoutController));
server.post("/api/v1/clip-shoutout/refresh-key", clipShoutoutController.refreshKey.bind(clipShoutoutController));

server.delete("/api/v1/clip-shoutout", clipShoutoutController.delete.bind(clipShoutoutController));

server.post("/api/v1/random-dbd-perk", randomDbdPerkController.create.bind(randomDbdPerkController));
server.get("/api/v1/random-dbd-perk", randomDbdPerkController.get.bind(randomDbdPerkController));
server.put("/api/v1/random-dbd-perk", randomDbdPerkController.update.bind(randomDbdPerkController));
server.post("/api/v1/random-dbd-perk/refresh-key", randomDbdPerkController.refreshKey.bind(randomDbdPerkController));
server.delete("/api/v1/random-dbd-perk", randomDbdPerkController.delete.bind(randomDbdPerkController));

server.post("/api/v1/random-dbd-killer", randomDBDKillerController.create.bind(randomDBDKillerController));
server.get("/api/v1/random-dbd-killer", randomDBDKillerController.get.bind(randomDBDKillerController));
server.put("/api/v1/random-dbd-killer", randomDBDKillerController.update.bind(randomDBDKillerController));
server.post("/api/v1/random-dbd-killer/refresh-key", randomDBDKillerController.refreshKey.bind(randomDBDKillerController));
server.delete("/api/v1/random-dbd-killer", randomDBDKillerController.delete.bind(randomDBDKillerController));

server.get("/api/v1/dbd-killer-master", dbdKillerMasterController.list.bind(dbdKillerMasterController));
server.get("/api/v1/widget-types", widgetTypeController.list.bind(widgetTypeController));

server.post("/api/v1/drop-image", dropImageController.create.bind(dropImageController));
server.get("/api/v1/drop-image", dropImageController.get.bind(dropImageController));
server.put("/api/v1/drop-image", dropImageController.update.bind(dropImageController));
server.post("/api/v1/drop-image/refresh-key", dropImageController.refreshKey.bind(dropImageController));
server.delete("/api/v1/drop-image", dropImageController.delete.bind(dropImageController));

server.post("/api/v1/end-credit", endCreditController.create.bind(endCreditController));
server.get("/api/v1/end-credit", endCreditController.get.bind(endCreditController));
server.put("/api/v1/end-credit", endCreditController.update.bind(endCreditController));
server.post("/api/v1/end-credit/refresh-key", endCreditController.refreshKey.bind(endCreditController));
server.delete("/api/v1/end-credit", endCreditController.delete.bind(endCreditController));
server.post("/api/v1/end-credit/test", endCreditController.test.bind(endCreditController));

server.post("/api/v1/spotify-song-request", spotifySongRequestController.create.bind(spotifySongRequestController));
server.get("/api/v1/spotify-song-request", spotifySongRequestController.get.bind(spotifySongRequestController));
server.put("/api/v1/spotify-song-request", spotifySongRequestController.update.bind(spotifySongRequestController));
server.delete("/api/v1/spotify-song-request", spotifySongRequestController.delete.bind(spotifySongRequestController));
server.post("/api/v1/spotify-song-request/test", spotifySongRequestController.test.bind(spotifySongRequestController));

server.post("/api/v1/export-video", exportVideoController.create.bind(exportVideoController));
server.get("/api/v1/export-video", exportVideoController.get.bind(exportVideoController));
server.put("/api/v1/export-video", exportVideoController.update.bind(exportVideoController));
server.delete("/api/v1/export-video", exportVideoController.delete.bind(exportVideoController));
server.post("/api/v1/export-video/history", exportVideoController.createHistory.bind(exportVideoController));
server.get("/api/v1/export-video/history", exportVideoController.listHistory.bind(exportVideoController));
server.get("/api/v1/export-video/history/:historyId", exportVideoController.getHistory.bind(exportVideoController));
server.delete("/api/v1/export-video/history/:historyId", exportVideoController.deleteHistory.bind(exportVideoController));
server.post("/api/v1/export-video/test", exportVideoController.test.bind(exportVideoController));

server.get("/api/v1/widgets", widgetController.list.bind(widgetController));
server.get("/api/v1/widgets/first-enabled", widgetController.getFirstEnabled.bind(widgetController));
server.get("/api/v1/widgets/quota", widgetController.getQuota.bind(widgetController));
server.get("/api/v1/widgets/validate-overlay/:key", widgetController.validateOverlayAccess.bind(widgetController));
server.put("/api/v1/widgets/:id", widgetController.update.bind(widgetController));
server.patch("/api/v1/widgets/:id/enable", widgetController.updateEnable.bind(widgetController));
server.delete("/api/v1/widgets/:id", widgetController.delete.bind(widgetController));

server.get("/api/v1/uploaded-files/total-size", uploadedFileController.getTotalFileSize.bind(uploadedFileController));
server.post("/api/v1/uploaded-files", uploadedFileController.create.bind(uploadedFileController));
server.get("/api/v1/uploaded-files", uploadedFileController.list.bind(uploadedFileController));
server.get("/api/v1/uploaded-files/:id", uploadedFileController.get.bind(uploadedFileController));
server.put("/api/v1/uploaded-files/:id", uploadedFileController.update.bind(uploadedFileController));
server.delete("/api/v1/uploaded-files/:id", uploadedFileController.delete.bind(uploadedFileController));

server.get("/api/v1/twitch/channel-rewards", twitchController.listChannelRewards.bind(twitchController));
server.get("/api/v1/twitch/user", twitchController.getUser.bind(twitchController));
server.get("/api/v1/twitch/event-subs", twitchController.listEventSubs.bind(twitchController));
server.post("/api/v1/twitch/export-videos", twitchGqlController.exportVideoToYoutube.bind(twitchGqlController));

server.get("/api/v1/linked-accounts", linkedAccountController.list.bind(linkedAccountController));
server.post("/api/v1/linked-accounts/:platform/bind", linkedAccountController.bind.bind(linkedAccountController));
server.delete("/api/v1/linked-accounts/:platform", linkedAccountController.unbind.bind(linkedAccountController));

server.register(FastifySSEPlugin);
server.get("/api/v1/events/first-word/:userId", firstWordEventController.sse.bind(firstWordEventController));
server.get("/api/v1/events/clip-shoutout/:userId", clipShoutoutEventController.sse.bind(clipShoutoutEventController));
server.get("/api/v1/events/drop-image/:userId", dropImageEventController.sse.bind(dropImageEventController));
server.get("/api/v1/events/random-dbd-killer/:userId", randomDBDKillerEventController.sse.bind(randomDBDKillerEventController));
server.get("/api/v1/events/end-credit/:userId", endCreditEventController.sse.bind(endCreditEventController));
server.get("/api/v1/end-credit/:userId/records", endCreditController.getRecords.bind(endCreditController));

server.post("/webhook/v1/twitch/event-sub/channel-chat-message", twitchChannelChatMessageEvent.handle.bind(twitchChannelChatMessageEvent))
server.post("/webhook/v1/twitch/event-sub/stream-online", twitchStreamOnlineEvent.handle.bind(twitchStreamOnlineEvent))
server.post("/webhook/v1/twitch/event-sub/stream-offline", twitchStreamOfflineEvent.handle.bind(twitchStreamOfflineEvent))
server.post("/webhook/v1/twitch/event-sub/channel-chat-notification", twitchChannelChatNotificationEvent.handle.bind(twitchChannelChatNotificationEvent))
server.post("/webhook/v1/twitch/event-sub/channel-redemption-add", twitchChannelRedemptionAddEvent.handle.bind(twitchChannelRedemptionAddEvent))
server.post("/webhook/v1/twitch/event-sub/channel-follow", twitchChannelFollowEvent.handle.bind(twitchChannelFollowEvent))
server.post("/webhook/v1/twitch/event-sub/channel-subscribe", twitchChannelSubscribeEvent.handle.bind(twitchChannelSubscribeEvent))
server.post("/webhook/v1/twitch/event-sub/channel-raid", twitchChannelRaidEvent.handle.bind(twitchChannelRaidEvent))
server.post("/webhook/v1/twitch/event-sub/channel-bits-use", twitchChannelBitsUseEvent.handle.bind(twitchChannelBitsUseEvent))

tbCron.run()

export default server;
