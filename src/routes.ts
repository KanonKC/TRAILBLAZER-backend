import fastify from "fastify";
import config from "./config";
import ClipShoutoutController from "./controllers/clipShoutout/clipShoutout.controller";
import FirstWordController from "./controllers/firstWord/firstWord.controller";
import RandomDbdPerkController from "./controllers/randomDbdPerk/randomDbdPerk.controller";
import UserController from "./controllers/user/user.controller";
import AdminController from "./controllers/admin/admin.controller";
import WidgetController from "./controllers/widget/widget.controller";
import DropImageController from "./controllers/dropImage/dropImage.controller";
import TwitchChannelChatMessageEvent from "./events/twitch/channelChatMessage/channelChatMessage.event";
import UploadedFileController from "./controllers/uploadedFile/uploadedFile.controller";
import ExportVideoRepository from "./repositories/exportVideo/exportVideo.repository";
import TwitchChannelChatNotificationEvent from "./events/twitch/channelChatNotification/channelChatNotification.event";
import FirstWordRepository from "./repositories/firstWord/firstWord.repository";
import RandomDbdPerkRepository from "./repositories/randomDbdPerk/randomDbdPerk.repository";
import UserRepository from "./repositories/user/user.repository";
import WidgetRepository from "./repositories/widget/widget.repository";
import DropImageRepository from "./repositories/dropImage/dropImage.repository";
import { UploadedFileRepository } from "./repositories/uploadedFile/uploadedFile.repository";
import ClipShoutoutService from "./services/widget/clipShoutout/clipShoutout.service";
import FirstWordService from "./services/widget/firstWord/firstWord.service";
import RandomDbdPerkService from "./services/widget/randomDbdPerk/randomDbdPerk.service";
import UserService from "./services/user/user.service";
import WidgetService from "./services/widget/widget.service";
import DropImageService from "./services/widget/dropImage/dropImage.service";
import ExportVideoService from "./services/widget/exportVideo/exportVideo.service";
import { UploadedFileService } from "./services/uploadedFile/uploadedFile.service";

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { FastifySSEPlugin } from "fastify-sse-v2";
import ClipShoutoutEventController from "./controllers/clipShoutout/clipShoutout.event.controller";
import DropImageEventController from "./controllers/dropImage/dropImage.event.controller";
import FirstWordEventController from "./controllers/firstWord/firstWord.event.controller";
import SystemController from "./controllers/system/system.controller";
import TwitchController from "./controllers/twitch/twitch.controller";
import TwitchGqlController from "./controllers/twitch/twitch-gql.controller";
import TwitchChannelRedemptionAddEvent from "./events/twitch/channelRedemptionAdd/channelRedemptionAdd.event";
import TwitchStreamOnlineEvent from "./events/twitch/streamOnline/streamOnline.event";
import TwitchStreamOfflineEvent from "./events/twitch/streamOffline/streamOffline.event";
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
import { Google, Discord } from "arctic";
import TbCron from "./cron";

// Providers
const twitchGql = new TwitchGql(config);
const sightengine = new Sightengine(config);
const googleOAuth = new Google(config.youtube.clientId, config.youtube.clientSecret, config.youtube.redirectUrl);
const discordOAuth = new Discord(config.discord.clientId, config.discord.clientSecret, config.discord.redirectUrl);

// Repository Layer
const userRepository = new UserRepository();
const firstWordRepository = new FirstWordRepository();
const authRepository = new AuthRepository();

const clipShoutoutRepository = new ClipShoutoutRepository();
const dropImageRepository = new DropImageRepository();

const randomDbdPerkRepository = new RandomDbdPerkRepository();
const widgetRepository = new WidgetRepository();
const uploadedFileRepository = new UploadedFileRepository();
const linkedAccountRepository = new LinkedAccountRepository();
const exportVideoRepository = new ExportVideoRepository();

// Service Layer
const systemService = new SystemService();
const authService = new AuthService(config, authRepository, userRepository);
const userService = new UserService(config, userRepository, authRepository, authService);
const widgetService = new WidgetService(widgetRepository, userService, userRepository);
userService.setWidgetService(widgetService);
const firstWordService = new FirstWordService(config, firstWordRepository, userRepository, widgetService);

const clipShoutoutService = new ClipShoutoutService(config, clipShoutoutRepository, userRepository, authService, twitchGql, widgetService);
const dropImageService = new DropImageService(dropImageRepository, userRepository, sightengine, widgetService);

const randomDbdPerkService = new RandomDbdPerkService(randomDbdPerkRepository, userRepository, widgetService);
const uploadedFileService = new UploadedFileService(uploadedFileRepository);
const twitchService = new TwitchService(authService);
const linkedAccountService = new LinkedAccountService(config, linkedAccountRepository, googleOAuth, discordOAuth);
const exportVideoService = new ExportVideoService(exportVideoRepository, userService, widgetService, twitchGql);

// Controller Layer
const systemController = new SystemController(systemService);
const authController = new AuthController(authService);
const userController = new UserController(config, userService);
const adminController = new AdminController(userService);
const firstWordEventController = new FirstWordEventController(firstWordService);
const firstWordController = new FirstWordController(firstWordService, firstWordEventController);
const clipShoutoutEventController = new ClipShoutoutEventController(clipShoutoutService);

const clipShoutoutController = new ClipShoutoutController(clipShoutoutService, clipShoutoutEventController);
const dropImageController = new DropImageController(dropImageService);
const dropImageEventController = new DropImageEventController(widgetService);
const randomDbdPerkController = new RandomDbdPerkController(randomDbdPerkService);
const widgetController = new WidgetController(widgetService);
const uploadedFileController = new UploadedFileController(uploadedFileService);
const twitchController = new TwitchController(twitchService);
const linkedAccountController = new LinkedAccountController(linkedAccountService);
const twitchGqlController = new TwitchGqlController(twitchGql);

// Event Layer
const twitchChannelChatMessageEvent = new TwitchChannelChatMessageEvent(firstWordService, dropImageService)
const twitchStreamOnlineEvent = new TwitchStreamOnlineEvent(firstWordService);
const twitchStreamOfflineEvent = new TwitchStreamOfflineEvent(exportVideoService);
const twitchChannelChatNotificationEvent = new TwitchChannelChatNotificationEvent(clipShoutoutService);
const twitchChannelRedemptionAddEvent = new TwitchChannelRedemptionAddEvent(randomDbdPerkService, dropImageService);

// Cron
const tbCron = new TbCron(userService)


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

server.get("/api/v1/login", userController.login.bind(userController))
server.get("/api/v1/user/me", userController.me.bind(userController))
server.get("/api/v1/user/tier", userController.getTier.bind(userController))
server.post("/api/v1/logout", authController.logout.bind(authController))
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

server.post("/api/v1/drop-image", dropImageController.create.bind(dropImageController));
server.get("/api/v1/drop-image", dropImageController.get.bind(dropImageController));
server.put("/api/v1/drop-image", dropImageController.update.bind(dropImageController));
server.post("/api/v1/drop-image/refresh-key", dropImageController.refreshKey.bind(dropImageController));
server.delete("/api/v1/drop-image", dropImageController.delete.bind(dropImageController));

server.get("/api/v1/widgets", widgetController.list.bind(widgetController));
server.get("/api/v1/widgets/first-enabled", widgetController.getFirstEnabled.bind(widgetController));
server.get("/api/v1/widgets/validate-overlay/:key", widgetController.validateOverlayAccess.bind(widgetController));
server.put("/api/v1/widgets/:id", widgetController.update.bind(widgetController));
server.patch("/api/v1/widgets/:id/enable", widgetController.updateEnable.bind(widgetController));
server.delete("/api/v1/widgets/:id", widgetController.delete.bind(widgetController));

server.post("/api/v1/uploaded-files", uploadedFileController.create.bind(uploadedFileController));
server.get("/api/v1/uploaded-files", uploadedFileController.list.bind(uploadedFileController));
server.get("/api/v1/uploaded-files/:id", uploadedFileController.get.bind(uploadedFileController));
server.put("/api/v1/uploaded-files/:id", uploadedFileController.update.bind(uploadedFileController));
server.delete("/api/v1/uploaded-files/:id", uploadedFileController.delete.bind(uploadedFileController));

server.get("/api/v1/twitch/channel-rewards", twitchController.listChannelRewards.bind(twitchController));
server.get("/api/v1/twitch/user", twitchController.getUser.bind(twitchController));
server.post("/api/v1/twitch/export-videos", twitchGqlController.exportVideoToYoutube.bind(twitchGqlController));

server.get("/api/v1/linked-accounts", linkedAccountController.list.bind(linkedAccountController));
server.post("/api/v1/linked-accounts/:platform/bind", linkedAccountController.bind.bind(linkedAccountController));
server.delete("/api/v1/linked-accounts/:platform", linkedAccountController.unbind.bind(linkedAccountController));

server.register(FastifySSEPlugin);
server.get("/api/v1/events/first-word/:userId", firstWordEventController.sse.bind(firstWordEventController));
server.get("/api/v1/events/clip-shoutout/:userId", clipShoutoutEventController.sse.bind(clipShoutoutEventController));
server.get("/api/v1/events/drop-image/:userId", dropImageEventController.sse.bind(dropImageEventController));

server.post("/webhook/v1/twitch/event-sub/channel-chat-message", twitchChannelChatMessageEvent.handle.bind(twitchChannelChatMessageEvent))
server.post("/webhook/v1/twitch/event-sub/stream-online", twitchStreamOnlineEvent.handle.bind(twitchStreamOnlineEvent))
server.post("/webhook/v1/twitch/event-sub/stream-offline", twitchStreamOfflineEvent.handle.bind(twitchStreamOfflineEvent))
server.post("/webhook/v1/twitch/event-sub/channel-chat-notification", twitchChannelChatNotificationEvent.handle.bind(twitchChannelChatNotificationEvent))
server.post("/webhook/v1/twitch/event-sub/channel-redemption-add", twitchChannelRedemptionAddEvent.handle.bind(twitchChannelRedemptionAddEvent))

tbCron.run()

export default server;
