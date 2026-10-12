export enum CanvasTemplateType {
    IMAGE_AUDIO = "image_audio",
    VIDEO = "video",
}

export interface SaveCanvasRequest {
    name: string;
    template_type: CanvasTemplateType;
    enabled?: boolean;
    /** Only used when the template has no audio/video to take its length from. */
    duration_ms?: number;
    image_key?: string | null;
    audio_key?: string | null;
    video_key?: string | null;
    volume?: number;
}
