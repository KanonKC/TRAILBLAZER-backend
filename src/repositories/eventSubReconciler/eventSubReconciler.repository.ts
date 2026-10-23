import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { EnabledWidgetEventSource } from "./response";

const logger = new TLogger(Layer.REPOSITORY);

export default class EventSubReconcilerRepository {
    constructor() { }

    /** Every enabled widget of an active widget type — the source for computing which EventSub subscriptions each user needs. */
    async listEnabledWidgets(transactionId?: string): Promise<EnabledWidgetEventSource[]> {
        try {
            return await prisma.widget.findMany({
                where: { enabled: true, OR: [{ widget_type: { availability: "active" } }, { widget_type: { availability: "whitelist_only" }, owner: { is_whitelisted: true } }] },
                select: { twitch_id: true, widget_type_slug: true },
            });
        } catch (error) {
            logger.setContext("repository.eventSubReconciler.listEnabledWidgets", transactionId).error({ message: "listEnabledWidgets failed", error: error as Error });
            throw error;
        }
    }
}
