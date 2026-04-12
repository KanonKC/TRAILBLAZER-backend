export interface CreateExportVideo {
    twitch_id: string;
    owner_id: string;
    enabled?: boolean;
    privacy_status?: string;
    tags?: string[];
    description?: string | null;
}

export interface UpdateExportVideo {
    enabled?: boolean;
    privacy_status?: string;
    tags?: string[];
    description?: string | null;
}

export interface CreateExportVideoHistory {
    batch_id?: string | null;
    video_id: string;
    status: string;
    message?: string | null;
}
