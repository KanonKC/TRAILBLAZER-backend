import { readFileSync } from 'fs';
import path from 'path';
import { z } from 'zod';
import redis from '@/libs/redis';
import s3 from '@/libs/awsS3';
import { BadRequestError, NotFoundError } from '@/errors';
import RandomPoolUploadService from '@/services/randomPool/randomPoolUpload.service';
import ReactiveRewardUploadService from '@/services/reactiveReward/reactiveRewardUpload.service';

jest.mock('@/libs/redis', () => ({
  __esModule: true,
  default: { set: jest.fn(), getDel: jest.fn() },
}));
jest.mock('@/libs/awsS3', () => ({
  __esModule: true,
  default: { getUploadURL: jest.fn(), getFile: jest.fn(), deleteFile: jest.fn() },
}));
jest.mock('crypto', () => ({ ...jest.requireActual('crypto'), randomUUID: jest.fn(() => 'token-1') }));

const redisMock = redis as unknown as { set: jest.Mock; getDel: jest.Mock };
const s3Mock = s3 as unknown as { getUploadURL: jest.Mock; getFile: jest.Mock; deleteFile: jest.Mock };

const MEGABYTE = 1024 * 1024;
const ownerId = 'owner-1';

/** Real H.264 with no audio track, 1.5 s. */
const silentMp4 = readFileSync(path.join(__dirname, '../uploadedFile/__fixtures__/silent-1500ms.mp4'));

function syntheticMp4(durationMs: number): Buffer {
  const box = (type: string, payload: Buffer) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + payload.length, 0);
    header.write(type, 4, 'latin1');
    return Buffer.concat([header, payload]);
  };
  const fields = Buffer.alloc(20);
  fields.writeUInt32BE(1000, 12); // timescale
  fields.writeUInt32BE(durationMs, 16);
  return Buffer.concat([box('ftyp', Buffer.from('isom0000', 'latin1')), box('moov', box('mvhd', Buffer.concat([fields, Buffer.alloc(80)])))]);
}

function pendingRecord(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ name: 'clip.mp4', type: 'video/mp4', size: silentMp4.length, kind: 'video', key: `pending-uploads/${ownerId}/token-1`, ...overrides });
}

describe('presigned uploads', () => {
  const uploads = {
    getTotalFileSize: jest.fn(),
    assertCanStore: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    uploads.getTotalFileSize.mockResolvedValue({ total_size_kb: 0, max_storage_kb: 5 * 1024 });
    uploads.assertCanStore.mockResolvedValue(undefined);
    uploads.create.mockImplementation(async (_owner, file) => ({ id: 'file-1', name: file.filename }));
    redisMock.set.mockResolvedValue('OK');
    s3Mock.getUploadURL.mockResolvedValue('https://s3.test/upload');
    s3Mock.deleteFile.mockResolvedValue(undefined);
  });

  describe('Random Pool keeps its public behaviour', () => {
    const service = () => new RandomPoolUploadService(uploads as any);

    it('issues an image URL under its own Redis prefix and pending key, valid for 10 minutes', async () => {
      const result = await service().begin(ownerId, { name: 'a.png', type: 'image/png', size: MEGABYTE, kind: 'image' });
      expect(result).toEqual({ token: 'token-1', url: 'https://s3.test/upload' });
      expect(redisMock.set).toHaveBeenCalledWith(
        `randomPool:upload:${ownerId}:token-1`,
        expect.stringContaining(`"key":"users/${ownerId}/pending/token-1"`),
        { expiration: { type: 'EX', value: 600 } }
      );
      expect(s3Mock.getUploadURL).toHaveBeenCalledWith(`users/${ownerId}/pending/token-1`, 'image/png', MEGABYTE);
    });

    it('does not accept video', async () => {
      await expect(service().begin(ownerId, { name: 'a.mp4', type: 'video/mp4', size: MEGABYTE, kind: 'video' })).rejects.toBeInstanceOf(z.ZodError);
      await expect(service().begin(ownerId, { name: 'a.mp4', type: 'video/mp4', size: MEGABYTE, kind: 'image' })).rejects.toBeInstanceOf(z.ZodError);
      await expect(service().begin(ownerId, { name: 'a.mp4', type: 'video/mp4', size: MEGABYTE, kind: 'audio' })).rejects.toBeInstanceOf(z.ZodError);
      expect(s3Mock.getUploadURL).not.toHaveBeenCalled();
    });

    it('still caps every kind at 2 MB with the schema message it always had', async () => {
      await expect(service().begin(ownerId, { name: 'a.png', type: 'image/png', size: 2 * MEGABYTE + 1, kind: 'image' })).rejects.toThrow(/<=2097152/);
    });

    it('uses the cached storage check and its original English message', async () => {
      uploads.getTotalFileSize.mockResolvedValue({ total_size_kb: 5 * 1024, max_storage_kb: 5 * 1024 });
      await expect(service().begin(ownerId, { name: 'a.png', type: 'image/png', size: 1024, kind: 'image' })).rejects.toThrow('Storage limit reached');
      expect(uploads.assertCanStore).not.toHaveBeenCalled();
    });

    it('does not check the storage a second time when completing', async () => {
      redisMock.getDel.mockResolvedValue(pendingRecord({ type: 'image/png', kind: 'image', size: 3, name: 'a.png', key: `users/${ownerId}/pending/token-1` }));
      s3Mock.getFile.mockResolvedValue({ buffer: Buffer.from([1, 2, 3]), contentType: 'image/png' });
      await service().complete(ownerId, 'token-1');
      expect(uploads.getTotalFileSize).not.toHaveBeenCalled();
      expect(uploads.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Reactive Reward uploads', () => {
    const service = () => new ReactiveRewardUploadService(uploads as any);
    const beginVideo = (size: number) => service().begin(ownerId, { name: 'clip.mp4', type: 'video/mp4', size, kind: 'video' });

    it('issues a video URL under pending-uploads/ with a 15 minute token', async () => {
      await beginVideo(5 * MEGABYTE);
      expect(redisMock.set).toHaveBeenCalledWith(
        `reactiveReward:upload:${ownerId}:token-1`,
        expect.stringContaining(`"key":"pending-uploads/${ownerId}/token-1"`),
        { expiration: { type: 'EX', value: 900 } }
      );
      expect(s3Mock.getUploadURL).toHaveBeenCalledWith(`pending-uploads/${ownerId}/token-1`, 'video/mp4', 5 * MEGABYTE);
    });

    it('keeps the 10 minute token for images and audio', async () => {
      await service().begin(ownerId, { name: 'a.mp3', type: 'audio/mpeg', size: MEGABYTE, kind: 'audio' });
      expect(redisMock.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), { expiration: { type: 'EX', value: 600 } });
    });

    it('accepts a video of exactly 20 MB and refuses one byte more', async () => {
      await expect(beginVideo(20 * MEGABYTE)).resolves.toMatchObject({ token: 'token-1' });
      await expect(beginVideo(20 * MEGABYTE + 1)).rejects.toThrow();
    });

    it('holds images to 2 MB even though videos may be larger', async () => {
      await expect(service().begin(ownerId, { name: 'a.png', type: 'image/png', size: 3 * MEGABYTE, kind: 'image' })).rejects.toThrow('File must be at most 2 MB');
    });

    it('only accepts mp4 and webm as video', async () => {
      await expect(service().begin(ownerId, { name: 'a.mov', type: 'video/quicktime', size: MEGABYTE, kind: 'video' })).rejects.toThrow('Unsupported file type');
      await expect(service().begin(ownerId, { name: 'a.webm', type: 'video/webm', size: MEGABYTE, kind: 'video' })).resolves.toBeDefined();
    });

    it('refuses to issue a URL when the owner has no room, with the Thai message', async () => {
      uploads.assertCanStore.mockRejectedValue(new BadRequestError('พื้นที่จัดเก็บไม่เพียงพอ'));
      await expect(beginVideo(6 * MEGABYTE)).rejects.toThrow('พื้นที่จัดเก็บไม่เพียงพอ');
      expect(s3Mock.getUploadURL).not.toHaveBeenCalled();
      expect(redisMock.set).not.toHaveBeenCalled();
    });

    describe('complete', () => {
      const complete = () => service().complete(ownerId, 'token-1');

      it('accepts a valid mp4 that has no audio track and stores it', async () => {
        redisMock.getDel.mockResolvedValue(pendingRecord());
        s3Mock.getFile.mockResolvedValue({ buffer: silentMp4, contentType: 'video/mp4' });
        await expect(complete()).resolves.toMatchObject({ id: 'file-1' });
        expect(uploads.create).toHaveBeenCalledWith(ownerId, { buffer: silentMp4, filename: 'clip.mp4', mimetype: 'video/mp4' }, undefined);
      });

      it('checks the storage again before storing, since the owner may have filled up since begin', async () => {
        redisMock.getDel.mockResolvedValue(pendingRecord());
        s3Mock.getFile.mockResolvedValue({ buffer: silentMp4, contentType: 'video/mp4' });
        uploads.assertCanStore.mockRejectedValue(new BadRequestError('พื้นที่จัดเก็บไม่เพียงพอ'));
        await expect(complete()).rejects.toThrow('พื้นที่จัดเก็บไม่เพียงพอ');
        expect(uploads.assertCanStore).toHaveBeenCalledWith(ownerId, silentMp4.length, undefined);
        expect(uploads.create).not.toHaveBeenCalled();
      });

      it('rejects a video longer than 30 seconds', async () => {
        const longVideo = syntheticMp4(31_000);
        redisMock.getDel.mockResolvedValue(pendingRecord({ size: longVideo.length }));
        s3Mock.getFile.mockResolvedValue({ buffer: longVideo, contentType: 'video/mp4' });
        await expect(complete()).rejects.toThrow('Video must be at most 30 seconds');
        expect(uploads.create).not.toHaveBeenCalled();
      });

      it('accepts a video of exactly 30 seconds', async () => {
        const video = syntheticMp4(30_000);
        redisMock.getDel.mockResolvedValue(pendingRecord({ size: video.length }));
        s3Mock.getFile.mockResolvedValue({ buffer: video, contentType: 'video/mp4' });
        await expect(complete()).resolves.toBeDefined();
      });

      it('rejects bytes that do not parse as the declared video, since the Content-Type is not signed', async () => {
        const notAVideo = Buffer.from('<html>definitely not an mp4</html>');
        redisMock.getDel.mockResolvedValue(pendingRecord({ size: notAVideo.length }));
        s3Mock.getFile.mockResolvedValue({ buffer: notAVideo, contentType: 'video/mp4' });
        await expect(complete()).rejects.toThrow('Invalid video file');
        expect(uploads.create).not.toHaveBeenCalled();
      });

      it('rejects a file whose size differs from what was declared', async () => {
        redisMock.getDel.mockResolvedValue(pendingRecord({ size: silentMp4.length + 1 }));
        s3Mock.getFile.mockResolvedValue({ buffer: silentMp4, contentType: 'video/mp4' });
        await expect(complete()).rejects.toThrow('does not match');
      });

      it('rejects a file whose stored content type differs from what was declared', async () => {
        redisMock.getDel.mockResolvedValue(pendingRecord());
        s3Mock.getFile.mockResolvedValue({ buffer: silentMp4, contentType: 'application/octet-stream' });
        await expect(complete()).rejects.toThrow('does not match');
      });

      it('tells an expired or already used token apart', async () => {
        redisMock.getDel.mockResolvedValue(null);
        await expect(complete()).rejects.toBeInstanceOf(NotFoundError);
        expect(s3Mock.getFile).not.toHaveBeenCalled();
      });

      it('always deletes the temporary object, even when verification fails', async () => {
        redisMock.getDel.mockResolvedValue(pendingRecord({ size: 5 }));
        s3Mock.getFile.mockResolvedValue({ buffer: Buffer.from('12345'), contentType: 'video/mp4' });
        await complete().catch(() => undefined);
        expect(s3Mock.deleteFile).toHaveBeenCalledWith(`pending-uploads/${ownerId}/token-1`);
      });

      it('does not fail the upload when the temporary object cannot be deleted', async () => {
        redisMock.getDel.mockResolvedValue(pendingRecord());
        s3Mock.getFile.mockResolvedValue({ buffer: silentMp4, contentType: 'video/mp4' });
        s3Mock.deleteFile.mockRejectedValue(new Error('s3 down'));
        await expect(complete()).resolves.toBeDefined();
      });

      it('rejects bytes that are not the declared audio', async () => {
        redisMock.getDel.mockResolvedValue(pendingRecord({ kind: 'audio', type: 'audio/mpeg', name: 'a.mp3' }));
        s3Mock.getFile.mockResolvedValue({ buffer: silentMp4, contentType: 'audio/mpeg' });
        await expect(complete()).rejects.toThrow('Invalid audio file');
      });
    });
  });
});
