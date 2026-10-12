import s3 from "@/libs/awsS3";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/errors";
import TLogger, { Layer } from "@/logging/logger";
import CanvasRepository from "@/repositories/canvas/canvas.repository";
import { CanvasElementInput } from "@/repositories/canvas/request";
import { CanvasWithRelations } from "@/repositories/canvas/response";
import WidgetService from "@/services/widget/widget.service";
import { CanvasTemplateType, SaveCanvasRequest } from "./request";
import { CanvasMediaResponse, CanvasPlayback, CanvasResponse } from "./response";

export const DEFAULT_CANVAS_DURATION_MS = 5000;
const SIGNED_URL_TTL_SECONDS = 3600;

type Slot = "image" | "audio" | "video";

export default class CanvasService {
    private readonly canvasRepository: CanvasRepository;
    private readonly widgetService: WidgetService;
    private readonly logger: TLogger;

    constructor(canvasRepository: CanvasRepository, widgetService: WidgetService) {
        this.canvasRepository = canvasRepository;
        this.widgetService = widgetService;
        this.logger = new TLogger(Layer.SERVICE);
    }

    async list(userId: string, transactionId?: string): Promise<CanvasResponse[]> {
        const logger = this.logger.setContext("service.canvas.list", transactionId);
        const canvases = await this.canvasRepository.list(userId);
        logger.info({ message: "Listed canvases", data: { userId, count: canvases.length } });
        return Promise.all(canvases.map((c) => this.toResponse(c)));
    }

    async get(id: string, userId: string, transactionId?: string): Promise<CanvasResponse> {
        const logger = this.logger.setContext("service.canvas.get", transactionId);
        const canvas = await this.findOwned(id, userId);
        logger.info({ message: "Got canvas", data: { id } });
        return this.toResponse(canvas);
    }

    async create(userId: string, request: SaveCanvasRequest, transactionId?: string): Promise<CanvasResponse> {
        const logger = this.logger.setContext("service.canvas.create", transactionId);
        const { elements, duration_ms } = await this.buildElements(userId, request);
        const created = await this.canvasRepository.create({
            owner_id: userId,
            name: request.name,
            template_type: request.template_type,
            enabled: request.enabled ?? true,
            duration_ms,
            elements,
        });
        logger.info({ message: "Created canvas", data: { id: created.id, templateType: created.template_type } });
        return this.toResponse(created);
    }

    async update(id: string, userId: string, request: SaveCanvasRequest, transactionId?: string): Promise<CanvasResponse> {
        const logger = this.logger.setContext("service.canvas.update", transactionId);
        await this.findOwned(id, userId);
        const { elements, duration_ms } = await this.buildElements(userId, request);
        const updated = await this.canvasRepository.update(id, {
            name: request.name,
            template_type: request.template_type,
            enabled: request.enabled ?? true,
            duration_ms,
            elements,
        });
        logger.info({ message: "Updated canvas", data: { id } });
        return this.toResponse(updated);
    }

    async delete(id: string, userId: string, transactionId?: string): Promise<void> {
        const logger = this.logger.setContext("service.canvas.delete", transactionId);
        await this.findOwned(id, userId);
        await this.canvasRepository.delete(id);
        logger.info({ message: "Deleted canvas", data: { id } });
    }

    /** Links (or, with null, unlinks) the one canvas a widget plays. */
    async setWidgetCanvas(widgetId: string, userId: string, canvasId: string | null, transactionId?: string): Promise<void> {
        const logger = this.logger.setContext("service.canvas.setWidgetCanvas", transactionId);
        await this.widgetService.authorizeOwnership(userId, widgetId);
        if (canvasId) {
            await this.findOwned(canvasId, userId);
        }
        await this.canvasRepository.setWidgetLink(widgetId, canvasId);
        logger.info({ message: "Set widget canvas", data: { widgetId, canvasId } });
    }

    /** Webhook path: no user to authorize, the widget id comes from our own config. */
    async getByWidgetId(widgetId: string): Promise<CanvasWithRelations | null> {
        return this.canvasRepository.getByWidgetId(widgetId);
    }

    /**
     * Returns null when the canvas is gone or switched off, so the overlay can
     * skip it instead of holding the queue for nothing.
     */
    async resolvePlayback(canvasId: string, transactionId?: string): Promise<CanvasPlayback | null> {
        const logger = this.logger.setContext("service.canvas.resolvePlayback", transactionId);
        const canvas = await this.canvasRepository.findById(canvasId);
        if (!canvas || !canvas.enabled) {
            logger.info({ message: "Canvas unavailable for playback", data: { canvasId, found: !!canvas } });
            return null;
        }

        const sign = async (slot: Slot) => {
            const key = canvas.elements.find((e) => e.type === slot)?.media_key;
            return key ? s3.getSignedURL(key, { expiresIn: SIGNED_URL_TTL_SECONDS }) : null;
        };
        const isVideo = canvas.template_type === CanvasTemplateType.VIDEO;

        return {
            canvas_id: canvas.id,
            template_type: canvas.template_type as CanvasTemplateType,
            image_url: isVideo ? null : await sign("image"),
            audio_url: isVideo ? null : await sign("audio"),
            video_url: isVideo ? await sign("video") : null,
            volume: this.volumeOf(canvas),
            duration_ms: canvas.duration_ms,
        };
    }

    private async findOwned(id: string, userId: string): Promise<CanvasWithRelations> {
        const canvas = await this.canvasRepository.findById(id);
        if (!canvas) {
            throw new NotFoundError("Canvas not found");
        }
        this.authorize(userId, canvas);
        return canvas;
    }

    private authorize(userId: string, canvas: CanvasWithRelations) {
        if (canvas.owner_id !== userId) {
            const logger = this.logger.setContext("service.canvas.authorize");
            logger.warn({ message: "You are not the owner of this canvas", data: { userId, canvasId: canvas.id } });
            throw new ForbiddenError("You are not the owner of this canvas");
        }
    }

    /**
     * Turns the flat request into canvas elements, checking every file belongs
     * to the caller and fits its slot. The canvas lasts as long as its sound or
     * video; only a silent image falls back to the streamer's chosen length.
     */
    private async buildElements(
        userId: string,
        request: SaveCanvasRequest
    ): Promise<{ elements: CanvasElementInput[]; duration_ms: number }> {
        const volume = request.volume ?? 100;
        const slots: Partial<Record<Slot, string>> =
            request.template_type === CanvasTemplateType.VIDEO
                ? { video: request.video_key ?? undefined }
                : { image: request.image_key ?? undefined, audio: request.audio_key ?? undefined };

        if (request.template_type === CanvasTemplateType.VIDEO && !slots.video) {
            throw new BadRequestError("A video template needs a video");
        }
        if (request.template_type === CanvasTemplateType.IMAGE_AUDIO && !slots.image && !slots.audio) {
            throw new BadRequestError("An image + audio template needs an image or an audio file");
        }

        const keys = Object.values(slots).filter((k): k is string => !!k);
        const files = await this.canvasRepository.findMediaByKeys(keys);
        const byKey = new Map(files.map((f) => [f.key, f]));

        const elements: CanvasElementInput[] = [];
        for (const [slot, key] of Object.entries(slots) as [Slot, string | undefined][]) {
            if (!key) continue;
            const file = byKey.get(key);
            if (!file) {
                throw new BadRequestError(`The selected ${slot} file no longer exists`);
            }
            if (file.owner_id !== userId) {
                throw new ForbiddenError("You are not allowed to use this file");
            }
            if (!fitsSlot(slot, file.type)) {
                throw new BadRequestError(`The selected file is not a valid ${slot}`);
            }
            elements.push({ type: slot, media_key: key, volume });
        }

        const timedKey = slots.video ?? slots.audio;
        const timed = timedKey ? byKey.get(timedKey) : undefined;
        const duration_ms = timed?.duration_ms ?? request.duration_ms ?? DEFAULT_CANVAS_DURATION_MS;

        return { elements, duration_ms };
    }

    private volumeOf(canvas: CanvasWithRelations): number {
        const playable = canvas.elements.find((e) => e.type === "audio" || e.type === "video");
        return playable?.volume ?? 100;
    }

    private async toResponse(canvas: CanvasWithRelations): Promise<CanvasResponse> {
        const media = async (slot: Slot): Promise<CanvasMediaResponse | null> => {
            const file = canvas.elements.find((e) => e.type === slot)?.media;
            if (!file) return null;
            return {
                key: file.key,
                name: file.name,
                type: file.type,
                url: await s3.getSignedURL(file.key, { expiresIn: SIGNED_URL_TTL_SECONDS }),
                duration_ms: file.duration_ms,
            };
        };

        return {
            id: canvas.id,
            name: canvas.name,
            template_type: canvas.template_type as CanvasTemplateType,
            enabled: canvas.enabled,
            duration_ms: canvas.duration_ms,
            volume: this.volumeOf(canvas),
            image: await media("image"),
            audio: await media("audio"),
            video: await media("video"),
            widget_ids: canvas.links.map((l) => l.widget_id),
            triggered_count: canvas.triggered_count,
            created_at: canvas.created_at,
            updated_at: canvas.updated_at,
        };
    }
}

// .ogg audio is commonly uploaded as application/ogg.
function fitsSlot(slot: Slot, mimetype: string): boolean {
    return mimetype.startsWith(`${slot}/`) || (slot === "audio" && mimetype === "application/ogg");
}
