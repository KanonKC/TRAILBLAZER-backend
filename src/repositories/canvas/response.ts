import { Canvas, CanvasElement, CanvasWidgetLink, UploadedFile } from "generated/prisma/client";

export interface CanvasWithRelations extends Canvas {
    elements: (CanvasElement & { media: UploadedFile | null })[];
    links: CanvasWidgetLink[];
}
