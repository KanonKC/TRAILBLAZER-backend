import { UploadedFileService } from '@/services/uploadedFile/uploadedFile.service';
import PresignedUploadService, { PresignedUploadPolicy } from '@/services/presignedUpload/presignedUpload.service';
import {
  AUDIO_MAX_KB,
  AUDIO_MIME_TYPES,
  IMAGE_MAX_KB,
  IMAGE_MIME_TYPES,
  MAX_TIMED_MEDIA_DURATION_MS,
  VIDEO_MAX_KB,
  VIDEO_MIME_TYPES,
} from './reactiveReward.logic';

const BYTES_PER_KB = 1024;
const IMAGE_AND_AUDIO_TOKEN_TTL_SECONDS = 600;
// A 20 MB video can take a while to upload on a slow connection
const VIDEO_TOKEN_TTL_SECONDS = 900;

function buildReactiveRewardPolicy(uploads: UploadedFileService): PresignedUploadPolicy {
  return {
    redisKeyPrefix: 'reactiveReward:upload:',
    // A prefix of its own so a bucket lifecycle rule can expire abandoned uploads without touching real files
    pendingKey: (ownerId, token) => `pending-uploads/${ownerId}/${token}`,
    tokenTtlSeconds: (kind) => (kind === 'video' ? VIDEO_TOKEN_TTL_SECONDS : IMAGE_AND_AUDIO_TOKEN_TTL_SECONDS),
    kinds: {
      image: { types: IMAGE_MIME_TYPES, maxBytes: IMAGE_MAX_KB * BYTES_PER_KB },
      audio: {
        types: AUDIO_MIME_TYPES,
        maxBytes: AUDIO_MAX_KB * BYTES_PER_KB,
        maxDurationMs: MAX_TIMED_MEDIA_DURATION_MS,
        invalidMediaMessage: 'Invalid audio file',
        tooLongMessage: 'Audio must be at most 30 seconds',
      },
      video: {
        types: VIDEO_MIME_TYPES,
        maxBytes: VIDEO_MAX_KB * BYTES_PER_KB,
        maxDurationMs: MAX_TIMED_MEDIA_DURATION_MS,
        invalidMediaMessage: 'Invalid video file',
        tooLongMessage: 'Video must be at most 30 seconds',
      },
    },
    assertCanStore: (ownerId, sizeBytes, transactionId) => uploads.assertCanStore(ownerId, sizeBytes, transactionId),
    recheckStorageOnComplete: true,
    logName: 'reactiveRewardUpload',
  };
}

export default class ReactiveRewardUploadService {
  private readonly presignedUploads: PresignedUploadService;

  constructor(uploads: UploadedFileService) {
    this.presignedUploads = new PresignedUploadService(uploads, buildReactiveRewardPolicy(uploads));
  }

  begin(ownerId: string, input: unknown, transactionId?: string) {
    return this.presignedUploads.begin(ownerId, input, transactionId);
  }

  complete(ownerId: string, token: string, transactionId?: string) {
    return this.presignedUploads.complete(ownerId, token, transactionId);
  }
}
