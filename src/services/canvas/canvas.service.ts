import crypto from "crypto";
import { ForbiddenError, NotFoundError } from "@/errors";
import s3 from "@/libs/awsS3";
import { publisher } from "@/libs/redis";
import TLogger, { Layer } from "@/logging/logger";
import CanvasRepository from "@/repositories/canvas/canvas.repository";
import { CanvasElementInput, CreateCanvas, UpdateCanvas } from "@/repositories/canvas/request";
import { CanvasWithElements, CanvasWithLinks } from "@/repositories/canvas/response";
import UserRepository from "@/repositories/user/user.repository";
import WidgetRepository from "@/repositories/widget/widget.repository";
import { MAX_CANVAS_PER_TIER, UserTier } from "@/services/user/constant";
import { CanvasQuotaLimitError } from "./error";
import { interpolate } from "./variables";

const MEDIA_URL_EXPIRES_IN = 3600;

export default class CanvasService {
    private readonly canvasRepository: CanvasRepository;
    private readonly userRepository: UserRepository;
    private readonly widgetRepository: WidgetRepository;
    private logger: TLogger;

    constructor(
        canvasRepository: CanvasRepository,
        userRepository: UserRepository,
        widgetRepository: WidgetRepository
    ) {
        this.canvasRepository = canvasRepository;
        this.userRepository = userRepository;
        this.widgetRepository = widgetRepository;
        this.logger = new TLogger(Layer.SERVICE);
    }

    private authorize(userId: string, canvas: { owner_id: string }) {
        if (canvas.owner_id !== userId) {
            throw new ForbiddenError("You do not own this canvas");
        }
    }

    async create(userId: string, request: Omit<CreateCanvas, "owner_id">): Promise<CanvasWithElements> {
        this.logger.setContext("service.canvas.create");
        const user = await this.userRepository.get(userId);
        if (!user) {
            throw new NotFoundError("User not found");
        }

        const maxCanvas = MAX_CANVAS_PER_TIER[user.tier >= UserTier.PRO_TIER ? UserTier.PRO_TIER : UserTier.FREE_TIER];
        const currentCount = await this.canvasRepository.countByOwnerId(userId);
        if (currentCount >= maxCanvas) {
            this.logger.warn({ message: "Canvas quota exceeded", data: { userId, currentCount, maxCanvas } });
            throw new CanvasQuotaLimitError();
        }

        this.logger.info({ message: "Creating canvas", data: { userId, name: request.name } });
        return this.canvasRepository.create({ ...request, owner_id: userId });
    }

    async get(id: string, userId: string): Promise<CanvasWithLinks> {
        this.logger.setContext("service.canvas.get");
        const canvas = await this.canvasRepository.getWithLinks(id);
        if (!canvas) {
            throw new NotFoundError("Canvas not found");
        }
        this.authorize(userId, canvas);
        return canvas;
    }

    async list(userId: string): Promise<CanvasWithElements[]> {
        this.logger.setContext("service.canvas.list");
        return this.canvasRepository.listByOwnerId(userId);
    }

    async update(id: string, userId: string, request: UpdateCanvas): Promise<CanvasWithElements> {
        this.logger.setContext("service.canvas.update");
        const existing = await this.canvasRepository.get(id);
        if (!existing) {
            throw new NotFoundError("Canvas not found");
        }
        this.authorize(userId, existing);
        return this.canvasRepository.update(id, request);
    }

    async updateElements(id: string, userId: string, elements: CanvasElementInput[]): Promise<CanvasWithElements> {
        this.logger.setContext("service.canvas.updateElements");
        const existing = await this.canvasRepository.get(id);
        if (!existing) {
            throw new NotFoundError("Canvas not found");
        }
        this.authorize(userId, existing);
        return this.canvasRepository.replaceElements(id, elements);
    }

    async delete(id: string, userId: string): Promise<void> {
        this.logger.setContext("service.canvas.delete");
        const existing = await this.canvasRepository.get(id);
        if (!existing) {
            throw new NotFoundError("Canvas not found");
        }
        this.authorize(userId, existing);
        await this.canvasRepository.delete(id);
    }

    async updateLinks(id: string, userId: string, widgetIds: string[]): Promise<void> {
        this.logger.setContext("service.canvas.updateLinks");
        const existing = await this.canvasRepository.get(id);
        if (!existing) {
            throw new NotFoundError("Canvas not found");
        }
        this.authorize(userId, existing);

        for (const widgetId of widgetIds) {
            const widget = await this.widgetRepository.get(widgetId);
            if (!widget || widget.owner_id !== userId) {
                throw new ForbiddenError("You do not own one of the widgets being linked");
            }
        }

        await this.canvasRepository.replaceLinks(id, widgetIds);
    }

    async getLinkedWidgetIds(id: string, userId: string): Promise<string[]> {
        this.logger.setContext("service.canvas.getLinkedWidgetIds");
        const canvas = await this.get(id, userId);
        return canvas.links.map((link) => link.widget.id);
    }

    async validateOverlayAccess(userId: string, key: string): Promise<boolean> {
        this.logger.setContext("service.canvas.validateOverlayAccess");
        try {
            const user = await this.userRepository.getByCanvasOverlayKey(key);
            if (!user) {
                return false;
            }
            return user.id === userId;
        } catch (error) {
            this.logger.error({ message: "Failed to validate canvas overlay access", error: error as Error, data: { userId } });
            return false;
        }
    }

    async getOverlayKey(userId: string): Promise<string> {
        this.logger.setContext("service.canvas.getOverlayKey");
        const user = await this.userRepository.get(userId);
        if (!user) {
            throw new NotFoundError("User not found");
        }
        if (user.canvas_overlay_key) {
            return user.canvas_overlay_key;
        }
        // Lazily provision the key on first access — unlike per-widget overlay_key,
        // there is no widget-creation moment to generate this at, since one key
        // serves every Canvas a user owns.
        this.logger.info({ message: "No canvas overlay key yet, provisioning one", data: { userId } });
        return this.refreshOverlayKey(userId);
    }

    async refreshOverlayKey(userId: string): Promise<string> {
        this.logger.setContext("service.canvas.refreshOverlayKey");
        const newKey = crypto.randomUUID();
        await this.userRepository.updateCanvasOverlayKey(userId, newKey);
        return newKey;
    }

    private async buildPlayPayload(canvas: CanvasWithElements, variables: Record<string, string>) {
        const elements = await Promise.all(
            canvas.elements.map(async (el) => ({
                id: el.id,
                type: el.type,
                media_url: el.media_key
                    ? await s3.getSignedURL(el.media_key, { expiresIn: MEDIA_URL_EXPIRES_IN })
                    : null,
                text_content: el.text_content ? interpolate(el.text_content, variables) : null,
                text_style: el.text_style,
                x: el.x,
                y: el.y,
                width: el.width,
                height: el.height,
                rotation: el.rotation,
                z_index: el.z_index,
                opacity: el.opacity,
                start_delay_ms: el.start_delay_ms,
                duration_ms: el.duration_ms,
                enter_transition: el.enter_transition,
                exit_transition: el.exit_transition,
                transition_ms: el.transition_ms,
                volume: el.volume,
                loop: el.loop,
            }))
        );

        return {
            userId: canvas.owner_id,
            playId: crypto.randomUUID(),
            canvasId: canvas.id,
            durationMs: canvas.duration_ms,
            elements,
        };
    }

    async triggerForWidget(widgetId: string, variables: Record<string, string>): Promise<void> {
        this.logger.setContext("service.canvas.triggerForWidget");
        try {
            const canvases = await this.canvasRepository.getEnabledByWidgetId(widgetId);
            if (canvases.length === 0) return;

            await Promise.allSettled(
                canvases.map(async (canvas) => {
                    const payload = await this.buildPlayPayload(canvas, variables);
                    await publisher.publish("canvas:play", JSON.stringify(payload));
                    await this.canvasRepository.incrementTriggeredCount(canvas.id);
                })
            );
        } catch (error) {
            this.logger.error({ message: "Failed to trigger canvas for widget", error: error as Error, data: { widgetId } });
        }
    }

    async test(id: string, userId: string): Promise<void> {
        this.logger.setContext("service.canvas.test");
        const canvas = await this.canvasRepository.get(id);
        if (!canvas) {
            throw new NotFoundError("Canvas not found");
        }
        this.authorize(userId, canvas);

        const sampleVariables: Record<string, string> = {
            username: "viewer123",
            display_name: "Viewer123",
            message: "hello!",
            clip_title: "Epic Clutch",
            image_url: "https://example.com/image.png",
            result_name: "Sample Result",
        };

        const payload = await this.buildPlayPayload(canvas, sampleVariables);
        await publisher.publish("canvas:play", JSON.stringify(payload));
    }
}
