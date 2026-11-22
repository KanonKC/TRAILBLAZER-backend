import { readFileSync } from 'fs';
import path from 'path';
import { parseBuffer } from 'music-metadata';
import { readMediaDurationMs } from './mediaDuration';

jest.mock('music-metadata', () => ({ parseBuffer: jest.fn() }));

function box(type: string, payload: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, payload]);
}

/** A box with a 64-bit size field: size is 1, and the real size follows the type. */
function largeBox(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(16);
  header.writeUInt32BE(1, 0);
  header.write(type, 4, 'latin1');
  header.writeBigUInt64BE(BigInt(16 + payload.length), 8);
  return Buffer.concat([header, payload]);
}

function movieHeader(timescale: number, duration: number, version: 0 | 1 = 0): Buffer {
  const trailingFields = Buffer.alloc(80); // rate, volume, matrix, next track id ...
  if (version === 0) {
    const fields = Buffer.alloc(4 + 4 + 4 + 4 + 4);
    fields.writeUInt8(0, 0); // version
    fields.writeUInt32BE(timescale, 12);
    fields.writeUInt32BE(duration, 16);
    return box('mvhd', Buffer.concat([fields, trailingFields]));
  }
  const fields = Buffer.alloc(4 + 8 + 8 + 4 + 8);
  fields.writeUInt8(1, 0); // version
  fields.writeUInt32BE(timescale, 20);
  fields.writeBigUInt64BE(BigInt(duration), 24);
  return box('mvhd', Buffer.concat([fields, trailingFields]));
}

const fileTypeBox = box('ftyp', Buffer.from('isom0000isomiso2mp41', 'latin1'));
const mediaDataBox = box('mdat', Buffer.alloc(2048, 7));

describe('readMediaDurationMs', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('mp4', () => {
    const read = (buffer: Buffer) => readMediaDurationMs(buffer, 'video/mp4');

    it('reads the duration from the movie header, in milliseconds', async () => {
      const file = Buffer.concat([fileTypeBox, box('moov', movieHeader(1000, 12_345)), mediaDataBox]);
      await expect(read(file)).resolves.toBe(12_345);
    });

    it('applies the timescale', async () => {
      const file = Buffer.concat([fileTypeBox, box('moov', movieHeader(600, 3000)), mediaDataBox]);
      await expect(read(file)).resolves.toBe(5000);
    });

    it('finds a moov that comes after the media data', async () => {
      const file = Buffer.concat([fileTypeBox, mediaDataBox, box('moov', movieHeader(1000, 8000))]);
      await expect(read(file)).resolves.toBe(8000);
    });

    it('reads a version 1 movie header with 64-bit fields', async () => {
      const file = Buffer.concat([fileTypeBox, box('moov', movieHeader(1000, 29_000, 1))]);
      await expect(read(file)).resolves.toBe(29_000);
    });

    it('skips a box that uses a 64-bit size', async () => {
      const file = Buffer.concat([fileTypeBox, largeBox('mdat', Buffer.alloc(4096, 1)), box('moov', movieHeader(1000, 4000))]);
      await expect(read(file)).resolves.toBe(4000);
    });

    it('reads a moov that is the last box and declares size 0 (to the end of the file)', async () => {
      const movie = box('moov', movieHeader(1000, 6000));
      movie.writeUInt32BE(0, 0);
      await expect(read(Buffer.concat([fileTypeBox, mediaDataBox, movie]))).resolves.toBe(6000);
    });

    it('does not need an audio track, which is why music-metadata is not used for mp4', async () => {
      const silentVideo = Buffer.concat([fileTypeBox, box('moov', movieHeader(1000, 9000)), mediaDataBox]);
      await expect(read(silentVideo)).resolves.toBe(9000);
      expect(parseBuffer).not.toHaveBeenCalled();
    });

    it.each([
      ['has no moov box', Buffer.concat([fileTypeBox, mediaDataBox])],
      ['has a moov without a movie header', Buffer.concat([fileTypeBox, box('moov', box('trak'))])],
      ['has a zero duration', Buffer.concat([fileTypeBox, box('moov', movieHeader(1000, 0))])],
      ['has a zero timescale', Buffer.concat([fileTypeBox, box('moov', movieHeader(0, 5000))])],
      ['is not an mp4 at all', Buffer.from('this is definitely not a video file, just text')],
      ['is empty', Buffer.alloc(0)],
      ['is cut off inside a box', Buffer.concat([fileTypeBox, box('moov', movieHeader(1000, 5000))]).subarray(0, 60)],
    ])('returns null for a file that %s', async (_description, file) => {
      await expect(read(file)).resolves.toBeNull();
    });

    it('does not trust a box that claims to be larger than the file', async () => {
      const lying = box('moov', movieHeader(1000, 5000));
      lying.writeUInt32BE(lying.length + 500, 0);
      await expect(read(Buffer.concat([fileTypeBox, lying]))).resolves.toBeNull();
    });
  });

  describe('a real encoder output', () => {
    // 1.5 s of H.264 with no audio track at all, made by ffmpeg. music-metadata reports no duration for such a file.
    const silentMp4 = readFileSync(path.join(__dirname, '__fixtures__', 'silent-1500ms.mp4'));

    it('reads a silent mp4 without involving the audio parser', async () => {
      await expect(readMediaDurationMs(silentMp4, 'video/mp4')).resolves.toBe(1500);
      expect(parseBuffer).not.toHaveBeenCalled();
    });

    it('rejects the same bytes when they are declared as something else', async () => {
      (parseBuffer as jest.Mock).mockRejectedValue(new Error('not a webm'));
      await expect(readMediaDurationMs(silentMp4, 'video/webm')).resolves.toBeNull();
    });
  });

  describe('other formats', () => {
    it('uses the audio/video parser and rounds to milliseconds', async () => {
      (parseBuffer as jest.Mock).mockResolvedValue({ format: { duration: 2.5004 } });
      await expect(readMediaDurationMs(Buffer.from('x'), 'video/webm')).resolves.toBe(2500);
      expect(parseBuffer).toHaveBeenCalledWith(expect.any(Buffer), { mimeType: 'video/webm' });
    });

    it('returns null when the parser finds no duration', async () => {
      (parseBuffer as jest.Mock).mockResolvedValue({ format: {} });
      await expect(readMediaDurationMs(Buffer.from('x'), 'audio/mpeg')).resolves.toBeNull();
    });

    it('returns null when the parser rejects the file', async () => {
      (parseBuffer as jest.Mock).mockRejectedValue(new Error('not media'));
      await expect(readMediaDurationMs(Buffer.from('x'), 'audio/wav')).resolves.toBeNull();
    });
  });
});
