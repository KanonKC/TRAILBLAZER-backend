import logger from "@/libs/winston"
import { User } from "generated/prisma/client"
import { randomUUID } from "node:crypto"

export enum Layer {
    CONTROLLER = "controller",
    SERVICE = "service",
    MIDDLEWARE = "middleware",
    REPOSITORY = "repository",
    EVENT = "event",
    EVENT_CONTROLLER = "event-controller",
    OTHER = "other"
}

interface LogMeta {
    message: string,
    data?: any,
    user?: User
    error?: Error | string
}

interface SetContextOptions {
    silent?: boolean
}

export default class TLogger {
    private readonly layer: Layer
    private context: string
    private transactionId: string
    constructor(layer: Layer) {
        this.layer = layer
        this.context = ""
        this.transactionId = ""
    }

    public setContext(context: string, options?: SetContextOptions): TLogger {
        this.context = context
        try {
            this.transactionId = randomUUID()
        } catch (e) {
            // Fallback for environments/mocks where randomUUID is missing
            this.transactionId = Date.now().toString()
        }
        if (!options || !options.silent) {
            this.info({ message: `Init: ${context}` })
        }
        return this
    }

    private createPayload(meta: LogMeta) {
        return { layer: this.layer, context: this.context, user: meta.user, error: meta.error, data: meta.data, transaction_id: this.transactionId }
    }

    public info(meta: LogMeta): void {
        logger.info(meta.message, this.createPayload(meta))
    }

    public error(meta: LogMeta): void {
        logger.error(meta.message, this.createPayload(meta))
    }

    public warn(meta: LogMeta): void {
        logger.warn(meta.message, this.createPayload(meta))
    }

    public debug(meta: LogMeta): void {
        logger.debug(meta.message, this.createPayload(meta))
    }

}