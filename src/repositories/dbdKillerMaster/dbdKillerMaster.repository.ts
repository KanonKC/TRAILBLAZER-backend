import { prisma } from "@/libs/prisma";
import { DBDKillerMaster } from "generated/prisma/client";

export default class DBDKillerMasterRepository {

    constructor() {
    }

    async getBySlug(slug: string): Promise<DBDKillerMaster | null> {
        return prisma.dBDKillerMaster.findUnique({
            where: { slug }
        });
    }

    async getBySlugs(slugs: string[]): Promise<DBDKillerMaster[]> {
        return prisma.dBDKillerMaster.findMany({
            where: { slug: { in: slugs } }
        });
    }
}
