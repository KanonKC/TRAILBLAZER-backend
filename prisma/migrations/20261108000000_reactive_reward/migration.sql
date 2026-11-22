-- CreateTable
CREATE TABLE "ReactiveReward" (
    "id" TEXT NOT NULL,
    "widget_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReactiveReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReactiveRewardReaction" (
    "id" TEXT NOT NULL,
    "reactive_reward_id" TEXT NOT NULL,
    "twitch_reward_id" TEXT NOT NULL,
    "twitch_reward_title" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "media_type" TEXT NOT NULL,
    "media_key" TEXT,
    "sound_key" TEXT,
    "volume" INTEGER NOT NULL DEFAULT 80,
    "display_duration_ms" INTEGER NOT NULL DEFAULT 5000,
    "position" TEXT NOT NULL DEFAULT 'CENTER',
    "size_percent" INTEGER NOT NULL DEFAULT 50,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReactiveRewardReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReactiveReward_widget_id_key" ON "ReactiveReward"("widget_id");

-- CreateIndex
CREATE UNIQUE INDEX "ReactiveRewardReaction_twitch_reward_id_key" ON "ReactiveRewardReaction"("twitch_reward_id");

-- CreateIndex
CREATE INDEX "ReactiveRewardReaction_reactive_reward_id_sort_order_idx" ON "ReactiveRewardReaction"("reactive_reward_id", "sort_order");

-- AddForeignKey
ALTER TABLE "ReactiveReward" ADD CONSTRAINT "ReactiveReward_widget_id_fkey" FOREIGN KEY ("widget_id") REFERENCES "Widget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReactiveRewardReaction" ADD CONSTRAINT "ReactiveRewardReaction_reactive_reward_id_fkey" FOREIGN KEY ("reactive_reward_id") REFERENCES "ReactiveReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReactiveRewardReaction" ADD CONSTRAINT "ReactiveRewardReaction_media_key_fkey" FOREIGN KEY ("media_key") REFERENCES "UploadedFile"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReactiveRewardReaction" ADD CONSTRAINT "ReactiveRewardReaction_sound_key_fkey" FOREIGN KEY ("sound_key") REFERENCES "UploadedFile"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- Defense in depth next to the Zod validation in the service
ALTER TABLE "ReactiveRewardReaction" ADD CONSTRAINT "ReactiveRewardReaction_media_type_check"
  CHECK ("media_type" IN ('IMAGE', 'AUDIO', 'VIDEO'));
ALTER TABLE "ReactiveRewardReaction" ADD CONSTRAINT "ReactiveRewardReaction_position_check"
  CHECK ("position" IN ('TOP_LEFT', 'TOP_CENTER', 'TOP_RIGHT', 'MIDDLE_LEFT', 'CENTER', 'MIDDLE_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_CENTER', 'BOTTOM_RIGHT'));
ALTER TABLE "ReactiveRewardReaction" ADD CONSTRAINT "ReactiveRewardReaction_volume_check"
  CHECK ("volume" BETWEEN 0 AND 100);
ALTER TABLE "ReactiveRewardReaction" ADD CONSTRAINT "ReactiveRewardReaction_size_percent_check"
  CHECK ("size_percent" BETWEEN 10 AND 100);

-- Whitelist only until the end-to-end checks pass; an admin promotes it to 'active' afterwards
INSERT INTO "WidgetType" (slug, display_name, description, cost, href, theme_color, is_active, is_display, availability, created_at, updated_at)
VALUES ('reactive-reward', 'Reactive Reward', 'Play a sound, image or video on your overlay when a viewer redeems Channel Points', 1, '/dashboard/widgets/reactive-reward', '#a855f7', true, true, 'whitelist_only', NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;
