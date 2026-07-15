-- AlterTable
ALTER TABLE "WidgetType" ADD COLUMN     "description" TEXT,
ADD COLUMN     "href" TEXT,
ADD COLUMN     "icon_url" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "theme_color" TEXT;
