/*
  Warnings:

  - You are about to drop the column `action` on the `EndCreditViewerRecord` table. All the data in the column will be lost.
  - Added the required column `type` to the `EndCreditViewerRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `value` to the `EndCreditViewerRecord` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EndCreditViewerRecord" DROP COLUMN "action",
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "value" TEXT NOT NULL;
