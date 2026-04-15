export interface ExportVideoToYoutubeRequest {
    videoId: string;
    title: string;
    description?: string;
    tags?: string[] | null;
    privacyStatus?: "PUBLIC" | "UNLISTED" | "PRIVATE";
    doSplit?: boolean;
}