import { HelixEventSubTransportOptions } from "@twurple/api";
import { twitchAppAPI, createESTransport } from "./libs/twurple"
import crypto from "crypto";
import { rawDataSymbol } from "@twurple/common";
import { writeFileSync } from "fs";

const EVENT_SUB_ROUTES: Record<string, string> = {
    "channel.chat.message": "/webhook/v1/twitch/event-sub/channel-chat-message",
    "stream.online": "/webhook/v1/twitch/event-sub/stream-online",
    "stream.offline": "/webhook/v1/twitch/event-sub/stream-offline",
    "channel.chat.notification": "/webhook/v1/twitch/event-sub/channel-chat-notification",
    "channel.channel_points_custom_reward_redemption.add": "/webhook/v1/twitch/event-sub/channel-redemption-add",
}

async function resubscribeAll() {
    console.log("Fetching all existing EventSub subscriptions...")
    const allSubs = {
        data: [
            {
                "id": "0d19757f-be75-434c-a2a7-3c3add1168e6",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "135783794",
                    "user_id": "135783794"
                },
                "created_at": "2026-02-01T18:37:15.818940123Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "c36d1aae-29c3-4b6c-9e32-1a6288803e45",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "135783794"
                },
                "created_at": "2026-02-01T18:37:16.081469975Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "f8f02c13-08b8-4c0f-89b9-6bb9ae218543",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "880377708",
                    "user_id": "880377708"
                },
                "created_at": "2026-02-02T19:07:17.312900235Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "b0f0b5b5-7c94-4afd-8b69-720619f55dfa",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "880377708"
                },
                "created_at": "2026-02-02T19:07:17.55828286Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "e359c7f7-e86e-4190-a414-dd5847ea2a23",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "131659290",
                    "user_id": "131659290"
                },
                "created_at": "2026-02-03T19:44:43.877343846Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "6944cb67-415b-45a4-8de2-477211e671f7",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "131659290"
                },
                "created_at": "2026-02-03T19:44:44.131149215Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "1f25f241-ec34-47fd-b9db-b704a0d81730",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "203062638",
                    "user_id": "203062638"
                },
                "created_at": "2026-02-03T20:08:10.89208309Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "657880d3-506e-4726-8ff7-a45575b74507",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "203062638"
                },
                "created_at": "2026-02-03T20:08:11.138851369Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "eea8b3fb-8efa-49d5-b389-b51a1acb7f9c",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "536970986",
                    "user_id": "536970986"
                },
                "created_at": "2026-02-04T16:32:56.39754762Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "cc897030-62d0-4f61-9c77-9d50a508044a",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "536970986"
                },
                "created_at": "2026-02-04T16:32:56.644068386Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "6fb14bf6-147d-4c2a-8336-7f07f32d32c2",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "135783794",
                    "user_id": "135783794"
                },
                "created_at": "2026-02-05T18:35:09.287951096Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "9bc0514b-9cdc-4256-a851-f4dc8fff25e2",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "536970986",
                    "user_id": "536970986"
                },
                "created_at": "2026-02-07T06:05:42.590952549Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "dc5a6402-7ea8-438d-9299-a574cc71e4a8",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "131659290",
                    "user_id": "131659290"
                },
                "created_at": "2026-02-07T06:06:16.990234223Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "78671bd3-2d17-481d-a32a-bd24833dc72c",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "135783794",
                    "reward_id": ""
                },
                "created_at": "2026-02-15T16:19:25.340229042Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "7e711203-0aad-4d79-8175-78228f83b405",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "131659290",
                    "reward_id": ""
                },
                "created_at": "2026-02-16T15:02:46.753089189Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "3fad3337-9ce8-4e5b-9785-56ceb840b1ca",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "536970986",
                    "reward_id": ""
                },
                "created_at": "2026-02-16T20:30:20.79478154Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "e688b0ae-8dfe-4966-9f40-a6efc1fd4a87",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "493142066",
                    "reward_id": ""
                },
                "created_at": "2026-02-21T18:30:15.492343085Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "1830f06b-ee4d-4908-b7d0-a8b87a35dd9d",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "898410004",
                    "user_id": "898410004"
                },
                "created_at": "2026-02-22T05:32:51.050780201Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "1ca890eb-fa85-4398-8e92-49d602c0a340",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "898410004"
                },
                "created_at": "2026-02-22T05:32:51.289559793Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "2fc2ac2b-cba0-418c-9ba1-6d9191d2de9a",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "898410004",
                    "user_id": "898410004"
                },
                "created_at": "2026-02-22T05:33:44.21613029Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "f85f9150-c115-45a9-90a7-499c5d4af245",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "898410004",
                    "reward_id": ""
                },
                "created_at": "2026-02-22T05:38:10.857418464Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "226836d1-af0c-459a-b546-be20b1149c8d",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "198701559",
                    "user_id": "198701559"
                },
                "created_at": "2026-02-22T17:20:48.1186853Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "6bdc1243-e0c9-4af6-be6f-3cb8796e7d0c",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "198701559",
                    "user_id": "198701559"
                },
                "created_at": "2026-02-22T17:30:44.240886686Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "3ac7ec76-d06c-44a9-995e-f7fa23edbd4f",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "198701559"
                },
                "created_at": "2026-02-22T17:30:44.495724993Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "381e744d-1582-456b-99b6-5d0026f8d7c6",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "198701559",
                    "reward_id": ""
                },
                "created_at": "2026-02-22T17:40:12.088041613Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "9c3d2bda-e7fa-4e38-9525-4fb74b5d6cab",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "203062638",
                    "user_id": "203062638"
                },
                "created_at": "2026-02-22T18:58:37.934686364Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "aab1210a-fdc7-4838-887e-2184192ab6dd",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "203062638",
                    "reward_id": ""
                },
                "created_at": "2026-02-22T19:11:31.618678839Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "4c561400-3fc7-4a12-a9bf-c3d06a523104",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "493142066",
                    "user_id": "493142066"
                },
                "created_at": "2026-02-23T11:03:16.566176678Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "c44dbc52-1c4d-4b7c-876f-ca4e1dbb35d8",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "493142066"
                },
                "created_at": "2026-02-23T11:03:16.819837785Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "b0f7907f-0a3a-4b6a-9110-b16213ec69f7",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "493142066",
                    "user_id": "493142066"
                },
                "created_at": "2026-02-23T11:11:25.711748631Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "670b30b7-f5bf-46a0-b601-aca7fba78e61",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "141845798",
                    "user_id": "141845798"
                },
                "created_at": "2026-03-20T19:17:04.935778454Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "f58875de-3c6a-447e-b5fc-6a3f5d89c02a",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "134926621",
                    "user_id": "134926621"
                },
                "created_at": "2026-03-23T18:55:59.694481531Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "c4c752b4-d53e-41ed-9bb8-fd3ac4a44428",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "134926621"
                },
                "created_at": "2026-03-23T18:55:59.93608419Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "4f7dad23-79cf-49e4-a4cb-94c528a134af",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "117136811",
                    "reward_id": ""
                },
                "created_at": "2026-03-25T18:08:07.67800837Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "bbec5973-5ce9-4ece-ba20-81412df777cd",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "705932393",
                    "user_id": "705932393"
                },
                "created_at": "2026-03-25T18:11:30.747923379Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "fc90dc9e-447e-4912-94ad-a147b34a2a7c",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "705932393"
                },
                "created_at": "2026-03-25T18:11:30.978334355Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "f0cb2b44-ac09-4749-bcf8-68cfa813aaea",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "705932393",
                    "user_id": "705932393"
                },
                "created_at": "2026-03-25T18:16:26.224564786Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "89fa08a1-0f1b-4efd-acba-3b1978b781aa",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "449956875",
                    "user_id": "449956875"
                },
                "created_at": "2026-03-28T04:47:52.852279092Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "6fd8f612-45f6-44b7-8565-b4b3171ff1f4",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "449956875"
                },
                "created_at": "2026-03-28T04:47:53.095782554Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "fbfd8a4d-e37a-4762-9965-48fc979839f5",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "447938203",
                    "user_id": "447938203"
                },
                "created_at": "2026-03-28T17:16:41.21050569Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "5841a0ad-6050-42bb-9304-b6e6d390addb",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "447938203"
                },
                "created_at": "2026-03-28T17:16:41.458048137Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "ac8b6f5d-3d6d-474f-bfe7-880f2aac045d",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "447938203",
                    "user_id": "447938203"
                },
                "created_at": "2026-03-28T18:02:54.852812568Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "d9659543-01a9-4514-8e5f-2bb88dddb151",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "447938203",
                    "reward_id": ""
                },
                "created_at": "2026-03-28T18:15:20.548395437Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "8fd31566-7eb8-46b3-83e5-2ba519aef7cd",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "449956875",
                    "user_id": "449956875"
                },
                "created_at": "2026-03-29T02:40:06.870227923Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "49d08b3a-538c-40a0-a5b2-d724e0857b57",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "449956875",
                    "reward_id": ""
                },
                "created_at": "2026-03-29T02:42:15.662877588Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "d7653449-d53b-4779-bd65-95216afb46af",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "141845798",
                    "user_id": "141845798"
                },
                "created_at": "2026-04-01T13:03:09.659795323Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "aaf26081-a0ae-4b1b-a526-95fa4615deba",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "141845798"
                },
                "created_at": "2026-04-01T13:03:09.927273001Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "e554da5b-d9b3-42ec-9f1d-2e83ed6ae447",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "141845798",
                    "reward_id": ""
                },
                "created_at": "2026-04-01T13:58:42.790016048Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "ae96b369-e8d2-4a54-a72a-5d2a7e6a76c8",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "623519964",
                    "reward_id": ""
                },
                "created_at": "2026-04-13T06:43:37.302890746Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "0be70a22-4f84-4b85-8de0-c5c4839c66cd",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "623519964",
                    "user_id": "623519964"
                },
                "created_at": "2026-04-13T06:52:08.369182844Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "cd064996-e427-4831-b5c6-db3395835996",
                "status": "enabled",
                "type": "stream.offline",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "135783794"
                },
                "created_at": "2026-04-16T04:58:14.9291686Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-offline"
                },
                "cost": 0
            },
            {
                "id": "5fc606b1-1226-471d-8649-64df7e777dcf",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "1031415755",
                    "user_id": "1031415755"
                },
                "created_at": "2026-04-16T14:52:10.798951352Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "24f8c47f-6b76-40bb-9b12-14bcc5d65d26",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "1031415755"
                },
                "created_at": "2026-04-16T14:52:11.04858417Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "72bb6574-edda-46e8-8a28-7b04392e12ca",
                "status": "enabled",
                "type": "stream.offline",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "1031415755"
                },
                "created_at": "2026-04-16T14:52:11.319452858Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-offline"
                },
                "cost": 0
            },
            {
                "id": "9165c8f0-eaad-4b00-b60f-429bf0fb9fef",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "880377708",
                    "reward_id": ""
                },
                "created_at": "2026-04-17T15:14:59.995133352Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "70029b66-e834-4414-b1b3-ede71489d38f",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "782475901",
                    "user_id": "782475901"
                },
                "created_at": "2026-04-17T15:48:06.511897117Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "523f097b-822e-4148-be44-9dff311f27b8",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "782475901"
                },
                "created_at": "2026-04-17T15:48:06.749626308Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "e43e404c-e5a3-4d1e-83a7-221719a4275d",
                "status": "enabled",
                "type": "stream.offline",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "782475901"
                },
                "created_at": "2026-04-17T15:48:06.99264125Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-offline"
                },
                "cost": 0
            },
            {
                "id": "13e681b9-c0ee-452a-8db6-53a72e0c8a12",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "782475901",
                    "user_id": "782475901"
                },
                "created_at": "2026-04-17T15:48:40.379732536Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "5380bfde-b594-4e03-a665-eed1ed03a84b",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "189526230",
                    "user_id": "189526230"
                },
                "created_at": "2026-04-17T16:12:31.230893476Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "79214a40-b871-420e-8ae0-cb30c7fe1a63",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "189526230"
                },
                "created_at": "2026-04-17T16:12:31.483321529Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "fa39efa1-1544-441b-bbb3-440e78c6faa3",
                "status": "notification_failures_exceeded",
                "type": "stream.offline",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "189526230"
                },
                "created_at": "2026-04-17T16:12:31.740654699Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-offline"
                },
                "cost": 0
            },
            {
                "id": "e935f323-e7ac-442d-a6ba-b17227a3fe6b",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "142902651",
                    "reward_id": ""
                },
                "created_at": "2026-04-17T16:43:12.765951453Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "0afccf06-a5c5-4350-90aa-27a739435b75",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "142902651",
                    "user_id": "142902651"
                },
                "created_at": "2026-04-17T16:45:33.454956209Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "15b0b21b-89d7-4cd0-a883-756115a9e8f9",
                "status": "enabled",
                "type": "stream.offline",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "131659290"
                },
                "created_at": "2026-04-17T21:33:26.61221325Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-offline"
                },
                "cost": 0
            },
            {
                "id": "27f1c927-137f-4d99-a472-13afecc79d21",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "623519964",
                    "user_id": "623519964"
                },
                "created_at": "2026-04-18T12:30:25.533905801Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "f3c0fe74-a4ae-4c24-94fa-6df59b398c2d",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "623519964"
                },
                "created_at": "2026-04-18T12:30:25.797201674Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "386df8db-ed88-49ef-a01a-1bb41e3bda72",
                "status": "enabled",
                "type": "stream.offline",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "623519964"
                },
                "created_at": "2026-04-18T12:30:26.043418932Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-offline"
                },
                "cost": 0
            },
            {
                "id": "2564142d-e7f7-4d82-a5b4-ba5ee53eff13",
                "status": "enabled",
                "type": "stream.offline",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "447938203"
                },
                "created_at": "2026-04-18T13:27:48.447757998Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-offline"
                },
                "cost": 0
            },
            {
                "id": "54507484-57ac-4c36-9917-efb7769e27c5",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "134926621",
                    "user_id": "134926621"
                },
                "created_at": "2026-04-18T17:38:38.256124271Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "eaea9a40-8977-4e68-872d-173de1418cec",
                "status": "enabled",
                "type": "stream.offline",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "203062638"
                },
                "created_at": "2026-05-04T14:17:37.174591604Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-offline"
                },
                "cost": 0
            },
            {
                "id": "b4a401b0-99b2-43d4-87e3-f67ca586e4f2",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "776638139"
                },
                "created_at": "2026-05-12T14:48:34.376546679Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "f62334a6-d74c-44df-b511-ad8e1af03983",
                "status": "enabled",
                "type": "stream.offline",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "776638139"
                },
                "created_at": "2026-05-12T14:48:34.614648967Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-offline"
                },
                "cost": 0
            },
            {
                "id": "973ed8d4-c643-42f7-9a35-b599de4f981e",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "843968760",
                    "user_id": "843968760"
                },
                "created_at": "2026-05-15T10:10:55.218815932Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "c55994b7-c604-411f-8a6d-631ae7869363",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "843968760",
                    "user_id": "843968760"
                },
                "created_at": "2026-05-15T13:04:48.692014789Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "542bf24b-4f94-44a0-82c9-40e32341a540",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "843968760"
                },
                "created_at": "2026-05-15T13:04:48.933988001Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "abad2e73-0a9f-455b-a03d-df40a3c42e1b",
                "status": "enabled",
                "type": "stream.offline",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "843968760"
                },
                "created_at": "2026-05-15T13:04:49.184276552Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-offline"
                },
                "cost": 0
            },
            {
                "id": "4a03ba5e-6889-4a55-bb03-c864c017628c",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "776638139",
                    "user_id": "776638139"
                },
                "created_at": "2026-05-16T16:01:57.748563353Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "5248b48b-66ab-4685-a788-3e8320f11b0d",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "776638139",
                    "user_id": "776638139"
                },
                "created_at": "2026-05-16T16:15:03.973415817Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "292df136-4975-4f90-b66c-944408376f91",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "776638139",
                    "reward_id": ""
                },
                "created_at": "2026-05-17T04:24:08.572189549Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "2c139e47-e12e-4f26-9119-b88f5caf2c60",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "755155800",
                    "user_id": "755155800"
                },
                "created_at": "2026-05-20T15:53:23.900372992Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "9e0c9954-cbb5-487e-8032-f05bfdd2a820",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "262440092",
                    "user_id": "262440092"
                },
                "created_at": "2026-05-21T12:17:47.527190223Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "548dc9d1-376f-456d-9abc-7df5140ccd02",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "262440092",
                    "user_id": "262440092"
                },
                "created_at": "2026-05-21T12:21:29.716674811Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "c841baff-7a15-44ce-9d42-23d49eaabe06",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "262440092"
                },
                "created_at": "2026-05-21T12:21:29.959049653Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "22b9c121-5f49-4cde-aa47-ad849e7e5893",
                "status": "enabled",
                "type": "stream.offline",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "262440092"
                },
                "created_at": "2026-05-21T12:21:30.215961411Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-offline"
                },
                "cost": 0
            },
            {
                "id": "bf87edc8-ce6e-4f7f-a1ad-4e8c4effbf59",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "262440092",
                    "reward_id": ""
                },
                "created_at": "2026-05-21T12:22:04.987935777Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "2618f530-7536-4357-9f7c-306373eb427f",
                "status": "enabled",
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "550513755",
                    "user_id": "550513755"
                },
                "created_at": "2026-05-25T14:11:43.417034696Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-message"
                },
                "cost": 0
            },
            {
                "id": "e50afb7f-24bc-4d0f-978f-ed19502a2f3a",
                "status": "enabled",
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "550513755"
                },
                "created_at": "2026-05-25T14:11:43.663937539Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-online"
                },
                "cost": 0
            },
            {
                "id": "a76855b0-5862-4843-ae35-5209b6320863",
                "status": "enabled",
                "type": "stream.offline",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "550513755"
                },
                "created_at": "2026-05-25T14:11:43.906511102Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-offline"
                },
                "cost": 0
            },
            {
                "id": "efb8ac08-2564-4ebd-8056-4974b73defa7",
                "status": "enabled",
                "type": "channel.chat.notification",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "550513755",
                    "user_id": "550513755"
                },
                "created_at": "2026-05-25T15:32:34.37453517Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-chat-notification"
                },
                "cost": 0
            },
            {
                "id": "59fbcfc6-1740-4932-b577-a4b4da58aeef",
                "status": "enabled",
                "type": "stream.offline",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "134926621"
                },
                "created_at": "2026-06-10T14:44:32.010943839Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-offline"
                },
                "cost": 0
            },
            {
                "id": "7a28bf90-807d-45dd-a811-6d3593668266",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "134926621",
                    "reward_id": ""
                },
                "created_at": "2026-06-12T15:51:55.83856537Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "09a921f2-c13e-4a01-8e46-11e695b23e18",
                "status": "enabled",
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "696594760",
                    "reward_id": ""
                },
                "created_at": "2026-06-17T14:52:10.342425218Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/channel-redemption-add"
                },
                "cost": 0
            },
            {
                "id": "20b60971-95fd-4ca1-8ef1-ba38d3e71565",
                "status": "enabled",
                "type": "stream.offline",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": "536970986"
                },
                "created_at": "2026-06-17T15:57:45.27548156Z",
                "transport": {
                    "method": "webhook",
                    "callback": "https://trailblazer-api.kanonkc.com/webhook/v1/twitch/event-sub/stream-offline"
                },
                "cost": 0
            }
        ]
    }
    console.log(`Found ${allSubs.data.length} subscriptions`)

    // Group subscriptions by twitchId (broadcaster_user_id)
    const subsByUser = new Map<string, typeof allSubs.data>()
    for (const sub of allSubs.data) {
        const twitchId = sub.condition["broadcaster_user_id"] as string
        if (!twitchId) continue
        if (!subsByUser.has(twitchId)) subsByUser.set(twitchId, [])
        subsByUser.get(twitchId)!.push(sub)
    }

    console.log(`Found ${subsByUser.size} unique users`)

    for (const [twitchId, subs] of subsByUser.entries()) {
        console.log(`\nProcessing user: ${twitchId}`)

        for (const sub of subs) {
            const route = EVENT_SUB_ROUTES[sub.type]
            if (!route) {
                console.log(`  Skipping unknown type: ${sub.type}`)
                continue
            }

            console.log(`  Deleting subscription [${sub.type}] id=${sub.id}`)
            // await twitchAppAPI.eventSub.deleteSubscription(sub.id)

            console.log(`  Re-subscribing [${sub.type}] -> ${route}`)
            const tsp: HelixEventSubTransportOptions = {
                method: "webhook",
                callback: `https://api.trailblazer.bz${route}`,
                secret: crypto.randomBytes(16).toString("hex")
            }

            switch (sub.type) {
                case "channel.chat.message":
                    await twitchAppAPI.eventSub.subscribeToChannelChatMessageEvents(twitchId, tsp)
                    break
                case "stream.online":
                    await twitchAppAPI.eventSub.subscribeToStreamOnlineEvents(twitchId, tsp)
                    break
                case "stream.offline":
                    await twitchAppAPI.eventSub.subscribeToStreamOfflineEvents(twitchId, tsp)
                    break
                case "channel.chat.notification":
                    await twitchAppAPI.eventSub.subscribeToChannelChatNotificationEvents(twitchId, tsp)
                    break
                case "channel.channel_points_custom_reward_redemption.add":
                    await twitchAppAPI.eventSub.subscribeToChannelRedemptionAddEvents(twitchId, tsp)
                    break
            }

            console.log(`  Done [${sub.type}]`)
        }
    }

    console.log("\nAll subscriptions re-created successfully.")
}

async function listAll() {
    const allSubs = await twitchAppAPI.eventSub.getSubscriptions()
    const data = JSON.stringify(allSubs.data.map(r => r[rawDataSymbol]))
    writeFileSync("event2.json", data)
}

async function deleteAll() {
    await twitchAppAPI.eventSub.deleteAllSubscriptions()
}

listAll().catch(err => {
    console.error("Script failed:", err)
    process.exit(1)
})
