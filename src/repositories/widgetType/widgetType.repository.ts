import { prisma } from "@/libs/prisma";
import { WidgetType } from "generated/prisma/client";

export default class WidgetTypeRepository {

    constructor() {
    }

    async list(): Promise<WidgetType[]> {
        return prisma.widgetType.findMany({
            orderBy: { id: "asc" }
        });
    }
}
