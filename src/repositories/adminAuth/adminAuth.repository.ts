import { prisma } from "@/libs/prisma";
import { AdminUser } from "generated/prisma/client";
import TLogger, { Layer } from "@/logging/logger";

const logger = new TLogger(Layer.REPOSITORY);

export default class AdminAuthRepository {
    constructor() {
    }

    async findByGoogleId(googleId: string): Promise<AdminUser | null> {
        try {
        return prisma.adminUser.findUnique({ where: { google_id: googleId } });
    } catch (error) {
            logger.setContext("repository.adminAuth.findByGoogleId").error({ message: "findByGoogleId failed", error: error as Error });
            throw error;
        }
    }

    async findByEmail(email: string): Promise<AdminUser | null> {
        try {
        return prisma.adminUser.findUnique({ where: { email } });
    } catch (error) {
            logger.setContext("repository.adminAuth.findByEmail").error({ message: "findByEmail failed", error: error as Error });
            throw error;
        }
    }

    async get(id: string): Promise<AdminUser | null> {
        try {
        return prisma.adminUser.findUnique({ where: { id } });
    } catch (error) {
            logger.setContext("repository.adminAuth.get").error({ message: "get failed", error: error as Error });
            throw error;
        }
    }

    async updateGoogleIdAndLastLogin(id: string, googleId: string): Promise<AdminUser> {
        try {
        return prisma.adminUser.update({
            where: { id },
            data: { google_id: googleId, last_login_at: new Date() }
        });
    } catch (error) {
            logger.setContext("repository.adminAuth.updateGoogleIdAndLastLogin").error({ message: "updateGoogleIdAndLastLogin failed", error: error as Error });
            throw error;
        }
    }

    async updateLastLogin(id: string): Promise<AdminUser> {
        try {
        return prisma.adminUser.update({
            where: { id },
            data: { last_login_at: new Date() }
        });
    } catch (error) {
            logger.setContext("repository.adminAuth.updateLastLogin").error({ message: "updateLastLogin failed", error: error as Error });
            throw error;
        }
    }
}
