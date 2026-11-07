import { BadRequestError } from '@/errors';
import { UploadedFileService } from '@/services/uploadedFile/uploadedFile.service';
import PresignedUploadService, { PresignedUploadPolicy } from '@/services/presignedUpload/presignedUpload.service';

const TWO_MEGABYTES = 2 * 1024 * 1024;
const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];
const audioTypes = [
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'application/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
];

/**
 * Random Pool's presigned upload rules. Its endpoints, Redis prefix, pending key layout, limits and messages are
 * public behaviour and stay exactly as they were: images and audio only (no video), 2 MB, audio up to 15 seconds.
 */
function buildRandomPoolPolicy(uploads: UploadedFileService): PresignedUploadPolicy {
  return {
    redisKeyPrefix: 'randomPool:upload:',
    pendingKey: (ownerId, token) => `users/${ownerId}/pending/${token}`,
    tokenTtlSeconds: () => 600,
    kinds: {
      image: { types: imageTypes, maxBytes: TWO_MEGABYTES },
      audio: {
        types: audioTypes,
        maxBytes: TWO_MEGABYTES,
        maxDurationMs: 15_000,
        invalidMediaMessage: 'Invalid audio file',
        tooLongMessage: 'Audio must be at most 15 seconds',
      },
    },
    assertCanStore: async (ownerId, sizeBytes, transactionId) => {
      const storage = await uploads.getTotalFileSize(ownerId, transactionId);
      if (storage.total_size_kb + Math.ceil(sizeBytes / 1024) > storage.max_storage_kb)
        throw new BadRequestError('Storage limit reached');
    },
    logName: 'randomPoolUpload',
  };
}

export default class RandomPoolUploadService {
  private readonly presignedUploads: PresignedUploadService;

  constructor(uploads: UploadedFileService) {
    this.presignedUploads = new PresignedUploadService(uploads, buildRandomPoolPolicy(uploads));
  }

  begin(ownerId: string, input: unknown, transactionId?: string) {
    return this.presignedUploads.begin(ownerId, input, transactionId);
  }

  complete(ownerId: string, token: string, transactionId?: string) {
    return this.presignedUploads.complete(ownerId, token, transactionId);
  }
}
