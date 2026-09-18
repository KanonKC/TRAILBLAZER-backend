import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { User, Workflow } from "generated/prisma/client";

const logger = new TLogger(Layer.REPOSITORY);

export default class WorkflowRepository {
    constructor() { }

    async get(id: string): Promise<Workflow | null> {
        try {
        return prisma.workflow.findUnique({ where: { id } })
    } catch (error) {
            logger.setContext("repository.workflow.get").error({ message: "get failed", error: error as Error });
            throw error;
        }
    }

    async getOwner(id: string): Promise<User | null> {
        try {
        const workflow = await prisma.workflow.findUnique({ where: { id }, include: { owner: true } })
        return workflow?.owner ?? null
    } catch (error) {
            logger.setContext("repository.workflow.getOwner").error({ message: "getOwner failed", error: error as Error });
            throw error;
        }
    }

    async getManyByTriggerId(triggerId: string): Promise<Workflow[]> {
        try {
        return prisma.workflow.findMany({ where: { triggers: { some: { id: triggerId } } } })
    } catch (error) {
            logger.setContext("repository.workflow.getManyByTriggerId").error({ message: "getManyByTriggerId failed", error: error as Error });
            throw error;
        }
    }

}