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

    async extend(transactionId: string, uf: UploadedFile): Promise<UploadedFileResponse> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.uploadedFile.extend", transactionId);
        logger.info({ message: "Extending uploaded file with signed URL", data: { id: uf.id } });
        const url = await s3.getSignedURL(uf.key, { expiresIn: 3600 })
        return {
            ...uf,
            url
        }
    }

    async create(transactionId: string, userId: string, file: { buffer: Buffer, filename: string, mimetype: string }) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.uploadedFile.create", transactionId);
        logger.info({ message: "Creating new uploaded file", data: { userId, filename: file.filename, mimetype: file.mimetype } });

        const currentTotalSize = await this.getTotalFileSize(transactionId, userId);
        const fileSizeKb = Math.round(file.buffer.length / 1024);
        const maxStorageMb = await this.userService.getMaxStorageMB(transactionId, userId)
        const limitKb = maxStorageMb * 1024;

        if (currentTotalSize.total_size_kb + fileSizeKb > limitKb) {
            logger.warn({ message: "Storage limit reached", data: { userId, currentTotalSize, fileSizeKb, limitKb } });
            throw new BadRequestError(`Storage limit reached (${maxStorageMb} MB). Please delete some files and try again.`);
        }

        const random = randomBytes(16).toString("hex")
        const key = `users/${userId}/${random}`
        await s3.uploadFile(file.buffer, key, file.mimetype)

        let filename = file.filename;
        const ext = path.extname(file.filename);
        const base = path.basename(file.filename, ext);

        const existingFiles = await this.ufr.listByPattern(transactionId, userId, base, ext);
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

        await this.ufr.create(transactionId, {
            name: filename,
            type: file.mimetype,
            owner_id: userId,
            key: key,
            size_kb: fileSizeKb
        })
        await redis.del(`uploadedFile:totalSize:${userId}`)
    }

    async get(transactionId: string, id: string, userId: string): Promise<UploadedFileResponse> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.uploadedFile.get", transactionId);
        logger.info({ message: "Getting uploaded file", data: { id, userId } });
        const cacheKey = `uploadedFile:${id}`
        const cachedData = await redis.get(cacheKey)
        if (cachedData) {
            logger.info({ message: "Found file in cache", data: { id } });
            return JSON.parse(cachedData)
        }
        const data = await this.ufr.get(transactionId, id)
        if (!data) {
            logger.warn({ message: "File not found", data: { id } });
            throw new NotFoundError("File not found")
        }
        if (data.owner_id !== userId) {
            logger.warn({ message: "User not allowed to access this file", data: { id, userId, ownerId: data.owner_id } });
            throw new ForbiddenError("You are not allowed to access this file")
        }
        const res = await this.extend(transactionId, data)
        redis.set(cacheKey, JSON.stringify(res), TTL.ONE_HOUR)
        return res
    }

    async list(transactionId: string, userId: string, filters: UploadedFileFilters, pagination: Pagination): Promise<ListResponse<UploadedFileResponse>> {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.uploadedFile.list", transactionId);
        logger.info({ message: "Listing uploaded files", data: { userId, filters, pagination } });

        const req: ListUploadedFileRequest = {
            search: filters.search,
            types: filters.type === "audio" ? ["application/ogg", "audio/mpeg", "audio/mp3", "audio/wav"] : undefined,
            ownerId: userId
        }

        try {
            const [data, count] = await this.ufr.list(transactionId, req, pagination)
            const extendData = await Promise.all(data.map(async (file) => {
                return this.extend(transactionId, file)
            }))
            const res = {
                data: extendData,
                pagination: {
                    ...pagination,
                    total: count
                }
            }
            logger.info({ message: "Listed uploaded files successfully", data: { ...res } })
            return res
        } catch (error) {
            logger.error({ message: "Failed to list uploaded files", data: { userId, filters, pagination }, error: String(error) })
            throw error
        }
    }

    async update(transactionId: string, id: string, userId: string, request: UpdateUploadedFileRequest) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.uploadedFile.update", transactionId);
        logger.info({ message: "Updating uploaded file", data: { id, userId, request } });
        const data = await this.ufr.get(transactionId, id)
        if (!data) {
            logger.warn({ message: "File not found for update", data: { id } });
            throw new NotFoundError("File not found")
        }
        if (data.owner_id !== userId) {
            logger.warn({ message: "User not allowed to update this file", data: { id, userId, ownerId: data.owner_id } });
            throw new ForbiddenError("You are not allowed to update this file")
        }
        return this.ufr.update(transactionId, id, request)
    }

    async delete(transactionId: string, id: string, userId: string) {
        let logger: TLogger = this.logger;
        logger = this.logger.setContext("service.uploadedFile.delete", transactionId);
        logger.info({ message: "Deleting uploaded file", data: { id, userId } });
        const data = await this.ufr.get(transactionId, id)
        if (!data) {
            logger.warn({ message: "File not found for deletion", data: { id } });
            throw new NotFoundError("File not found")
        }
        if (data.owner_id !== userId) {
            logger.warn({ message: "User not allowed to delete this file", data: { id, userId, ownerId: data.owner_id } });
            throw new ForbiddenError("You are not allowed to delete this file")
        }
        const res = await this.ufr.delete(transactionId, id)
        await redis.del(`uploadedFile:totalSize:${userId}`)
        return res
    }

    async getTotalFileSize(transactionId: string, ownerId: string): Promise<TotalFileSizeResponse> {
        const cacheKey = `uploadedFile:totalSize:${ownerId}`
        const cachedData = await redis.get(cacheKey)
        if (cachedData) {
            return JSON.parse(cachedData)
        }
        const totalFileSize = await this.ufr.getTotalFileSize(transactionId, ownerId)
        const maxFileSize = await this.userService.getMaxStorageMB(transactionId, ownerId)
        const res = {
            total_size_kb: totalFileSize,
            max_storage_kb: maxFileSize * 1024
        }
        redis.set(cacheKey, JSON.stringify(res), TTL.ONE_HOUR)
        return res
    }
}