import { UploadedFileRepository } from "@/repositories/uploadedFile/uploadedFile.repository"
import { CreateUploadedFileRequest, UpdateUploadedFileRequest, UploadedFileFilters } from "./request"
import { prisma } from "@/libs/prisma"
import s3 from "@/libs/awsS3"
import { randomBytes } from "crypto"
import { NotFoundError, ForbiddenError, BadRequestError } from "@/errors"
import { TotalFileSizeResponse, UploadedFileResponse } from "./response"
import { UploadedFile } from "generated/prisma/client"
import redis, { TTL } from "@/libs/redis"
import { ListResponse, Pagination } from "../response"
import { ListUploadedFileRequest } from "@/repositories/uploadedFile/request"
import TLogger, { Layer } from "@/logging/logger"
import Configurations from "@/config/index"
import path from "path"
import UserService from "../user/user.service"
import { UserTier } from "../user/constant"

const TYPE_FILTERS: Record<string, { types?: string[]; prefix?: string }> = {
    audio: { types: ["application/ogg", "audio/mpeg", "audio/mp3", "audio/wav"], prefix: "audio/" },
    image: { prefix: "image/" },
    video: { prefix: "video/" },
}

export class UploadedFileService {
    private ufr: UploadedFileRepository
    private logger: TLogger;
    public config: Configurations;
    private userService: UserService;

    constructor(
        config: Configurations,
        uploadedFileRepository: UploadedFileRepository,
        userService: UserService
    ) {
        this.config = config
        this.ufr = uploadedFileRepository
        this.logger = new TLogger(Layer.SERVICE)
        this.userService = userService
    }

    async extend(uf: UploadedFile): Promise<UploadedFileResponse> {
        this.logger.setContext("service.uploadedFile.extend");
        this.logger.info({ message: "Extending uploaded file with signed URL", data: { id: uf.id } });
        const url = await s3.getSignedURL(uf.key, { expiresIn: 3600 })
        return {
            ...uf,
            url
        }
    }

    async create(userId: string, file: { buffer: Buffer, filename: string, mimetype: string }) {
        this.logger.setContext("service.uploadedFile.create");
        this.logger.info({ message: "Creating new uploaded file", data: { userId, filename: file.filename, mimetype: file.mimetype } });

        const currentTotalSize = await this.getTotalFileSize(userId);
        const fileSizeKb = Math.round(file.buffer.length / 1024);
        const maxStorageMb = await this.userService.getMaxStorageMB(userId)
        const limitKb = maxStorageMb * 1024;

        if (currentTotalSize.total_size_kb + fileSizeKb > limitKb) {
            this.logger.warn({ message: "Storage limit reached", data: { userId, currentTotalSize, fileSizeKb, limitKb } });
            throw new BadRequestError(`Storage limit reached (${maxStorageMb} MB). Please delete some files and try again.`);
        }

        const random = randomBytes(16).toString("hex")
        const key = `users/${userId}/${random}`
        await s3.uploadFile(file.buffer, key, file.mimetype)

        let filename = file.filename;
        const ext = path.extname(file.filename);
        const base = path.basename(file.filename, ext);

        const existingFiles = await this.ufr.listByPattern(userId, base, ext);
        const fileNames = existingFiles.map(f => f.name);

        if (fileNames.includes(filename)) {
            const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const escapedExt = ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`^${escapedBase} \\((\\d+)\\)${escapedExt}$`);

            let maxCounter = 0;
            fileNames.forEach(name => {
                const match = name.match(pattern);
                if (match) {
                    const count = parseInt(match[1], 10);
                    maxCounter = Math.max(maxCounter, count);
                }
            });

            filename = `${base} (${maxCounter + 1})${ext}`;
        }

        await this.ufr.create({
            name: filename,
            type: file.mimetype,
            owner_id: userId,
            key: key,
            size_kb: fileSizeKb
        })
        await redis.del(`uploadedFile:totalSize:${userId}`)
    }

    async get(id: string, userId: string): Promise<UploadedFileResponse> {
        this.logger.setContext("service.uploadedFile.get");
        this.logger.info({ message: "Getting uploaded file", data: { id, userId } });
        const cacheKey = `uploadedFile:${id}`
        const cachedData = await redis.get(cacheKey)
        if (cachedData) {
            this.logger.info({ message: "Found file in cache", data: { id } });
            return JSON.parse(cachedData)
        }
        const data = await this.ufr.get(id)
        if (!data) {
            this.logger.warn({ message: "File not found", data: { id } });
            throw new NotFoundError("File not found")
        }
        if (data.owner_id !== userId) {
            this.logger.warn({ message: "User not allowed to access this file", data: { id, userId, ownerId: data.owner_id } });
            throw new ForbiddenError("You are not allowed to access this file")
        }
        const res = await this.extend(data)
        redis.set(cacheKey, JSON.stringify(res), TTL.ONE_HOUR)
        return res
    }

    async list(userId: string, filters: UploadedFileFilters, pagination: Pagination): Promise<ListResponse<UploadedFileResponse>> {
        this.logger.setContext("service.uploadedFile.list");
        this.logger.info({ message: "Listing uploaded files", data: { userId, filters, pagination } });

        const typeFilter = filters.type ? TYPE_FILTERS[filters.type] : undefined;

        const req: ListUploadedFileRequest = {
            search: filters.search,
            types: typeFilter?.types,
            typePrefix: typeFilter?.prefix,
            ownerId: userId
        }

        try {
            const [data, count] = await this.ufr.list(req, pagination)
            const extendData = await Promise.all(data.map(async (file) => {
                return this.extend(file)
            }))
            const res = {
                data: extendData,
                pagination: {
                    ...pagination,
                    total: count
                }
            }
            this.logger.info({ message: "Listed uploaded files successfully", data: { ...res } })
            return res
        } catch (error) {
            this.logger.error({ message: "Failed to list uploaded files", data: { userId, filters, pagination }, error: String(error) })
            throw error
        }
    }

    async update(id: string, userId: string, request: UpdateUploadedFileRequest) {
        this.logger.setContext("service.uploadedFile.update");
        this.logger.info({ message: "Updating uploaded file", data: { id, userId, request } });
        const data = await this.ufr.get(id)
        if (!data) {
            this.logger.warn({ message: "File not found for update", data: { id } });
            throw new NotFoundError("File not found")
        }
        if (data.owner_id !== userId) {
            this.logger.warn({ message: "User not allowed to update this file", data: { id, userId, ownerId: data.owner_id } });
            throw new ForbiddenError("You are not allowed to update this file")
        }
        return this.ufr.update(id, request)
    }

    async delete(id: string, userId: string) {
        this.logger.setContext("service.uploadedFile.delete");
        this.logger.info({ message: "Deleting uploaded file", data: { id, userId } });
        const data = await this.ufr.get(id)
        if (!data) {
            this.logger.warn({ message: "File not found for deletion", data: { id } });
            throw new NotFoundError("File not found")
        }
        if (data.owner_id !== userId) {
            this.logger.warn({ message: "User not allowed to delete this file", data: { id, userId, ownerId: data.owner_id } });
            throw new ForbiddenError("You are not allowed to delete this file")
        }
        const res = await this.ufr.delete(id)
        await redis.del(`uploadedFile:totalSize:${userId}`)
        return res
    }

    async getTotalFileSize(ownerId: string): Promise<TotalFileSizeResponse> {
        const cacheKey = `uploadedFile:totalSize:${ownerId}`
        const cachedData = await redis.get(cacheKey)
        if (cachedData) {
            return JSON.parse(cachedData)
        }
        const totalFileSize = await this.ufr.getTotalFileSize(ownerId)
        const maxFileSize = await this.userService.getMaxStorageMB(ownerId)
        const res = {
            total_size_kb: totalFileSize,
            max_storage_kb: maxFileSize * 1024
        }
        redis.set(cacheKey, JSON.stringify(res), TTL.ONE_HOUR)
        return res
    }
}