export const SUPPORTED_PLATFORMS = ["youtube", "discord"] as const;
export type Platform = (typeof SUPPORTED_PLATFORMS)[number];