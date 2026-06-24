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