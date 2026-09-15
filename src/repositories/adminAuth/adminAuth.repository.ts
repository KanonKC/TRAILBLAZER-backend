import { prisma } from "@/libs/prisma";
import { AdminUser } from "generated/prisma/client";

export default class AdminAuthRepository {
    constructor() {
    }

    async findByGoogleId(googleId: string): Promise<AdminUser | null> {
        return prisma.adminUser.findUnique({ where: { google_id: googleId } });
    }

    async findByEmail(email: string): Promise<AdminUser | null> {
        return prisma.adminUser.findUnique({ where: { email } });
    }

    async get(id: string): Promise<AdminUser | null> {
        return prisma.adminUser.findUnique({ where: { id } });
    }

    async updateGoogleIdAndLastLogin(id: string, googleId: string): Promise<AdminUser> {
        return prisma.adminUser.update({
            where: { id },
            data: { google_id: googleId, last_login_at: new Date() }
        });
    }

    async updateLastLogin(id: string): Promise<AdminUser> {
        return prisma.adminUser.update({
            where: { id },
            data: { last_login_at: new Date() }
        });
    }
}
