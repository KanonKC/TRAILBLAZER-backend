-- CreateTable
CREATE TABLE "FirstWordGreetCount" (
    "id" SERIAL NOT NULL,
    "twitch_chatter_id" TEXT NOT NULL,
    "twitch_channel_id" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "first_word_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FirstWordGreetCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FirstWordGreetCount_twitch_chatter_id_twitch_channel_id_key" ON "FirstWordGreetCount"("twitch_chatter_id", "twitch_channel_id");

-- AddForeignKey
ALTER TABLE "FirstWordGreetCount" ADD CONSTRAINT "FirstWordGreetCount_first_word_id_fkey" FOREIGN KEY ("first_word_id") REFERENCES "FirstWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
