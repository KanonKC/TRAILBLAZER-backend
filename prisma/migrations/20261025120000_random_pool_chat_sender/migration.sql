-- AlterTable
ALTER TABLE "RandomPoolConfig" ADD COLUMN     "twitch_bot_id" TEXT;

-- Existing configs announced results as the streamer's own account; keep that.
UPDATE "RandomPoolConfig" AS config
SET "twitch_bot_id" = widget."twitch_id"
FROM "Widget" AS widget
WHERE config."widget_id" = widget."id";
