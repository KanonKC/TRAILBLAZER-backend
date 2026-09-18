import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { DBDKillerMaster } from "generated/prisma/client";

const logger = new TLogger(Layer.REPOSITORY);

export default class DBDKillerMasterRepository {

    constructor() {
    }

    async getBySlug(slug: string): Promise<DBDKillerMaster | null> {
        try {
        return prisma.dBDKillerMaster.findUnique({
            where: { slug }
        });
    } catch (error) {
            logger.setContext("repository.dbdKillerMaster.getBySlug").error({ message: "getBySlug failed", error: error as Error });
            throw error;
        }
    }

    async getBySlugs(slugs: string[]): Promise<DBDKillerMaster[]> {
        try {
        return prisma.dBDKillerMaster.findMany({
            where: { slug: { in: slugs } }
        });
    } catch (error) {
            logger.setContext("repository.dbdKillerMaster.getBySlugs").error({ message: "getBySlugs failed", error: error as Error });
            throw error;
        }
    }

    async list(): Promise<DBDKillerMaster[]> {
        try {
        return prisma.dBDKillerMaster.findMany({
            orderBy: { title: "asc" }
        });
    } catch (error) {
            logger.setContext("repository.dbdKillerMaster.list").error({ message: "list failed", error: error as Error });
            throw error;
        }
    }
}
