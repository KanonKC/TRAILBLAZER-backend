-- AlterTable
ALTER TABLE "Canvas" ADD COLUMN     "template_type" TEXT NOT NULL DEFAULT 'image_audio';

-- DropIndex
DROP INDEX "CanvasWidgetLink_canvas_id_widget_id_key";

-- DropIndex
DROP INDEX "CanvasWidgetLink_widget_id_idx";

-- CreateIndex
CREATE INDEX "CanvasWidgetLink_canvas_id_idx" ON "CanvasWidgetLink"("canvas_id");

-- A widget now plays at most one canvas. Keep only the newest link per widget so the
-- unique index below cannot fail on rows the old (canvas_id, widget_id) key allowed.
DELETE FROM "CanvasWidgetLink" l
USING "CanvasWidgetLink" newer
WHERE l.widget_id = newer.widget_id
  AND (l.created_at, l.id) < (newer.created_at, newer.id);

-- CreateIndex
CREATE UNIQUE INDEX "CanvasWidgetLink_widget_id_key" ON "CanvasWidgetLink"("widget_id");
