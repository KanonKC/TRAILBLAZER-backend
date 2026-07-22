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

/** Media enriched with a short-lived signed URL so the editor can render it. */
export interface CanvasElementMediaResponse extends UploadedFile {
    url: string;
}

export interface CanvasElementResponse extends CanvasElement {
    media: CanvasElementMediaResponse | null;
}

export interface CanvasResponse extends Canvas {
    elements: CanvasElementResponse[];
}

export interface CanvasWithLinksResponse extends CanvasResponse {
    links: { widget: Widget }[];
}
