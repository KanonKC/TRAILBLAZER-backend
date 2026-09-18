import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { User, Workflow } from "generated/prisma/client";

const logger = new TLogger(Layer.REPOSITORY);

export default class WorkflowRepository {
    constructor() { }

    async get(transactionId: string, id: string): Promise<Workflow | null> {
        try {
        return prisma.workflow.findUnique({ where: { id } })
    } catch (error) {
            logger.setContext("repository.workflow.get", transactionId).error({ message: "get failed", error: error as Error });
            throw error;
        }
    }

    async getOwner(transactionId: string, id: string): Promise<User | null> {
        try {
        const workflow = await prisma.workflow.findUnique({ where: { id }, include: { owner: true } })
        return workflow?.owner ?? null
    } catch (error) {
            logger.setContext("repository.workflow.getOwner", transactionId).error({ message: "getOwner failed", error: error as Error });
            throw error;
        }
    }

    async getManyByTriggerId(transactionId: string, triggerId: string): Promise<Workflow[]> {
        try {
        return prisma.workflow.findMany({ where: { triggers: { some: { id: triggerId } } } })
    } catch (error) {
            logger.setContext("repository.workflow.getManyByTriggerId", transactionId).error({ message: "getManyByTriggerId failed", error: error as Error });
            throw error;
        }
    }

}