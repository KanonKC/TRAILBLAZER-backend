-- AlterTable
ALTER TABLE "EndCredit" ADD COLUMN     "is_show_bits" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_show_followers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_show_raids" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_show_subs" BOOLEAN NOT NULL DEFAULT true;
