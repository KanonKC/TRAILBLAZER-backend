import { TError } from "@/errors";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

export function convertPrismaError(error: PrismaClientKnownRequestError): TError {
    const modelName = error.meta?.['modelName'] || "Resource"
    switch (error.code) {
        case 'P2025':
            return new TError({
                message: `${modelName} not found`,
                status: 404,
                error_code: error.code
            })
        case 'P2002':
            return new TError({
                message: `${modelName} already exists`,
                status: 400,
                error_code: error.code
            })
        default:
            return new TError({
                message: "Prisma unknown error",
                status: 500,
                error_code: error.code
            })
    }
}