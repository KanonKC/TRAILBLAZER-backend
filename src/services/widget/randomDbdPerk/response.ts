import { RandomDbdPerkWidget } from "@/repositories/randomDbdPerk/response";
import { Widget } from "generated/prisma/client";

export interface DbdPerkPagination {
    page: number;
    row: number;
    perk: number;
}

export interface ExtendedRandomDbdPerk extends RandomDbdPerkWidget {
    totalKillerPerks: number;
    totalSurvivorPerks: number;
    widget: Widget;
}
/** Stable references only — the canvas media is signed at dispatch. */
export interface RandomDbdPerkJobPayload {
    canvasId: string;
    perks: DbdPerkPagination[];
    type: string;
}
