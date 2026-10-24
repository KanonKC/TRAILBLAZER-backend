import { parseBuffer } from "music-metadata"
import { prisma } from "@/libs/prisma"
import s3 from "@/libs/awsS3"
import TLogger, { Layer } from "@/logging/logger"

/**
 * Fills in duration_ms for audio uploaded before the column was being written.
 *
 * The overlay queue uses that duration to decide how long a sound occupies the
 * overlay; without it, older First Word greetings fall back to a generic
 * estimate. Safe to re-run — it only touches rows that are still null.
 *
 *   npx ts-node --require tsconfig-paths/register src/script/backfillAudioDuration.ts
 */
async function main() {
    const logger = new TLogger(Layer.OTHER, "script.backfillAudioDuration")

    const files = await prisma.uploadedFile.findMany({
        where: { duration_ms: null, type: { startsWith: "audio/" } },
        select: { id: true, key: true, type: true, name: true },
    })

    logger.info({ message: "Backfilling audio durations", data: { total: files.length } })

    let updated = 0
    let skipped = 0

    for (const file of files) {
        try {
            const { buffer } = await s3.getFile(file.key)
            const metadata = await parseBuffer(buffer, { mimeType: file.type })
            const seconds = metadata.format.duration

            if (!seconds) {
                skipped++
                logger.warn({ message: "No duration in metadata", data: { id: file.id, name: file.name } })
                continue
            }

            await prisma.uploadedFile.update({
                where: { id: file.id },
                data: { duration_ms: Math.round(seconds * 1000) },
            })
            updated++
        } catch (error) {
            skipped++
            logger.error({
                message: "Failed to backfill duration",
                data: { id: file.id, name: file.name },
                error: error as Error,
            })
        }
    }

    logger.info({ message: "Backfill finished", data: { updated, skipped } })
    await prisma.$disconnect()
}

main()
