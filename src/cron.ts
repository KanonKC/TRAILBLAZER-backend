import { CronJob } from "cron";
import { randomUUID } from "crypto";
import UserService from "./services/user/user.service";
import LinkedAccountService from "./services/linkedAccount/linkedAccount.service";
import EventSubReconcilerService from "./services/twitch/eventSubReconciler/eventSubReconciler.service";
import config from "./config";
import TLogger, { Layer } from "./logging/logger";

export default class TbCron {

    private readonly userService: UserService
    private readonly linkedAccountService: LinkedAccountService
    private readonly eventSubReconciler: EventSubReconcilerService

    constructor(userService: UserService, linkedAccountService: LinkedAccountService, eventSubReconciler: EventSubReconcilerService) {
        this.userService = userService
        this.linkedAccountService = linkedAccountService
        this.eventSubReconciler = eventSubReconciler
    }

    async run() {
        // User tier adjustment job
        CronJob.from({
            cronTime: "0 6 * * *",
            onTick: () => this.userService.bulkAdjustTierAndWidgets(randomUUID()),
            start: true,
            timeZone: "Asia/Bangkok"
        })

        // Token refresh job - Every hour
        CronJob.from({
            cronTime: "0 6 * * *",
            onTick: () => this.linkedAccountService.refreshExpiringTokens(randomUUID()),
            start: true,
            timeZone: "Asia/Bangkok"
        })

        // Twitch EventSub health check — re-subscribes dropped subscriptions (interval configurable via env)
        if (config.twitch.eventSubHealthCheck.enabled) {
            CronJob.from({
                cronTime: config.twitch.eventSubHealthCheck.cron,
                onTick: async () => {
                    try {
                        await this.eventSubReconciler.run(randomUUID())
                    } catch (error) {
                        new TLogger(Layer.OTHER, "cron.eventSubHealthCheck").error({ message: "EventSub health check tick failed", error: error as Error })
                    }
                },
                start: true,
                timeZone: "Asia/Bangkok"
            })
        }
    }
}
