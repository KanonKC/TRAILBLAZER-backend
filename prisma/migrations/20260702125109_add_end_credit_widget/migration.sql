-- CreateTable
CREATE TABLE "EndCredit" (
    "id" TEXT NOT NULL,
    "widget_id" TEXT NOT NULL,
    "followers_header" TEXT,
    "subscribes_header" TEXT,
    "raids_header" TEXT,
    "bits_header" TEXT,
    "viewers_header" TEXT,
    "is_show_viewer_avatars" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EndCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EndCreditViewerRecord" (
    "id" SERIAL NOT NULL,
    "viewer_id" TEXT NOT NULL,
    "action" JSONB NOT NULL,
    "end_credit_id" TEXT NOT NULL,
    "platform_created_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EndCreditViewerRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EndCredit_widget_id_key" ON "EndCredit"("widget_id");

-- AddForeignKey
ALTER TABLE "EndCredit" ADD CONSTRAINT "EndCredit_widget_id_fkey" FOREIGN KEY ("widget_id") REFERENCES "Widget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndCreditViewerRecord" ADD CONSTRAINT "EndCreditViewerRecord_end_credit_id_fkey" FOREIGN KEY ("end_credit_id") REFERENCES "EndCredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
