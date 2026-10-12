-- AlterTable
ALTER TABLE "Canvas" ADD COLUMN     "template_type" TEXT NOT NULL DEFAULT 'image_audio';

-- DropIndex
DROP INDEX "CanvasWidgetLink_canvas_id_widget_id_key";

-- DropIndex
DROP INDEX "CanvasWidgetLink_widget_id_idx";

-- CreateIndex
CREATE INDEX "CanvasWidgetLink_canvas_id_idx" ON "CanvasWidgetLink"("canvas_id");

-- CreateIndex
CREATE UNIQUE INDEX "CanvasWidgetLink_widget_id_key" ON "CanvasWidgetLink"("widget_id");
