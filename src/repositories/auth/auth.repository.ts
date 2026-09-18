import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { Auth } from "../../../generated/prisma/client";
import { UpdateTwitchTokenRequest } from "./request";

const logger = new TLogger(Layer.REPOSITORY);

export default class AuthRepository {
    constructor() { }

    async create(userId: string): Promise<Auth> {
        try {
        return prisma.auth.create({
            data: {
                user_id: userId,
            }
        })
    } catch (error) {
            logger.setContext("repository.auth.create").error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    async updateTwitchToken(userId: string, request: UpdateTwitchTokenRequest): Promise<Auth> {
        try {
        return prisma.auth.upsert({
            where: {
                user_id: userId
            },
            update: request,
            create: {
                user_id: userId,
                ...request
            }
        })
    } catch (error) {
            logger.setContext("repository.auth.updateTwitchToken").error({ message: "updateTwitchToken failed", error: error as Error });
            throw error;
        }
    }

    async getByUserId(userId: string): Promise<Auth | null> {
        try {
        return prisma.auth.findUnique({
            where: {
                user_id: userId
            }
        })
    } catch (error) {
            logger.setContext("repository.auth.getByUserId").error({ message: "getByUserId failed", error: error as Error });
            throw error;
        }
    }

    async getByTwitchRefreshToken(twitchRefreshToken: string) {
        try {
        return prisma.auth.findUnique({
            where: {
                twitch_refresh_token: twitchRefreshToken
            }
        })
    } catch (error) {
            logger.setContext("repository.auth.getByTwitchRefreshToken").error({ message: "getByTwitchRefreshToken failed", error: error as Error });
            throw error;
        }
    }
}