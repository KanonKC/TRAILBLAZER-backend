/*
  Warnings:

  - A unique constraint covering the columns `[referal_code]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referal_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_referal_code_key" ON "User"("referal_code");
