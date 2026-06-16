-- DropForeignKey
ALTER TABLE "Widget" DROP CONSTRAINT "Widget_owner_id_fkey";

-- CreateTable
CREATE TABLE "SpotifySongRequest" (
    "id" TEXT NOT NULL,
    "twitch_reward_id" TEXT,
    "twitch_bot_id" TEXT,
    "invalid_message" TEXT,
    "success_message" TEXT,
    "widget_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpotifySongRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpotifySongRequest_twitch_reward_id_key" ON "SpotifySongRequest"("twitch_reward_id");

-- CreateIndex
CREATE UNIQUE INDEX "SpotifySongRequest_widget_id_key" ON "SpotifySongRequest"("widget_id");

-- AddForeignKey
ALTER TABLE "Widget" ADD CONSTRAINT "Widget_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotifySongRequest" ADD CONSTRAINT "SpotifySongRequest_widget_id_fkey" FOREIGN KEY ("widget_id") REFERENCES "Widget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
