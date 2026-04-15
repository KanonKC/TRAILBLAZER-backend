-- CreateTable
CREATE TABLE "ExportVideo" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "privacy_status" TEXT NOT NULL DEFAULT 'PRIVATE',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT DEFAULT '',
    "widget_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportVideoHistory" (
    "id" SERIAL NOT NULL,
    "batch_id" TEXT,
    "video_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "export_video_id" TEXT NOT NULL,

    CONSTRAINT "ExportVideoHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExportVideo_widget_id_key" ON "ExportVideo"("widget_id");

-- AddForeignKey
ALTER TABLE "ExportVideo" ADD CONSTRAINT "ExportVideo_widget_id_fkey" FOREIGN KEY ("widget_id") REFERENCES "Widget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportVideoHistory" ADD CONSTRAINT "ExportVideoHistory_export_video_id_fkey" FOREIGN KEY ("export_video_id") REFERENCES "ExportVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
