interface ClipVideoQuality {
    frameRate: number;
    quality: string;
    sourceURL: string;
    __typename: string;
}

interface PlaybackAccessToken {
    signature: string;
    value: string;
    __typename: string;
}

interface Clip {
    id: string;
    playbackAccessToken: PlaybackAccessToken;
    videoQualities: ClipVideoQuality[];
    __typename: string;
}

export interface TwitchClipResponse {
    data: {
        clip: Clip;
    };
    extensions: {
        durationMilliseconds: number;
        operationName: string;
        requestID: string;
    };
}

export interface ExportVideoToYoutubeResponse {
    data?: {
        exportVideoToYoutube: {
            video: {
                id: string;
                __typename: string;
            };
            __typename: string;
        };
    };
    errors?: {
        message: string;
    }[];
    extensions: {
        durationMilliseconds: number;
        operationName: string;
        requestID: string;
    };
}