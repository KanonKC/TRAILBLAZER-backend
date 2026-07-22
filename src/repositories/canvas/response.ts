import { Canvas, CanvasElement, UploadedFile, Widget } from "generated/prisma/client";

export interface CanvasElementWithMedia extends CanvasElement {
    media: UploadedFile | null;
}

export interface CanvasWithElements extends Canvas {
    elements: CanvasElementWithMedia[];
}

export interface CanvasWithLinks extends CanvasWithElements {
    links: { widget: Widget }[];
}
