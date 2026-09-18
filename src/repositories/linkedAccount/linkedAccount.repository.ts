import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { LinkedAccount } from "../../../generated/prisma/client";
import { CreateLinkedAccountRequest } from "./request";

const logger = new TLogger(Layer.REPOSITORY);

export default class LinkedAccountRepository {
    constructor() { }

    async listByUserId(userId: string, transactionId?: string): Promise<LinkedAccount[]> {
        try {
        return prisma.linkedAccount.findMany({
            where: { user_id: userId }
        });
    } catch (error) {
            logger.setContext("repository.linkedAccount.listByUserId", transactionId).error({ message: "listByUserId failed", error: error as Error });
            throw error;
        }
    }

    async getByUserIdAndPlatform(userId: string, platform: string, transactionId?: string): Promise<LinkedAccount | null> {
        try {
        return prisma.linkedAccount.findUnique({
            where: {
                user_id_platform: {
                    user_id: userId,
                    platform
                }
            }
        });
    } catch (error) {
            logger.setContext("repository.linkedAccount.getByUserIdAndPlatform", transactionId).error({ message: "getByUserIdAndPlatform failed", error: error as Error });
            throw error;
        }
    }

    async create(request: CreateLinkedAccountRequest, transactionId?: string): Promise<LinkedAccount> {
        try {
        return prisma.linkedAccount.create({
            data: request
        });
    } catch (error) {
            logger.setContext("repository.linkedAccount.create", transactionId).error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    async delete(userId: string, platform: string, transactionId?: string): Promise<LinkedAccount> {
        try {
        return prisma.linkedAccount.delete({
            where: {
                user_id_platform: {
                    user_id: userId,
                    platform
                }
            }
        });
    } catch (error) {
            logger.setContext("repository.linkedAccount.delete", transactionId).error({ message: "delete failed", error: error as Error });
            throw error;
        }
    }

    async update(id: string, data: Partial<LinkedAccount>, transactionId?: string): Promise<LinkedAccount> {
        try {
        return prisma.linkedAccount.update({
            where: { id },
            data
        });
    } catch (error) {
            logger.setContext("repository.linkedAccount.update", transactionId).error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async listExpiring(before: Date, transactionId?: string): Promise<LinkedAccount[]> {
        try {
        return prisma.linkedAccount.findMany({
            where: {
                token_expires_at: {
                    lt: before
                },
                refresh_token: {
                    not: null
                }
            }
        });
    } catch (error) {
            logger.setContext("repository.linkedAccount.listExpiring", transactionId).error({ message: "listExpiring failed", error: error as Error });
            throw error;
        }
    }
}
