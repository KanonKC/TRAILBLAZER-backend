-- AlterTable
ALTER TABLE "EndCredit" ADD COLUMN     "is_show_bits_amount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_show_raid_count" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_show_sub_months" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scroll_speed" INTEGER NOT NULL DEFAULT 60;
