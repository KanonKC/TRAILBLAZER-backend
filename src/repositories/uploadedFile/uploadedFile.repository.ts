import { prisma } from "@/libs/prisma";
import { CreateUploadedFileRequest, ListUploadedFileRequest, UpdateUploadedFileRequest } from "./request";
import { UploadedFileFilters } from "@/services/uploadedFile/request";
import { Pagination } from "@/services/response";
import { UploadedFile } from "generated/prisma/client";

export class UploadedFileRepository {
    constructor() { }

    async create(request: CreateUploadedFileRequest) {
        return prisma.uploadedFile.create({
            data: request
        })
    }

    async get(id: string) {
        return prisma.uploadedFile.findUnique({
            where: {
                id
            }
        })
    }

    async getByName(ownerId: string, name: string) {
        return prisma.uploadedFile.findFirst({
            where: {
                owner_id: ownerId,
                name: name
            }
        })
    }

    async listByPattern(ownerId: string, base: string, ext: string) {
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
    }

    async list(request: ListUploadedFileRequest, pagination: Pagination): Promise<[UploadedFile[], number]> {
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
    }

    async getTotalFileSize(ownerId: string): Promise<number> {
        const res = await prisma.uploadedFile.aggregate({
            where: {
                owner_id: ownerId
            },
            _sum: {
                size_kb: true
            }
        })

        return res._sum.size_kb || 0
    }

    async update(id: string, request: UpdateUploadedFileRequest) {
        return prisma.uploadedFile.update({
            where: {
                id
            },
            data: request
        })
    }

    async delete(id: string) {
        return prisma.uploadedFile.delete({
            where: {
                id
            }
        })
    }
}