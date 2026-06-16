import { SpotifySongRequest, Widget } from "generated/prisma/client";

export interface SpotifySongRequestWidget extends SpotifySongRequest {
    widget: Widget;
}
