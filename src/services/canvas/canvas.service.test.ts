import CanvasService, { DEFAULT_CANVAS_DURATION_MS } from "./canvas.service";
import CanvasRepository from "@/repositories/canvas/canvas.repository";
import WidgetService from "@/services/widget/widget.service";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/errors";
import { CanvasTemplateType } from "./request";

jest.mock("@/libs/awsS3", () => ({
    getSignedURL: jest.fn((key: string) => Promise.resolve(`https://signed/${key}`)),
}));

const file = (key: string, type: string, extra: Record<string, unknown> = {}) => ({
    id: `id_${key}`,
    key,
    name: key,
    type,
    owner_id: "user_1",
    size_kb: 1,
    duration_ms: null,
    ...extra,
});

const canvasRow = (extra: Record<string, unknown> = {}) => ({
    id: "canvas_1",
    name: "My canvas",
    template_type: CanvasTemplateType.IMAGE_AUDIO,
    enabled: true,
    duration_ms: 5000,
    owner_id: "user_1",
    triggered_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
    elements: [],
    links: [],
    ...extra,
});

describe("CanvasService", () => {
    let service: CanvasService;
    let repo: jest.Mocked<CanvasRepository>;
    let widgetService: jest.Mocked<WidgetService>;

    beforeEach(() => {
        repo = {
            list: jest.fn(),
            findById: jest.fn(),
            create: jest.fn().mockImplementation(async (req) => canvasRow({ ...req, elements: [] })),
            update: jest.fn().mockImplementation(async (_id, req) => canvasRow({ ...req, elements: [] })),
            delete: jest.fn(),
            getByWidgetId: jest.fn(),
            setWidgetLink: jest.fn(),
            findMediaByKeys: jest.fn(),
        } as any;
        widgetService = {
            authorizeOwnership: jest.fn(),
        } as any;
        service = new CanvasService(repo, widgetService);
    });

    describe("create", () => {
        it("takes the duration from the audio for an image + audio template", async () => {
            repo.findMediaByKeys.mockResolvedValue([
                file("img", "image/png"),
                file("snd", "audio/mpeg", { duration_ms: 3200 }),
            ] as any);

            await service.create("user_1", {
                name: "Hype",
                template_type: CanvasTemplateType.IMAGE_AUDIO,
                image_key: "img",
                audio_key: "snd",
                volume: 70,
            });

            expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
                owner_id: "user_1",
                template_type: CanvasTemplateType.IMAGE_AUDIO,
                duration_ms: 3200,
                elements: [
                    { type: "image", media_key: "img", volume: 70 },
                    { type: "audio", media_key: "snd", volume: 70 },
                ],
            }));
        });

        it("uses the requested duration for an image with no audio", async () => {
            repo.findMediaByKeys.mockResolvedValue([file("img", "image/png")] as any);

            await service.create("user_1", {
                name: "Still",
                template_type: CanvasTemplateType.IMAGE_AUDIO,
                image_key: "img",
                duration_ms: 8000,
            });

            expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ duration_ms: 8000 }));
        });

        it("ignores image/audio keys on a video template", async () => {
            repo.findMediaByKeys.mockResolvedValue([file("vid", "video/mp4", { duration_ms: 12000 })] as any);

            await service.create("user_1", {
                name: "Clip",
                template_type: CanvasTemplateType.VIDEO,
                video_key: "vid",
                image_key: "img",
            });

            expect(repo.findMediaByKeys).toHaveBeenCalledWith(["vid"]);
            expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
                duration_ms: 12000,
                elements: [{ type: "video", media_key: "vid", volume: 100 }],
            }));
        });

        it("falls back to the default duration when a video's length is unknown", async () => {
            repo.findMediaByKeys.mockResolvedValue([file("vid", "video/webm")] as any);

            await service.create("user_1", { name: "Clip", template_type: CanvasTemplateType.VIDEO, video_key: "vid" });

            expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ duration_ms: DEFAULT_CANVAS_DURATION_MS }));
        });

        it("rejects a video template without a video", async () => {
            await expect(
                service.create("user_1", { name: "Clip", template_type: CanvasTemplateType.VIDEO })
            ).rejects.toThrow(BadRequestError);
        });

        it("rejects an image + audio template with no media", async () => {
            await expect(
                service.create("user_1", { name: "Empty", template_type: CanvasTemplateType.IMAGE_AUDIO })
            ).rejects.toThrow(BadRequestError);
        });

        it("rejects a file in the wrong slot", async () => {
            repo.findMediaByKeys.mockResolvedValue([file("snd", "audio/mpeg")] as any);

            await expect(
                service.create("user_1", { name: "Bad", template_type: CanvasTemplateType.IMAGE_AUDIO, image_key: "snd" })
            ).rejects.toThrow(BadRequestError);
        });

        it("rejects another user's file", async () => {
            repo.findMediaByKeys.mockResolvedValue([file("img", "image/png", { owner_id: "user_2" })] as any);

            await expect(
                service.create("user_1", { name: "Stolen", template_type: CanvasTemplateType.IMAGE_AUDIO, image_key: "img" })
            ).rejects.toThrow(ForbiddenError);
        });

        it("rejects a missing file", async () => {
            repo.findMediaByKeys.mockResolvedValue([]);

            await expect(
                service.create("user_1", { name: "Gone", template_type: CanvasTemplateType.IMAGE_AUDIO, image_key: "img" })
            ).rejects.toThrow(BadRequestError);
        });
    });

    describe("ownership", () => {
        it("throws NotFoundError for an unknown canvas", async () => {
            repo.findById.mockResolvedValue(null);
            await expect(service.get("canvas_x", "user_1")).rejects.toThrow(NotFoundError);
        });

        it("forbids updating another user's canvas", async () => {
            repo.findById.mockResolvedValue(canvasRow({ owner_id: "user_2" }) as any);
            await expect(
                service.update("canvas_1", "user_1", { name: "x", template_type: CanvasTemplateType.VIDEO, video_key: "v" })
            ).rejects.toThrow(ForbiddenError);
            expect(repo.update).not.toHaveBeenCalled();
        });

        it("forbids deleting another user's canvas", async () => {
            repo.findById.mockResolvedValue(canvasRow({ owner_id: "user_2" }) as any);
            await expect(service.delete("canvas_1", "user_1")).rejects.toThrow(ForbiddenError);
            expect(repo.delete).not.toHaveBeenCalled();
        });
    });

    describe("setWidgetCanvas", () => {
        it("links the widget to one canvas after checking both owners", async () => {
            repo.findById.mockResolvedValue(canvasRow() as any);

            await service.setWidgetCanvas("widget_1", "user_1", "canvas_1");

            expect(widgetService.authorizeOwnership).toHaveBeenCalledWith("user_1", "widget_1");
            expect(repo.setWidgetLink).toHaveBeenCalledWith("widget_1", "canvas_1");
        });

        it("unlinks when canvas_id is null", async () => {
            await service.setWidgetCanvas("widget_1", "user_1", null);

            expect(repo.findById).not.toHaveBeenCalled();
            expect(repo.setWidgetLink).toHaveBeenCalledWith("widget_1", null);
        });

        it("refuses to link another user's canvas", async () => {
            repo.findById.mockResolvedValue(canvasRow({ owner_id: "user_2" }) as any);

            await expect(service.setWidgetCanvas("widget_1", "user_1", "canvas_1")).rejects.toThrow(ForbiddenError);
            expect(repo.setWidgetLink).not.toHaveBeenCalled();
        });

        it("refuses when the widget is not the user's", async () => {
            widgetService.authorizeOwnership.mockRejectedValue(new ForbiddenError("nope"));

            await expect(service.setWidgetCanvas("widget_1", "user_1", "canvas_1")).rejects.toThrow(ForbiddenError);
            expect(repo.setWidgetLink).not.toHaveBeenCalled();
        });
    });

    describe("resolvePlayback", () => {
        it("signs the image and audio of an image + audio canvas", async () => {
            repo.findById.mockResolvedValue(canvasRow({
                duration_ms: 3000,
                elements: [
                    { type: "image", media_key: "img", volume: 100 },
                    { type: "audio", media_key: "snd", volume: 40 },
                ],
            }) as any);

            const result = await service.resolvePlayback("canvas_1");

            expect(result).toEqual({
                canvas_id: "canvas_1",
                template_type: CanvasTemplateType.IMAGE_AUDIO,
                image_url: "https://signed/img",
                audio_url: "https://signed/snd",
                video_url: null,
                volume: 40,
                duration_ms: 3000,
            });
        });

        it("returns null for a disabled canvas", async () => {
            repo.findById.mockResolvedValue(canvasRow({ enabled: false }) as any);
            expect(await service.resolvePlayback("canvas_1")).toBeNull();
        });

        it("returns null for a deleted canvas", async () => {
            repo.findById.mockResolvedValue(null);
            expect(await service.resolvePlayback("canvas_1")).toBeNull();
        });
    });
});
