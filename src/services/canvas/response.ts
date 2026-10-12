import { CanvasTemplateType } from "./request";

export interface CanvasMediaResponse {
    key: string;
    name: string;
    type: string;
    url: string;
    duration_ms: number | null;
}

export interface CanvasResponse {
    id: string;
    name: string;
    template_type: CanvasTemplateType;
    enabled: boolean;
    duration_ms: number;
    volume: number;
    image: CanvasMediaResponse | null;
    audio: CanvasMediaResponse | null;
    video: CanvasMediaResponse | null;
    widget_ids: string[];
    triggered_count: number;
    created_at: Date;
    updated_at: Date;
}

/** What an overlay needs to play a canvas. URLs are signed at dispatch time. */
export interface CanvasPlayback {
    canvas_id: string;
    template_type: CanvasTemplateType;
    image_url: string | null;
    audio_url: string | null;
    video_url: string | null;
    volume: number;
    duration_ms: number;
}
