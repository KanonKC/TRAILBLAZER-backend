import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { CreateUploadedFileRequest, ListUploadedFileRequest, UpdateUploadedFileRequest } from "./request";
import { UploadedFileFilters } from "@/services/uploadedFile/request";
import { Pagination } from "@/services/response";
import { UploadedFile } from "generated/prisma/client";

const logger = new TLogger(Layer.REPOSITORY);

export class UploadedFileRepository {
    constructor() { }

    async create(request: CreateUploadedFileRequest, transactionId?: string) {
        try {
        return prisma.uploadedFile.create({
            data: request
        })
    } catch (error) {
            logger.setContext("repository.uploadedFile.create", transactionId).error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    async get(id: string, transactionId?: string) {
        try {
        return prisma.uploadedFile.findUnique({
            where: {
                id
            }
        })
    } catch (error) {
            logger.setContext("repository.uploadedFile.get", transactionId).error({ message: "get failed", error: error as Error });
            throw error;
        }
    }

    async getByName(ownerId: string, name: string, transactionId?: string) {
        try {
        return prisma.uploadedFile.findFirst({
            where: {
                owner_id: ownerId,
                name: name
            }
        })
    } catch (error) {
            logger.setContext("repository.uploadedFile.getByName", transactionId).error({ message: "getByName failed", error: error as Error });
            throw error;
        }
    }

    async listByPattern(ownerId: string, base: string, ext: string, transactionId?: string) {
        try {
        return prisma.uploadedFile.findMany({
            where: {
                owner_id: ownerId,
                name: {
                    startsWith: base,
                    endsWith: ext
                }
            },
            select: {
                name: true
            }
        })
    } catch (error) {
            logger.setContext("repository.uploadedFile.listByPattern", transactionId).error({ message: "listByPattern failed", error: error as Error });
            throw error;
        }
    }

    async list(request: ListUploadedFileRequest, pagination: Pagination, transactionId?: string): Promise<[UploadedFile[], number]> {
        try {
        const where: any = {
            owner_id: request.ownerId
        }

        if (request.search && request.search.length >= 3) {
            where.name = {
                contains: request.search
            }
        }

        if (request.types && request.types.length > 0) {
            where.type = {
                in: request.types
            }
        }

        const data = await prisma.uploadedFile.findMany({
            where,
            skip: (pagination.page - 1) * pagination.limit,
            take: pagination.limit,
            orderBy: {
                created_at: 'desc'
            }
        })

        const count = await prisma.uploadedFile.count({
            where
        })

        return [data, count]
    } catch (error) {
            logger.setContext("repository.uploadedFile.list", transactionId).error({ message: "list failed", error: error as Error });
            throw error;
        }
    }

    async getTotalFileSize(ownerId: string, transactionId?: string): Promise<number> {
        try {
        const res = await prisma.uploadedFile.aggregate({
            where: {
                owner_id: ownerId
            },
            _sum: {
                size_kb: true
            }
        })

        return res._sum.size_kb || 0
    } catch (error) {
            logger.setContext("repository.uploadedFile.getTotalFileSize", transactionId).error({ message: "getTotalFileSize failed", error: error as Error });
            throw error;
        }
    }

    async update(id: string, request: UpdateUploadedFileRequest, transactionId?: string) {
        try {
        return prisma.uploadedFile.update({
            where: {
                id
            },
            data: request
        })
    } catch (error) {
            logger.setContext("repository.uploadedFile.update", transactionId).error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async delete(id: string, transactionId?: string) {
        try {
        return prisma.uploadedFile.delete({
            where: {
                id
            }
        })
    } catch (error) {
            logger.setContext("repository.uploadedFile.delete", transactionId).error({ message: "delete failed", error: error as Error });
            throw error;
        }
    }
}