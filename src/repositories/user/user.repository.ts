import { prisma } from "@/libs/prisma";
import { Pagination } from "@/services/response";
import { User } from "../../../generated/prisma/client";
import { CreateUserRequest } from "./request";

export default class UserRepository {
    constructor() { }

    async create(request: CreateUserRequest): Promise<User> {
        return prisma.user.create({
            data: request
        })
    }

    async upsert(request: CreateUserRequest): Promise<User> {
        return prisma.user.upsert({
            where: {
                twitch_id: request.twitch_id
            },
            create: request,
            update: request
        })
    }

    async get(id: string): Promise<User | null> {
        return prisma.user.findUnique({ where: { id } })
    }

    async getByTwitchId(twitchId: string) {
        return prisma.user.findUnique({ where: { twitch_id: twitchId }, include: { auth: true } })
    }

    async count(): Promise<number> {
        return prisma.user.count();
    }

    async findMany(skip: number, take: number): Promise<User[]> {
        return prisma.user.findMany({
            skip,
            take,
            orderBy: { id: 'asc' }
        });
    }

    async update(id: string, request: Partial<User>, tx?: any): Promise<User> {
        const client = tx || prisma;
        return client.user.update({
            where: { id },
            data: request
        })
    }

    async listExpired(pagination: Pagination, excludeIds: string[] = []): Promise<User[]> {
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
    }

    async listByIds(ids: string[], pagination: Pagination): Promise<User[]> {
        return prisma.user.findMany({
            where: {
                id: {
                    in: ids
                }
            },
            skip: (pagination.page - 1) * pagination.limit,
            take: pagination.limit
        })
    }

    async listShowcase(): Promise<Partial<User>[]> {
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
    }
}