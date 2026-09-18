import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { Trigger } from "generated/prisma/client";
import { CreateTriggerRequest } from "./request";

const logger = new TLogger(Layer.REPOSITORY);

export default class TriggerRepository {
    constructor() { }

    async create(transactionId: string, request: CreateTriggerRequest): Promise<Trigger> {
        try {
        return prisma.trigger.create({
            data: request
        })
    } catch (error) {
            logger.setContext("repository.trigger.create", transactionId).error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    async get(transactionId: string, id: string): Promise<Trigger | null> {
        try {
        return prisma.trigger.findUnique({ where: { id } })
    } catch (error) {
            logger.setContext("repository.trigger.get", transactionId).error({ message: "get failed", error: error as Error });
            throw error;
        }
    }
}