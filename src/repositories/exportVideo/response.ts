import { ExportVideo, ExportVideoHistory, Widget } from "generated/prisma/client";

export interface ExportVideoWithWidget extends ExportVideo {
    widget: Widget;
}

export type ExportVideoHistoryResponse = ExportVideoHistory;
