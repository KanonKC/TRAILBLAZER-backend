-- DropIndex
DROP INDEX "Widget_twitch_id_widget_type_slug_key";

-- DropIndex
DROP INDEX "Widget_owner_id_widget_type_slug_key";

-- AlterTable
ALTER TABLE "Widget" ADD COLUMN     "instance_key" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "RandomPool" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cover_key" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "moderation_status" TEXT NOT NULL DEFAULT 'VISIBLE',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RandomPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RandomPoolItem" (
    "id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "name" TEXT,
    "image_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RandomPoolItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RandomPoolConfig" (
    "id" TEXT NOT NULL,
    "widget_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "twitch_reward_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'UNIFORM',
    "visualization" TEXT NOT NULL DEFAULT 'SHUFFLE',
    "default_chat_message" TEXT,
    "spin_sound_key" TEXT,
    "default_result_sound_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RandomPoolConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RandomPoolConfigItem" (
    "config_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "chat_message" TEXT,
    "result_sound_key" TEXT,

    CONSTRAINT "RandomPoolConfigItem_pkey" PRIMARY KEY ("config_id","item_id")
);

-- CreateTable
CREATE TABLE "RandomPoolSpinLog" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "redemption_id" TEXT NOT NULL,
    "redeemed_by" TEXT NOT NULL,
    "item_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RandomPoolSpinLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RandomPool_owner_id_deleted_at_idx" ON "RandomPool"("owner_id", "deleted_at");

-- CreateIndex
CREATE INDEX "RandomPoolItem_pool_id_idx" ON "RandomPoolItem"("pool_id");

-- CreateIndex
CREATE UNIQUE INDEX "RandomPoolConfig_widget_id_key" ON "RandomPoolConfig"("widget_id");

-- CreateIndex
CREATE UNIQUE INDEX "RandomPoolConfig_twitch_reward_id_key" ON "RandomPoolConfig"("twitch_reward_id");

-- CreateIndex
CREATE INDEX "RandomPoolConfig_pool_id_idx" ON "RandomPoolConfig"("pool_id");

-- CreateIndex
CREATE UNIQUE INDEX "RandomPoolSpinLog_redemption_id_key" ON "RandomPoolSpinLog"("redemption_id");

-- CreateIndex
CREATE INDEX "RandomPoolSpinLog_config_id_created_at_idx" ON "RandomPoolSpinLog"("config_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Widget_twitch_id_widget_type_slug_instance_key_key" ON "Widget"("twitch_id", "widget_type_slug", "instance_key");

-- CreateIndex
CREATE UNIQUE INDEX "Widget_owner_id_widget_type_slug_instance_key_key" ON "Widget"("owner_id", "widget_type_slug", "instance_key");

-- AddForeignKey
ALTER TABLE "RandomPool" ADD CONSTRAINT "RandomPool_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomPoolItem" ADD CONSTRAINT "RandomPoolItem_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "RandomPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomPoolConfig" ADD CONSTRAINT "RandomPoolConfig_widget_id_fkey" FOREIGN KEY ("widget_id") REFERENCES "Widget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomPoolConfig" ADD CONSTRAINT "RandomPoolConfig_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "RandomPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomPoolConfigItem" ADD CONSTRAINT "RandomPoolConfigItem_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "RandomPoolConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomPoolConfigItem" ADD CONSTRAINT "RandomPoolConfigItem_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "RandomPoolItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomPoolSpinLog" ADD CONSTRAINT "RandomPoolSpinLog_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "RandomPoolConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;


INSERT INTO "WidgetType" (slug, display_name, description, cost, href, is_active, is_display, created_at, updated_at)
VALUES ('random-pool', 'Random Pool', 'Draw items from your own pool using Channel Points', 1, '/dashboard/widgets/random-pool', true, true, NOW(), NOW()) ON CONFLICT (slug) DO NOTHING;
