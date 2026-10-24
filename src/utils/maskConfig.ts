const VISIBLE_EDGE_LENGTH = 2;
const MINIMUM_LENGTH_TO_REVEAL_EDGES = 8;

function maskString(value: string): string {
    if (value === "") return "";
    if (value.length < MINIMUM_LENGTH_TO_REVEAL_EDGES) return "*".repeat(value.length);
    const maskedMiddle = "*".repeat(value.length - VISIBLE_EDGE_LENGTH * 2);
    return `${value.slice(0, VISIBLE_EDGE_LENGTH)}${maskedMiddle}${value.slice(-VISIBLE_EDGE_LENGTH)}`;
}

// Strings are partially masked (short ones fully); numbers and booleans are kept as-is
export function maskConfig(value: unknown): unknown {
    if (typeof value === "string") return maskString(value);
    if (Array.isArray(value)) return value.map(maskConfig);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, nestedValue]) => [key, maskConfig(nestedValue)]),
        );
    }
    return value;
}
