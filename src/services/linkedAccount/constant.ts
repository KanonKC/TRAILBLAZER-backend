export const SUPPORTED_PLATFORMS = ["youtube", "discord", "spotify"] as const;
export type Platform = (typeof SUPPORTED_PLATFORMS)[number];