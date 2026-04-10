import { prisma } from "@/libs/prisma";
import { LinkedAccount } from "../../../generated/prisma/client";
import { CreateLinkedAccountRequest } from "./request";

export default class LinkedAccountRepository {
    constructor() { }

    async listByUserId(userId: string): Promise<LinkedAccount[]> {
        return prisma.linkedAccount.findMany({
            where: { user_id: userId }
        });
    }

    async getByUserIdAndPlatform(userId: string, platform: string): Promise<LinkedAccount | null> {
        return prisma.linkedAccount.findUnique({
            where: {
                user_id_platform: {
                    user_id: userId,
                    platform
                }
            }
        });
    }

    async create(request: CreateLinkedAccountRequest): Promise<LinkedAccount> {
        return prisma.linkedAccount.create({
            data: request
        });
    }

    async delete(userId: string, platform: string): Promise<LinkedAccount> {
        return prisma.linkedAccount.delete({
            where: {
                user_id_platform: {
                    user_id: userId,
                    platform
                }
            }
        });
    }

    async update(id: string, data: Partial<LinkedAccount>): Promise<LinkedAccount> {
        return prisma.linkedAccount.update({
            where: { id },
            data
        });
    }
}
