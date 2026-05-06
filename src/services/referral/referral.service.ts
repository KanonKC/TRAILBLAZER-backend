import crypto from "crypto";
import TLogger, { Layer } from "@/logging/logger";
import ReferralRepository from "@/repositories/referral/referral.repository";
import UserService from "../user/user.service";

export default class ReferralService {
    private readonly referralRepository: ReferralRepository;
    private readonly logger: TLogger;
    private readonly userService: UserService;

    constructor(referralRepository: ReferralRepository, userService: UserService) {
        this.referralRepository = referralRepository;
        this.logger = new TLogger(Layer.SERVICE);
        this.userService = userService;
    }

    /**
     * Generates or retrieves a unique referral code for a user based on their Twitch ID.
     */
    async getOrCreateCode(userId: string, twitchId: string): Promise<string> {
        this.logger.setContext("service.referral.getOrCreateCode");
        const existing = await this.referralRepository.getReferralCodeByUserId(userId);
        if (existing) return existing.code;

        // Generate a code based on Twitch ID
        const code = crypto
            .createHash("md5")
            .update(twitchId)
            .digest("hex")
            .substring(0, 10)
            .toUpperCase();

        const referralCode = await this.referralRepository.getOrCreateReferralCode(userId, code);
        return referralCode.code;
    }

    /**
     * Processes a referral when a new user registers using a referral link.
     */
    async handleReferralRegistration(code: string, refereeId: string): Promise<void> {
        this.logger.setContext("service.referral.handleReferralRegistration");
        this.logger.info({ message: "Processing referral registration", data: { code, refereeId } });

        try {
            // 1. Resolve code to referrer
            const referralCode = await this.referralRepository.getReferralCodeByCode(code);
            if (!referralCode) {
                this.logger.warn({ message: "Invalid referral code", data: { code } });
                return;
            }

            const referrerId = referralCode.user_id;

            // Prevent self-referral (though unlikely with Twitch OAuth, good to have)
            if (referrerId === refereeId) {
                this.logger.warn({ message: "User tried to refer themselves", data: { referrerId, refereeId } });
                return;
            }

            // 2. Create referral record (will fail if referee already referred due to @unique)
            try {
                await this.referralRepository.createReferral(referrerId, refereeId);
            } catch (error) {
                this.logger.warn({ message: "Referee already referred or error creating record", error: error as Error });
                return;
            }

            // 3. Apply Referee Reward (+1 widget quota)
            await this.userService.update(refereeId, {
                extra_widget_quota: {
                    increment: 1
                } as any // Prisma increment
            });
            this.logger.info({ message: "Applied referee reward", data: { refereeId } });

            // 4. Apply Inviter Rewards (Milestones: 1, 2, 3)
            const referralCount = await this.referralRepository.countReferralsByReferrerId(referrerId);

            let inviterUpdate: any = {};
            if (referralCount === 1) {
                inviterUpdate = { extra_widget_quota: { increment: 1 } };
            } else if (referralCount === 2) {
                inviterUpdate = { max_storage_mb: { increment: 15 } };
            } else if (referralCount === 3) {
                inviterUpdate = { extra_widget_quota: { increment: 1 } };
            }

            if (Object.keys(inviterUpdate).length > 0) {
                await this.userService.update(referrerId, inviterUpdate);
                this.logger.info({
                    message: "Applied inviter milestone reward",
                    data: { referrerId, referralCount, reward: inviterUpdate }
                });
            }

        } catch (error) {
            this.logger.error({ message: "Failed to process referral registration", error: error as Error });
        }
    }

    async getReferralStatus(userId: string) {
        const count = await this.referralRepository.countReferralsByReferrerId(userId);
        const referralCode = await this.referralRepository.getReferralCodeByUserId(userId);

        return {
            count,
            code: referralCode?.code || null,
            milestones: [
                { count: 1, reward: "+1 Widget Quota", reached: count >= 1 },
                { count: 2, reward: "+15 MB Storage", reached: count >= 2 },
                { count: 3, reward: "+1 Widget Quota", reached: count >= 3 },
            ]
        };
    }
}
