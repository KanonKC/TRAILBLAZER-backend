import { Pagination } from "@/services/response";

export interface CreateUploadedFileRequest {
    key: string;
    name: string;
    type: string;
    owner_id: string;
    size_kb: number;
    /** Playback length for audio files; null when unknown or not audio. */
    duration_ms?: number | null;
}

export interface UpdateUploadedFileRequest {
    name?: string;
}

export interface ListUploadedFileRequest {
    ownerId: string;
    search?: string;
    types?: string[];
}