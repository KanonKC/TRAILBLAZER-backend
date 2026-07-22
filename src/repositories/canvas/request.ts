export enum CanvasElementType {
    IMAGE = "image",
    VIDEO = "video",
    AUDIO = "audio",
    TEXT = "text"
}

export interface CreateCanvas {
    name: string;
    owner_id: string;
    duration_ms?: number;
}

export interface UpdateCanvas {
    name?: string;
    enabled?: boolean;
    duration_ms?: number;
}

export interface CanvasElementInput {
    id?: string;
    type: CanvasElementType;
    media_key?: string | null;
    text_content?: string | null;
    text_style?: Record<string, unknown> | null;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    z_index?: number;
    opacity?: number;
    start_delay_ms?: number;
    duration_ms?: number;
    enter_transition?: string;
    exit_transition?: string;
    transition_ms?: number;
    volume?: number;
    loop?: boolean;
}
