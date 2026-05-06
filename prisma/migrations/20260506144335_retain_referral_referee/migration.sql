-- DropForeignKey
ALTER TABLE "Referral" DROP CONSTRAINT "Referral_referee_id_fkey";

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
