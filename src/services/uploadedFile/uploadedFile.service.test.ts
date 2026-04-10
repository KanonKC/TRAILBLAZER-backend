import { UploadedFileService } from "./uploadedFile.service";
import { UploadedFileRepository } from "@/repositories/uploadedFile/uploadedFile.repository";
import s3 from "@/libs/awsS3";
import redis, { TTL } from "@/libs/redis";
import { randomBytes } from "crypto";
import { NotFoundError, ForbiddenError } from "@/errors";

jest.mock("@/libs/awsS3", () => ({
    getSignedURL: jest.fn(),
    uploadFile: jest.fn(),
}));

jest.mock("@/libs/redis", () => ({
    get: jest.fn(),
    set: jest.fn(),
    TTL: {
        ONE_HOUR: 3600,
    },
}));

jest.mock("crypto", () => ({
    randomBytes: jest.fn().mockReturnValue(Buffer.from("random_bytes")),
    randomUUID: jest.fn().mockReturnValue("mocked_uuid"),
}));

describe("UploadedFileService", () => {
    let service: UploadedFileService;
    let mockUploadedFileRepo: jest.Mocked<UploadedFileRepository>;

    beforeEach(() => {
        mockUploadedFileRepo = {
            create: jest.fn(),
            get: jest.fn(),
            list: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        } as any;

        service = new UploadedFileService(mockUploadedFileRepo);
        jest.clearAllMocks();
    });

    describe("extend", () => {
        it("should extend uploaded file with signed URL", async () => {
            const mockFile = { id: "1", key: "test-key" } as any;
            (s3.getSignedURL as jest.Mock).mockResolvedValue("https://signed-url.com");

            const result = await service.extend(mockFile);

            expect(result.url).toBe("https://signed-url.com");
            expect(s3.getSignedURL).toHaveBeenCalledWith("test-key", { expiresIn: 3600 });
        });
    });

    describe("create", () => {
        it("should upload file to S3 and create database record", async () => {
            const userId = "user1";
            const file = {
                buffer: Buffer.from("file-content"),
                filename: "test.png",
                mimetype: "image/png",
            };

            await service.create(userId, file);

            expect(s3.uploadFile).toHaveBeenCalledWith(file.buffer, expect.stringContaining(`users/${userId}/`), file.mimetype);
            expect(mockUploadedFileRepo.create).toHaveBeenCalledWith(expect.objectContaining({
                name: file.filename,
                type: file.mimetype,
                owner_id: userId,
            }));
        });
    });

    describe("get", () => {
        const id = "1";
        const userId = "user1";

        it("should return file from cache if available", async () => {
            const cachedFile = { id: "1", name: "cached.png" };
            (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(cachedFile));

            const result = await service.get(id, userId);

            expect(result).toEqual(cachedFile);
            expect(mockUploadedFileRepo.get).not.toHaveBeenCalled();
        });

        it("should fetch from repository, extend, and cache if not in cache", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            const mockFile = { id: "1", name: "db.png", owner_id: userId, key: "key" };
            mockUploadedFileRepo.get.mockResolvedValue(mockFile as any);
            (s3.getSignedURL as jest.Mock).mockResolvedValue("http://url");

            const result = await service.get(id, userId);

            expect(result.name).toBe("db.png");
            expect(result.url).toBe("http://url");
            expect(redis.set).toHaveBeenCalledWith(`uploadedFile:${id}`, JSON.stringify(result), TTL.ONE_HOUR);
        });

        it("should throw NotFoundError if file does not exist", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockUploadedFileRepo.get.mockResolvedValue(null);

            await expect(service.get(id, userId)).rejects.toThrow(NotFoundError);
        });

        it("should throw ForbiddenError if user is not the owner", async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            mockUploadedFileRepo.get.mockResolvedValue({ id: "1", owner_id: "other_user" } as any);

            await expect(service.get(id, userId)).rejects.toThrow(ForbiddenError);
        });
    });

    describe("list", () => {
        const userId = "user1";
        const pagination = { page: 1, limit: 10 };

        it("should list uploaded files and map audio types", async () => {
            const filters = { type: "audio" };
            const mockFiles = [{ id: "1", key: "key1" }, { id: "2", key: "key2" }];
            mockUploadedFileRepo.list.mockResolvedValue([mockFiles, 2] as any);
            (s3.getSignedURL as jest.Mock).mockResolvedValue("http://url");

            const result = await service.list(userId, filters as any, pagination);

            expect(result.data.length).toBe(2);
            expect(result.pagination.total).toBe(2);
            expect(mockUploadedFileRepo.list).toHaveBeenCalledWith(
                expect.objectContaining({ types: ["application/ogg", "audio/mpeg", "audio/mp3", "audio/wav"] }),
                pagination
            );
        });

        it("should list uploaded files without specific type filter", async () => {
            const filters = { search: "test" };
            mockUploadedFileRepo.list.mockResolvedValue([[], 0] as any);

            await service.list(userId, filters as any, pagination);

            expect(mockUploadedFileRepo.list).toHaveBeenCalledWith(
                expect.objectContaining({ types: undefined, search: "test" }),
                pagination
            );
        });

        it("should throw error if repository fails", async () => {
            mockUploadedFileRepo.list.mockRejectedValue(new Error("DB Error"));
            await expect(service.list(userId, {}, pagination as any)).rejects.toThrow("DB Error");
        });
    });

    describe("update", () => {
        const id = "1";
        const userId = "user1";
        const request = { name: "new-name.png" };

        it("should update file successfully", async () => {
            mockUploadedFileRepo.get.mockResolvedValue({ id: "1", owner_id: userId } as any);
            mockUploadedFileRepo.update.mockResolvedValue({ id: "1" } as any);

            await service.update(id, userId, request);

            expect(mockUploadedFileRepo.update).toHaveBeenCalledWith(id, request);
        });

        it("should throw NotFoundError if missing", async () => {
            mockUploadedFileRepo.get.mockResolvedValue(null);
            await expect(service.update(id, userId, request)).rejects.toThrow(NotFoundError);
        });

        it("should throw ForbiddenError if not owner", async () => {
            mockUploadedFileRepo.get.mockResolvedValue({ id: "1", owner_id: "other" } as any);
            await expect(service.update(id, userId, request)).rejects.toThrow(ForbiddenError);
        });
    });

    describe("delete", () => {
        const id = "1";
        const userId = "user1";

        it("should delete successfully", async () => {
            mockUploadedFileRepo.get.mockResolvedValue({ id: "1", owner_id: userId } as any);
            await service.delete(id, userId);
            expect(mockUploadedFileRepo.delete).toHaveBeenCalledWith(id);
        });

        it("should throw NotFoundError if missing", async () => {
            mockUploadedFileRepo.get.mockResolvedValue(null);
            await expect(service.delete(id, userId)).rejects.toThrow(NotFoundError);
        });

        it("should throw ForbiddenError if not owner", async () => {
            mockUploadedFileRepo.get.mockResolvedValue({ id: "1", owner_id: "other" } as any);
            await expect(service.delete(id, userId)).rejects.toThrow(ForbiddenError);
        });
    });
});
