import CanvasService from "./canvas.service";
import CanvasRepository from "@/repositories/canvas/canvas.repository";
import UserRepository from "@/repositories/user/user.repository";
import WidgetRepository from "@/repositories/widget/widget.repository";
import { publisher } from "@/libs/redis";
import s3 from "@/libs/awsS3";
import { ForbiddenError, NotFoundError } from "@/errors";
import { UserTier } from "@/services/user/constant";

jest.mock("@/libs/redis", () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    publisher: {
        publish: jest.fn(),
    },
    TTL: {
        ONE_DAY: 86400,
    },
}));

jest.mock("@/libs/awsS3", () => ({
    getSignedURL: jest.fn(),
    deleteFile: jest.fn(),
}));

jest.mock("crypto", () => ({
    randomUUID: jest.fn().mockReturnValue("mocked_uuid"),
}));

describe("CanvasService", () => {
    let service: CanvasService;
    let mockCanvasRepo: jest.Mocked<CanvasRepository>;
    let mockUserRepo: jest.Mocked<UserRepository>;
    let mockWidgetRepo: jest.Mocked<WidgetRepository>;

    beforeEach(() => {
        mockCanvasRepo = {
            create: jest.fn(),
            get: jest.fn(),
            getWithLinks: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            listByOwnerId: jest.fn(),
            countByOwnerId: jest.fn(),
            replaceElements: jest.fn(),
            replaceLinks: jest.fn(),
            getEnabledByWidgetId: jest.fn(),
            incrementTriggeredCount: jest.fn(),
        } as any;
        mockUserRepo = {
            get: jest.fn(),
            getByCanvasOverlayKey: jest.fn(),
            updateCanvasOverlayKey: jest.fn(),
        } as any;
        mockWidgetRepo = {
            get: jest.fn(),
        } as any;

        service = new CanvasService(mockCanvasRepo, mockUserRepo, mockWidgetRepo);
        jest.clearAllMocks();
    });

    describe("create", () => {
        it("creates a canvas when under quota", async () => {
            mockUserRepo.get.mockResolvedValue({ id: "user_1", tier: UserTier.FREE_TIER } as any);
            mockCanvasRepo.countByOwnerId.mockResolvedValue(0);
            mockCanvasRepo.create.mockResolvedValue({ id: "canvas_1", owner_id: "user_1" } as any);

            const result = await service.create("user_1", { name: "My Canvas" });

            expect(mockCanvasRepo.create).toHaveBeenCalledWith({ name: "My Canvas", owner_id: "user_1" });
            expect(result).toEqual({ id: "canvas_1", owner_id: "user_1" });
        });

        it("throws quota error when at max canvas for tier", async () => {
            mockUserRepo.get.mockResolvedValue({ id: "user_1", tier: UserTier.FREE_TIER } as any);
            mockCanvasRepo.countByOwnerId.mockResolvedValue(3);

            await expect(service.create("user_1", { name: "Overflow" })).rejects.toThrow("Canvas quota limit reached");
            expect(mockCanvasRepo.create).not.toHaveBeenCalled();
        });

        it("throws NotFoundError when user does not exist", async () => {
            mockUserRepo.get.mockResolvedValue(null);

            await expect(service.create("user_1", { name: "X" })).rejects.toThrow(NotFoundError);
        });
    });

    describe("get", () => {
        it("returns canvas when owner matches", async () => {
            mockCanvasRepo.getWithLinks.mockResolvedValue({ id: "canvas_1", owner_id: "user_1", links: [] } as any);

            const result = await service.get("canvas_1", "user_1");

            expect(result.id).toBe("canvas_1");
        });

        it("throws ForbiddenError when owner does not match", async () => {
            mockCanvasRepo.getWithLinks.mockResolvedValue({ id: "canvas_1", owner_id: "someone_else" } as any);

            await expect(service.get("canvas_1", "user_1")).rejects.toThrow(ForbiddenError);
        });

        it("throws NotFoundError when canvas does not exist", async () => {
            mockCanvasRepo.getWithLinks.mockResolvedValue(null);

            await expect(service.get("canvas_1", "user_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("getOverlayKey", () => {
        it("returns the existing key without generating a new one", async () => {
            mockUserRepo.get.mockResolvedValue({ id: "user_1", canvas_overlay_key: "existing_key" } as any);

            const result = await service.getOverlayKey("user_1");

            expect(result).toBe("existing_key");
            expect(mockUserRepo.updateCanvasOverlayKey).not.toHaveBeenCalled();
        });

        it("auto-provisions a key the first time a user with no key requests one", async () => {
            mockUserRepo.get.mockResolvedValue({ id: "user_1", canvas_overlay_key: null } as any);

            const result = await service.getOverlayKey("user_1");

            expect(result).toBe("mocked_uuid");
            expect(mockUserRepo.updateCanvasOverlayKey).toHaveBeenCalledWith("user_1", "mocked_uuid");
        });

        it("throws NotFoundError when user does not exist", async () => {
            mockUserRepo.get.mockResolvedValue(null);

            await expect(service.getOverlayKey("user_1")).rejects.toThrow(NotFoundError);
        });
    });

    describe("validateOverlayAccess", () => {
        it("returns true when key belongs to the requesting user", async () => {
            mockUserRepo.getByCanvasOverlayKey.mockResolvedValue({ id: "user_1" } as any);

            const result = await service.validateOverlayAccess("user_1", "correct_key");

            expect(result).toBe(true);
        });

        it("returns false when key does not exist", async () => {
            mockUserRepo.getByCanvasOverlayKey.mockResolvedValue(null);

            const result = await service.validateOverlayAccess("user_1", "bad_key");

            expect(result).toBe(false);
        });

        it("returns false when key belongs to a different user", async () => {
            mockUserRepo.getByCanvasOverlayKey.mockResolvedValue({ id: "someone_else" } as any);

            const result = await service.validateOverlayAccess("user_1", "someone_elses_key");

            expect(result).toBe(false);
        });
    });

    describe("triggerForWidget", () => {
        it("does nothing when no canvases are linked to the widget", async () => {
            mockCanvasRepo.getEnabledByWidgetId.mockResolvedValue([]);

            await service.triggerForWidget("widget_1", { username: "viewer1" });

            expect(publisher.publish).not.toHaveBeenCalled();
        });

        it("publishes canvas:play with presigned media and interpolated text for each linked canvas", async () => {
            (s3.getSignedURL as jest.Mock).mockResolvedValue("https://signed.example.com/image.png");
            mockCanvasRepo.getEnabledByWidgetId.mockResolvedValue([
                {
                    id: "canvas_1",
                    owner_id: "user_1",
                    duration_ms: 5000,
                    elements: [
                        {
                            id: "el_1",
                            type: "image",
                            media_key: "users/user_1/abc",
                            text_content: null,
                            text_style: null,
                            x: 50, y: 50, width: 20, height: 20, rotation: 0, z_index: 0, opacity: 1,
                            start_delay_ms: 0, duration_ms: 3000,
                            enter_transition: "fade", exit_transition: "fade", transition_ms: 400,
                            volume: 100, loop: false,
                        },
                        {
                            id: "el_2",
                            type: "text",
                            media_key: null,
                            text_content: "Welcome {{username}}!",
                            text_style: null,
                            x: 50, y: 80, width: 40, height: 10, rotation: 0, z_index: 1, opacity: 1,
                            start_delay_ms: 200, duration_ms: 3000,
                            enter_transition: "fade", exit_transition: "fade", transition_ms: 400,
                            volume: 100, loop: false,
                        },
                    ],
                } as any,
            ]);

            await service.triggerForWidget("widget_1", { username: "viewer1" });

            expect(s3.getSignedURL).toHaveBeenCalledWith("users/user_1/abc", { expiresIn: 3600 });
            expect(publisher.publish).toHaveBeenCalledTimes(1);

            const [channel, payloadJson] = (publisher.publish as jest.Mock).mock.calls[0];
            expect(channel).toBe("canvas:play");
            const payload = JSON.parse(payloadJson);
            expect(payload.userId).toBe("user_1");
            expect(payload.canvasId).toBe("canvas_1");
            expect(payload.elements[0].media_url).toBe("https://signed.example.com/image.png");
            expect(payload.elements[1].text_content).toBe("Welcome viewer1!");
            expect(mockCanvasRepo.incrementTriggeredCount).toHaveBeenCalledWith("canvas_1");
        });

        it("swallows errors so a canvas failure never breaks the calling widget flow", async () => {
            mockCanvasRepo.getEnabledByWidgetId.mockRejectedValue(new Error("db down"));

            await expect(service.triggerForWidget("widget_1", {})).resolves.toBeUndefined();
        });
    });
});
