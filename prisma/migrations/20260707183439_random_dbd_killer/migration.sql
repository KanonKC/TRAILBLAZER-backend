-- CreateTable
CREATE TABLE "RandomDBDKiller" (
    "id" TEXT NOT NULL,
    "widget_id" TEXT NOT NULL,
    "twitch_reward_id" TEXT NOT NULL,
    "killer_pool" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RandomDBDKiller_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RandomDBDKiller_widget_id_key" ON "RandomDBDKiller"("widget_id");

-- CreateIndex
CREATE UNIQUE INDEX "RandomDBDKiller_twitch_reward_id_key" ON "RandomDBDKiller"("twitch_reward_id");

-- AddForeignKey
ALTER TABLE "RandomDBDKiller" ADD CONSTRAINT "RandomDBDKiller_widget_id_fkey" FOREIGN KEY ("widget_id") REFERENCES "Widget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
