import { CronJob } from "cron";
import { randomUUID } from "crypto";
import UserService from "./services/user/user.service";
import LinkedAccountService from "./services/linkedAccount/linkedAccount.service";

export default class TbCron {

    private readonly userService: UserService
    private readonly linkedAccountService: LinkedAccountService

    constructor(userService: UserService, linkedAccountService: LinkedAccountService) {
        this.userService = userService
        this.linkedAccountService = linkedAccountService
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
    }
}