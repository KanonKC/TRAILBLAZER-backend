-- Rename WidgetType columns to snake_case
ALTER TABLE "WidgetType" RENAME COLUMN "displayName" TO "display_name";
ALTER TABLE "WidgetType" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "WidgetType" RENAME COLUMN "updatedAt" TO "updated_at";
