-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canvas_overlay_key" TEXT;

-- CreateTable
CREATE TABLE "Canvas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "duration_ms" INTEGER NOT NULL DEFAULT 5000,
    "owner_id" TEXT NOT NULL,
    "triggered_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Canvas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasElement" (
    "id" TEXT NOT NULL,
    "canvas_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "media_key" TEXT,
    "text_content" TEXT,
    "text_style" JSONB,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "z_index" INTEGER NOT NULL DEFAULT 0,
    "opacity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "start_delay_ms" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 3000,
    "enter_transition" TEXT NOT NULL DEFAULT 'fade',
    "exit_transition" TEXT NOT NULL DEFAULT 'fade',
    "transition_ms" INTEGER NOT NULL DEFAULT 400,
    "volume" INTEGER NOT NULL DEFAULT 100,
    "loop" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasWidgetLink" (
    "id" TEXT NOT NULL,
    "canvas_id" TEXT NOT NULL,
    "widget_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvasWidgetLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Canvas_owner_id_idx" ON "Canvas"("owner_id");

-- CreateIndex
CREATE INDEX "CanvasElement_canvas_id_idx" ON "CanvasElement"("canvas_id");

-- CreateIndex
CREATE INDEX "CanvasWidgetLink_widget_id_idx" ON "CanvasWidgetLink"("widget_id");

-- CreateIndex
CREATE UNIQUE INDEX "CanvasWidgetLink_canvas_id_widget_id_key" ON "CanvasWidgetLink"("canvas_id", "widget_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_canvas_overlay_key_key" ON "User"("canvas_overlay_key");

-- AddForeignKey
ALTER TABLE "Canvas" ADD CONSTRAINT "Canvas_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasElement" ADD CONSTRAINT "CanvasElement_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "Canvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasElement" ADD CONSTRAINT "CanvasElement_media_key_fkey" FOREIGN KEY ("media_key") REFERENCES "UploadedFile"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasWidgetLink" ADD CONSTRAINT "CanvasWidgetLink_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "Canvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasWidgetLink" ADD CONSTRAINT "CanvasWidgetLink_widget_id_fkey" FOREIGN KEY ("widget_id") REFERENCES "Widget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

