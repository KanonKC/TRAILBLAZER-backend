import { WidgetTypeSlug } from "@/services/widget/constant";

export interface CanvasVariable {
    key: string;
    label: string;
    sample_value: string;
}

const COMMON_VARIABLES: CanvasVariable[] = [
    { key: "username", label: "Username", sample_value: "viewer123" },
    { key: "display_name", label: "Display Name", sample_value: "Viewer123" },
];

export const WIDGET_TYPE_VARIABLES: Record<string, CanvasVariable[]> = {
    [WidgetTypeSlug.FIRST_WORD]: [
        ...COMMON_VARIABLES,
        { key: "message", label: "Chat Message", sample_value: "hello!" },
    ],
    [WidgetTypeSlug.CLIP_SHOUTOUT]: [
        ...COMMON_VARIABLES,
        { key: "clip_title", label: "Clip Title", sample_value: "Epic Clutch" },
    ],
    [WidgetTypeSlug.DROP_IMAGE]: [
        ...COMMON_VARIABLES,
        { key: "image_url", label: "Dropped Image URL", sample_value: "https://example.com/image.png" },
    ],
    [WidgetTypeSlug.RANDOM_DBD_KILLER]: [
        ...COMMON_VARIABLES,
        { key: "result_name", label: "Killer Name", sample_value: "The Trapper" },
    ],
    [WidgetTypeSlug.RANDOM_DBD_PERK]: [
        ...COMMON_VARIABLES,
        { key: "result_name", label: "Perk Name", sample_value: "Adrenaline" },
    ],
};

export function getVariablesForWidgetTypes(widgetTypeSlugs: string[]): CanvasVariable[] {
    const seen = new Map<string, CanvasVariable>();
    for (const slug of widgetTypeSlugs) {
        for (const variable of WIDGET_TYPE_VARIABLES[slug] ?? []) {
            seen.set(variable.key, variable);
        }
    }
    return Array.from(seen.values());
}

export function interpolate(template: string, variables: Record<string, string>): string {
    return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key: string) => {
        return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match;
    });
}
