export interface ReconcileSummary {
    skipped: boolean;
    created: number;
    deleted: number;
    failed: number;
    liveFallbackTriggered: number;
    durationMs: number;
}
