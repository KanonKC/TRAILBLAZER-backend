export interface CreateWidgetType {
    slug: string;
    display_name: string;
    description?: string | null;
    cost?: number;
    icon_url?: string | null;
    theme_color?: string | null;
    href?: string | null;
    is_active?: boolean;
    is_display?: boolean;
}

export type UpdateWidgetType = Partial<CreateWidgetType>;
