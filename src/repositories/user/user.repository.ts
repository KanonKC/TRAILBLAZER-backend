import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { Pagination } from "@/services/response";
import { User } from "../../../generated/prisma/client";
import { UserWhereInput } from "generated/prisma/models";
import { CreateUserRequest } from "./request";

const logger = new TLogger(Layer.REPOSITORY);

export default class UserRepository {
    constructor() { }

    async create(request: CreateUserRequest): Promise<User> {
        try {
        return prisma.user.create({
            data: request
        })
    } catch (error) {
            logger.setContext("repository.user.create").error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    async upsert(request: CreateUserRequest): Promise<User> {
        try {
        return prisma.user.upsert({
            where: {
                twitch_id: request.twitch_id
            },
            create: request,
            update: request
        })
    } catch (error) {
            logger.setContext("repository.user.upsert").error({ message: "upsert failed", error: error as Error });
            throw error;
        }
    }

    async get(id: string): Promise<User | null> {
        try {
        return prisma.user.findUnique({ where: { id } })
    } catch (error) {
            logger.setContext("repository.user.get").error({ message: "get failed", error: error as Error });
            throw error;
        }
    }

    async getByTwitchId(twitchId: string) {
        try {
        return prisma.user.findUnique({ where: { twitch_id: twitchId }, include: { auth: true } })
    } catch (error) {
            logger.setContext("repository.user.getByTwitchId").error({ message: "getByTwitchId failed", error: error as Error });
            throw error;
        }
    }

    async count(search?: string, tier?: number, isShowcase?: boolean): Promise<number> {
        try {
        return prisma.user.count({ where: this.buildFilterWhere(search, tier, isShowcase) });
    } catch (error) {
            logger.setContext("repository.user.count").error({ message: "count failed", error: error as Error });
            throw error;
        }
    }

    async findMany(skip: number, take: number, search?: string, tier?: number, isShowcase?: boolean) {
        try {
        return prisma.user.findMany({
            where: this.buildFilterWhere(search, tier, isShowcase),
            skip,
            take,
            orderBy: { created_at: 'desc' },
            include: {
                _count: { select: { widgets: true } }
            }
        });
    } catch (error) {
            logger.setContext("repository.user.findMany").error({ message: "findMany failed", error: error as Error });
            throw error;
        }
    }

    private buildFilterWhere(search?: string, tier?: number, isShowcase?: boolean): UserWhereInput | undefined {
        const where: UserWhereInput = {};

        if (search) {
            where.OR = [
                { username: { contains: search, mode: "insensitive" } },
                { display_name: { contains: search, mode: "insensitive" } },
                { id: { contains: search, mode: "insensitive" } },
            ];
        }

        if (tier !== undefined) {
            where.tier = tier;
        }

        if (isShowcase !== undefined) {
            where.is_showcase = isShowcase;
        }

        return Object.keys(where).length > 0 ? where : undefined;
    }

    async update(id: string, request: Partial<User>, tx?: any): Promise<User> {
        try {
        const client = tx || prisma;
        return client.user.update({
            where: { id },
            data: request
        })
    } catch (error) {
            logger.setContext("repository.user.update").error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async listExpired(pagination: Pagination, excludeIds: string[] = []): Promise<User[]> {
        try {
        const now = new Date()
        return prisma.user.findMany({
            where: {
                tier_expire_at: {
                    lt: now
                },
                id: {
                    notIn: excludeIds
                }
            },
            skip: (pagination.page - 1) * pagination.limit,
            take: pagination.limit
        })
    } catch (error) {
            logger.setContext("repository.user.listExpired").error({ message: "listExpired failed", error: error as Error });
            throw error;
        }
    }

    async listByIds(ids: string[], pagination: Pagination): Promise<User[]> {
        try {
        return prisma.user.findMany({
            where: {
                id: {
                    in: ids
                }
            },
            skip: (pagination.page - 1) * pagination.limit,
            take: pagination.limit
        })
    } catch (error) {
            logger.setContext("repository.user.listByIds").error({ message: "listByIds failed", error: error as Error });
            throw error;
        }
    }

    async listShowcase(): Promise<Partial<User>[]> {
        try {
        return prisma.user.findMany({
            where: {
                is_showcase: true
            },
            select: {
                display_name: true,
                username: true,
                avatar_url: true
            }
        })
    } catch (error) {
            logger.setContext("repository.user.listShowcase").error({ message: "listShowcase failed", error: error as Error });
            throw error;
        }
    }
}