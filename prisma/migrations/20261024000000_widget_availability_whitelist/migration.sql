ALTER TABLE "User" ADD COLUMN "is_whitelisted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Widget" ALTER COLUMN "enabled" SET DEFAULT false;
ALTER TABLE "WidgetType" ADD COLUMN "availability" TEXT NOT NULL DEFAULT 'active';
UPDATE "WidgetType" SET "availability" = CASE
  WHEN NOT "is_display" THEN 'hide'
  WHEN NOT "is_active" THEN 'inactive'
  ELSE 'active'
END;
ALTER TABLE "WidgetType" ADD CONSTRAINT "WidgetType_availability_check"
  CHECK ("availability" IN ('hide', 'inactive', 'whitelist_only', 'active'));
UPDATE "Widget" AS widget
SET "enabled" = false
FROM "WidgetType" AS widget_type
WHERE widget."widget_type_slug" = widget_type."slug"
  AND widget_type."availability" IN ('hide', 'inactive')
  AND widget."enabled" = true;
