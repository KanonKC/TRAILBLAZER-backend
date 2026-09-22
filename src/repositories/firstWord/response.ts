import { FirstWord, FirstWordCustomReply, UploadedFile, Widget } from "generated/prisma/client";

export interface FirstWordWidget extends FirstWord {
    widget: Widget
    /** Included by every repository read; carries duration_ms for queue pacing. */
    audio?: UploadedFile | null
}

/** A custom reply together with its audio file, for duration lookups. */
export interface CustomReplyWithAudio extends FirstWordCustomReply {
    audio: UploadedFile | null
}
