/*
  Warnings:

  - You are about to drop the column `referal_code` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "User_referal_code_key";

-- AlterTable
ALTER TABLE "ClipShoutout" ADD COLUMN     "delay_ms" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "referal_code";
