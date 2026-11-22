import { randomUUID } from 'crypto';
import { z } from 'zod';
import redis from '@/libs/redis';
import s3 from '@/libs/awsS3';
import { BadRequestError, NotFoundError } from '@/errors';
import { UploadedFileService } from '@/services/uploadedFile/uploadedFile.service';
import { readMediaDurationMs } from '@/services/uploadedFile/mediaDuration';
import TLogger, { Layer } from '@/logging/logger';

export interface UploadKindPolicy {
  /** MIME types accepted for this kind. */
  types: readonly string[];
  maxBytes: number;
  /**
   * When set, `complete` reads the duration out of the uploaded bytes and rejects a file whose duration is
   * unreadable or longer than this. The upload Content-Type is not signed, so an unreadable file is not trusted.
   */
  maxDurationMs?: number;
  invalidMediaMessage?: string;
  tooLongMessage?: string;
}

/** Everything that differs between the widgets sharing the presigned upload flow. */
export interface PresignedUploadPolicy {
  /** Redis key prefix of the pending-upload record, followed by `<ownerId>:<token>`. */
  redisKeyPrefix: string;
  /** Where the browser PUTs the file until `complete` verifies it and moves it to its final key. */
  pendingKey: (ownerId: string, token: string) => string;
  tokenTtlSeconds: (kind: string) => number;
  kinds: Record<string, UploadKindPolicy>;
  /** Runs before a URL is issued. Throws when the owner has no room. */
  assertCanStore: (ownerId: string, sizeBytes: number, transactionId?: string) => Promise<void>;
  /** Also run assertCanStore before the verified file is stored, since the owner may have filled up since `begin`. */
  recheckStorageOnComplete?: boolean;
  /** Log context prefix, e.g. `randomPoolUpload`. */
  logName: string;
}

export function buildUploadSchema(policy: PresignedUploadPolicy) {
  const kindNames = Object.keys(policy.kinds) as [string, ...string[]];
  const largestKindBytes = Math.max(...Object.values(policy.kinds).map((kindPolicy) => kindPolicy.maxBytes));
  return z
    .object({
      name: z.string().min(1).max(255),
      type: z.string(),
      size: z.number().int().positive().max(largestKindBytes),
      kind: z.enum(kindNames),
    })
    .superRefine((file, context) => {
      const kindPolicy = policy.kinds[file.kind];
      if (!kindPolicy.types.includes(file.type)) {
        context.addIssue({ code: 'custom', message: 'Unsupported file type', path: ['type'] });
      }
      // Kinds with a lower limit than the largest one get their own message
      if (file.size > kindPolicy.maxBytes) {
        context.addIssue({ code: 'custom', message: `File must be at most ${Math.floor(kindPolicy.maxBytes / (1024 * 1024))} MB`, path: ['size'] });
      }
    });
}

type UploadRequest = z.infer<ReturnType<typeof buildUploadSchema>>;
type PendingUpload = UploadRequest & { key: string };

/**
 * Two-step upload straight to S3: `begin` hands the browser a presigned PUT URL, and `complete` downloads what
 * arrived, verifies it against what was declared, and stores it as a regular UploadedFile under a fresh key.
 */
export default class PresignedUploadService {
  private readonly logger = new TLogger(Layer.SERVICE);
  private readonly uploadSchema: ReturnType<typeof buildUploadSchema>;

  constructor(
    private readonly uploads: UploadedFileService,
    private readonly policy: PresignedUploadPolicy
  ) {
    this.uploadSchema = buildUploadSchema(policy);
  }

  async begin(ownerId: string, input: unknown, transactionId?: string) {
    const logger = this.logger.setContext(`service.${this.policy.logName}.begin`, transactionId);
    const file = this.uploadSchema.parse(input);
    await this.policy.assertCanStore(ownerId, file.size, transactionId);
    const token = randomUUID();
    const key = this.policy.pendingKey(ownerId, token);
    const pending: PendingUpload = { ...file, key };
    await redis.set(this.redisKey(ownerId, token), JSON.stringify(pending), {
      expiration: { type: 'EX', value: this.policy.tokenTtlSeconds(file.kind) },
    });
    const url = await s3.getUploadURL(key, file.type, file.size);
    logger.info({ message: 'Created upload URL', data: { kind: file.kind, size: file.size } });
    return { token, url };
  }

  async complete(ownerId: string, token: string, transactionId?: string) {
    const logger = this.logger.setContext(`service.${this.policy.logName}.complete`, transactionId);
    const raw = await redis.getDel(this.redisKey(ownerId, token));
    if (!raw) throw new NotFoundError('Upload expired or already completed');
    const file = JSON.parse(raw) as PendingUpload;
    const kindPolicy = this.policy.kinds[file.kind];
    logger.info({ message: 'Verifying uploaded file', data: { kind: file.kind } });
    try {
      const uploaded = await s3.getFile(file.key);
      if (
        uploaded.buffer.length !== file.size ||
        uploaded.buffer.length > kindPolicy.maxBytes ||
        uploaded.contentType !== file.type
      )
        throw new BadRequestError('Uploaded file does not match its declared size or type');
      if (kindPolicy.maxDurationMs !== undefined) {
        const durationMs = await readMediaDurationMs(uploaded.buffer, file.type);
        if (!durationMs) throw new BadRequestError(kindPolicy.invalidMediaMessage ?? 'Invalid media file');
        if (durationMs > kindPolicy.maxDurationMs)
          throw new BadRequestError(kindPolicy.tooLongMessage ?? 'Media is too long');
      }
      if (this.policy.recheckStorageOnComplete) {
        await this.policy.assertCanStore(ownerId, uploaded.buffer.length, transactionId);
      }
      // Store under a fresh immutable key: the temporary PUT URL must not be
      // able to overwrite an asset after its metadata has been verified.
      const result = await this.uploads.create(
        ownerId,
        { buffer: uploaded.buffer, filename: file.name, mimetype: file.type },
        transactionId
      );
      logger.info({ message: 'Completed upload', data: { kind: file.kind } });
      return result;
    } finally {
      await s3
        .deleteFile(file.key)
        .catch((error) => logger.warn({ message: 'Could not delete temporary upload', error }));
    }
  }

  private redisKey(ownerId: string, token: string) {
    return `${this.policy.redisKeyPrefix}${ownerId}:${token}`;
  }
}
