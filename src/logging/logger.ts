import logger from "@/libs/winston"
import { User } from "generated/prisma/client"

export enum Layer {
    CONTROLLER = "controller",
    SERVICE = "service",
    MIDDLEWARE = "middleware",
    REPOSITORY = "repository",
    EVENT = "event",
    EVENT_CONTROLLER = "event-controller",
    PROVIDER = "provider",
    OTHER = "other"
}

interface LogMeta {
    message: string,
    data?: any,
    user?: User
    error?: Error | string
}

/**
 * TLogger is immutable with respect to context/transactionId: `setContext()`
 * never mutates the instance it is called on. It always returns a NEW
 * TLogger carrying the given context and transactionId.
 *
 * This matters because a single TLogger instance is typically created once
 * per class (e.g. `this.logger = new TLogger(Layer.SERVICE)` in a
 * constructor) and that class instance is reused across many concurrent
 * requests. If `setContext()` mutated `this.context` / `this.transactionId`
 * in place, two concurrent requests could stomp on each other's
 * transaction_id. Callers MUST use the value returned by `setContext()`
 * (assign it to a local variable) for the remainder of that method/request
 * instead of continuing to use the original field.
 *
 * Example:
 *   async myMethod(transactionId: string) {
 *     const logger = this.logger.setContext("service.widget.myMethod", transactionId);
 *     logger.info({ message: "..." });
 *   }
 */
export default class TLogger {
    private readonly layer: Layer
    private readonly context: string
    private readonly transactionId: string

    constructor(layer: Layer, context: string = "", transactionId: string = "") {
        this.layer = layer
        this.context = context
        this.transactionId = transactionId
    }

    /**
     * Returns a NEW TLogger with the given context and transactionId.
     * Does NOT mutate the instance it was called on, and does NOT emit
     * any log line as a side effect.
     */
    public setContext(context: string, transactionId?: string): TLogger {
        return new TLogger(this.layer, context, transactionId ?? this.transactionId)
    }

    private createPayload(meta: LogMeta) {
        return {
            layer: this.layer,
            context: this.context,
            transaction_id: this.transactionId,
            user: meta.user,
            error: meta.error instanceof Error
                ? { message: meta.error.message, stack: meta.error.stack }
                : meta.error,
            data: meta.data,
        }
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
