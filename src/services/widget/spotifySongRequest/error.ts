import { TError } from "@/errors";

export class NoActiveDeviceError extends TError {
    constructor() {
        super({
            message: "No active device.",
            status: 404
        })
    }
}