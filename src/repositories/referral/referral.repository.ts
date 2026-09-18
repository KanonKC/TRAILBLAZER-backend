import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { Referral, ReferralCode } from "../../../generated/prisma/client";

const logger = new TLogger(Layer.REPOSITORY);

export default class ReferralRepository {
    constructor() { }

    async createReferral(referrerId: string, refereeId: string, tx?: any): Promise<Referral> {
        try {
        const client = tx || prisma;
        return client.referral.create({
            data: {
                referrer_id: referrerId,
                referee_id: refereeId
            }
        });
    } catch (error) {
            logger.setContext("repository.referral.createReferral").error({ message: "createReferral failed", error: error as Error });
            throw error;
        }
    }

    async getReferralByRefereeId(refereeId: string): Promise<Referral | null> {
        try {
        return prisma.referral.findUnique({
            where: { referee_id: refereeId }
        });
    } catch (error) {
            logger.setContext("repository.referral.getReferralByRefereeId").error({ message: "getReferralByRefereeId failed", error: error as Error });
            throw error;
        }
    }

    async countReferralsByReferrerId(referrerId: string, tx?: any): Promise<number> {
        try {
        const client = tx || prisma;
        return client.referral.count({
            where: { referrer_id: referrerId }
        });
    } catch (error) {
            logger.setContext("repository.referral.countReferralsByReferrerId").error({ message: "countReferralsByReferrerId failed", error: error as Error });
            throw error;
        }
    }

    async getOrCreateReferralCode(userId: string, code: string): Promise<ReferralCode> {
        try {
        return prisma.referralCode.upsert({
            where: { user_id: userId },
            update: {},
            create: {
                user_id: userId,
                code: code
            }
        });
    } catch (error) {
            logger.setContext("repository.referral.getOrCreateReferralCode").error({ message: "getOrCreateReferralCode failed", error: error as Error });
            throw error;
        }
    }

    async getReferralCodeByCode(code: string): Promise<ReferralCode | null> {
        try {
        return prisma.referralCode.findUnique({
            where: { code }
        });
    } catch (error) {
            logger.setContext("repository.referral.getReferralCodeByCode").error({ message: "getReferralCodeByCode failed", error: error as Error });
            throw error;
        }
    }

    async getReferralCodeByUserId(userId: string): Promise<ReferralCode | null> {
        try {
        return prisma.referralCode.findUnique({
            where: { user_id: userId }
        });
    } catch (error) {
            logger.setContext("repository.referral.getReferralCodeByUserId").error({ message: "getReferralCodeByUserId failed", error: error as Error });
            throw error;
        }
    }
}
