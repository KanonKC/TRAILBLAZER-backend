import { UploadedFile } from "generated/prisma/client";

export interface UploadedFileResponse extends UploadedFile {
    url: string
}

export interface TotalFileSizeResponse {
    total_size_kb: number
    max_storage_kb: number
}