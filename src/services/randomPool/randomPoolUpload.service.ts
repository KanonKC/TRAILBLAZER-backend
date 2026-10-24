import { randomUUID } from 'crypto';
import { z } from 'zod';
import { parseBuffer } from 'music-metadata';
import redis from '@/libs/redis';
import s3 from '@/libs/awsS3';
import { BadRequestError, NotFoundError } from '@/errors';
import { UploadedFileService } from '@/services/uploadedFile/uploadedFile.service';
import TLogger, { Layer } from '@/logging/logger';
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
export const uploadSchema = z
  .object({
    name: z.string().min(1).max(255),
    type: z.string(),
    size: z
      .number()
      .int()
      .positive()
      .max(2 * 1024 * 1024),
    kind: z.enum(['image', 'audio']),
  })
  .refine(
    (file) => (file.kind === 'image' ? imageTypes : audioTypes).includes(file.type),
    'Unsupported file type'
  );
export default class RandomPoolUploadService {
  private readonly logger = new TLogger(Layer.SERVICE);
  constructor(private readonly uploads: UploadedFileService) {}
  async begin(ownerId: string, input: unknown, transactionId?: string) {
    const logger = this.logger.setContext('service.randomPoolUpload.begin', transactionId);
    const file = uploadSchema.parse(input);
    const storage = await this.uploads.getTotalFileSize(ownerId, transactionId);
    if (storage.total_size_kb + Math.ceil(file.size / 1024) > storage.max_storage_kb)
      throw new BadRequestError('Storage limit reached');
    const token = randomUUID();
    const key = `users/${ownerId}/pending/${token}`;
    await redis.set(`randomPool:upload:${ownerId}:${token}`, JSON.stringify({ ...file, key }), {
      EX: 600,
    });
    const url = await s3.getUploadURL(key, file.type, file.size);
    logger.info({ message: 'Created random pool upload URL' });
    return { token, url };
  }
  async complete(ownerId: string, token: string, transactionId?: string) {
    const logger = this.logger.setContext('service.randomPoolUpload.complete', transactionId);
    const raw = await redis.getDel(`randomPool:upload:${ownerId}:${token}`);
    if (!raw) throw new NotFoundError('Upload expired or already completed');
    const file = JSON.parse(raw) as z.infer<typeof uploadSchema> & { key: string };
    logger.info({ message: 'Verifying uploaded random pool file' });
    try {
      const uploaded = await s3.getFile(file.key);
      if (
        uploaded.buffer.length !== file.size ||
        uploaded.buffer.length > 2 * 1024 * 1024 ||
        uploaded.contentType !== file.type
      )
        throw new BadRequestError('Uploaded file does not match its declared size or type');
      if (file.kind === 'audio') {
        let duration: number | undefined;
        try {
          duration = (await parseBuffer(uploaded.buffer, { mimeType: file.type })).format.duration;
        } catch {
          throw new BadRequestError('Invalid audio file');
        }
        if (!duration || duration > 15)
          throw new BadRequestError('Audio must be at most 15 seconds');
      }
      // Store under a fresh immutable key: the temporary PUT URL must not be
      // able to overwrite an asset after its metadata has been verified.
      const result = await this.uploads.create(
        ownerId,
        { buffer: uploaded.buffer, filename: file.name, mimetype: file.type },
        transactionId
      );
      logger.info({ message: 'Completed random pool upload' });
      return result;
    } finally {
      await s3
        .deleteFile(file.key)
        .catch((error) => logger.warn({ message: 'Could not delete temporary upload', error }));
    }
  }
}
