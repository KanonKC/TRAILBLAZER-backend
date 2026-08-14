export interface EnrichedEndCreditViewerRecord {
    id: number;
    viewer_id: string;
    type: string;
    value: string;
    end_credit_id: string;
    platform_created_at: Date;
    display_name: string | null;
    avatar_url: string | null;
}
