export interface CanvasElementInput {
    type: "image" | "audio" | "video";
    media_key: string;
    volume: number;
}

export interface CreateCanvas {
    owner_id: string;
    name: string;
    template_type: string;
    enabled: boolean;
    duration_ms: number;
    elements: CanvasElementInput[];
}

export interface UpdateCanvas {
    name: string;
    template_type: string;
    enabled: boolean;
    duration_ms: number;
    elements: CanvasElementInput[];
}
