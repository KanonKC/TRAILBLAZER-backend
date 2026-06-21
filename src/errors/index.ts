class TError extends Error {
    status: number
    error_code: string
    constructor({ message, status, error_code = "0" }: { message: string, status: number, error_code?: string }) {
        super(message)
        this.status = status
        this.error_code = error_code
    }

    toJSON() {
        return {
            message: this.message,
            status: this.status,
            error_code: this.error_code
        }
    }
}

class ForbiddenError extends TError {
    constructor(message?: string) {
        super({ message: message ?? "Forbidden", status: 403 })
    }
}

class NotFoundError extends TError {
    constructor(message?: string) {
        super({ message: message ?? "Not Found", status: 404 })
    }
}

class BadRequestError extends TError {
    constructor(message?: string) {
        super({ message: message ?? "Bad Request", status: 400 })
    }
}

class InternalServerError extends TError {
    constructor(message?: string) {
        super({ message: message ?? "Internal Server Error", status: 500 })
    }
}

class UnauthorizedError extends TError {
    constructor(message?: string) {
        super({ message: message ?? "Unauthorized", status: 401 })
    }
}

class BadGatewayError extends TError {
    constructor(message?: string) {
        super({ message: message ?? "Bad Gateway", status: 502 })
    }
}

export { TError, ForbiddenError, NotFoundError, BadRequestError, InternalServerError, UnauthorizedError, BadGatewayError }