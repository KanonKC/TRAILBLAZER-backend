import { prisma } from "@/libs/prisma";
import { Referral, ReferralCode } from "../../../generated/prisma/client";

export default class ReferralRepository {
    constructor() { }

    async createReferral(referrerId: string, refereeId: string, tx?: any): Promise<Referral> {
        const client = tx || prisma;
        return client.referral.create({
            data: {
                referrer_id: referrerId,
                referee_id: refereeId
            }
        });
    }

    async getReferralByRefereeId(refereeId: string): Promise<Referral | null> {
        return prisma.referral.findUnique({
            where: { referee_id: refereeId }
        });
    }

    async countReferralsByReferrerId(referrerId: string, tx?: any): Promise<number> {
        const client = tx || prisma;
        return client.referral.count({
            where: { referrer_id: referrerId }
        });
    }

    async getOrCreateReferralCode(userId: string, code: string): Promise<ReferralCode> {
        return prisma.referralCode.upsert({
            where: { user_id: userId },
            update: {},
            create: {
                user_id: userId,
                code: code
            }
        });
    }

    async getReferralCodeByCode(code: string): Promise<ReferralCode | null> {
        return prisma.referralCode.findUnique({
            where: { code }
        });
    }

    async getReferralCodeByUserId(userId: string): Promise<ReferralCode | null> {
        return prisma.referralCode.findUnique({
            where: { user_id: userId }
        });
    }
}
