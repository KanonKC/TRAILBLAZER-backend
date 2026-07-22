import { TError } from "@/errors";

export class CanvasQuotaLimitError extends TError {
    constructor(message?: string) {
        super({ message: message ?? "Canvas quota limit reached", status: 402 })
    }
}
