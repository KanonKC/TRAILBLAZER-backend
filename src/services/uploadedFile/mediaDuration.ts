import { parseBuffer } from 'music-metadata';

const MP4_MIME_TYPES = ['video/mp4'];
const BOX_HEADER_BYTES = 8;
const LARGE_BOX_HEADER_BYTES = 16;

/**
 * Walks the sibling boxes in `buffer[start, end)` and returns the payload range of the first box of `type`.
 * An MP4 is a flat sequence of [size][type][payload] boxes; `moov` may come before or after the bulky `mdat`.
 */
function findBox(buffer: Buffer, start: number, end: number, type: string): { payloadStart: number; payloadEnd: number } | null {
  let offset = start;
  while (offset + BOX_HEADER_BYTES <= end) {
    let boxSize = buffer.readUInt32BE(offset);
    const boxType = buffer.toString('latin1', offset + 4, offset + 8);
    let headerBytes = BOX_HEADER_BYTES;
    if (boxSize === 1) {
      // 64-bit size follows the type
      if (offset + LARGE_BOX_HEADER_BYTES > end) return null;
      const largeSize = buffer.readBigUInt64BE(offset + 8);
      if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      boxSize = Number(largeSize);
      headerBytes = LARGE_BOX_HEADER_BYTES;
    } else if (boxSize === 0) {
      // The box runs to the end of the file
      boxSize = end - offset;
    }
    if (boxSize < headerBytes || offset + boxSize > end) return null;
    if (boxType === type) return { payloadStart: offset + headerBytes, payloadEnd: offset + boxSize };
    offset += boxSize;
  }
  return null;
}

/**
 * Reads the duration of an MP4 straight from the movie header (`moov/mvhd`).
 * music-metadata reports no duration for an MP4 without an audio track, and a silent screen recording is a
 * perfectly valid reaction video, so the container is read directly instead.
 */
function readMp4DurationMs(buffer: Buffer): number | null {
  const movieBox = findBox(buffer, 0, buffer.length, 'moov');
  if (!movieBox) return null;
  const headerBox = findBox(buffer, movieBox.payloadStart, movieBox.payloadEnd, 'mvhd');
  if (!headerBox) return null;

  const version = buffer.readUInt8(headerBox.payloadStart);
  // version 0: creation(4) modification(4) timescale(4) duration(4); version 1 widens times and duration to 8 bytes
  const timescaleOffset = headerBox.payloadStart + 4 + (version === 1 ? 16 : 8);
  const durationOffset = timescaleOffset + 4;
  const durationBytes = version === 1 ? 8 : 4;
  if (durationOffset + durationBytes > headerBox.payloadEnd) return null;

  const timescale = buffer.readUInt32BE(timescaleOffset);
  const durationUnits = version === 1 ? Number(buffer.readBigUInt64BE(durationOffset)) : buffer.readUInt32BE(durationOffset);
  if (timescale === 0 || !Number.isFinite(durationUnits) || durationUnits <= 0) return null;
  return Math.round((durationUnits / timescale) * 1000);
}

/**
 * Duration of an audio or video file in milliseconds, or null when it cannot be read.
 * A null result is meaningful: the upload `Content-Type` is not signed, so a file that does not parse as the
 * type it claims to be must not be trusted.
 */
export async function readMediaDurationMs(buffer: Buffer, mimeType: string): Promise<number | null> {
  try {
    if (MP4_MIME_TYPES.includes(mimeType)) return readMp4DurationMs(buffer);
    const seconds = (await parseBuffer(buffer, { mimeType })).format.duration;
    return seconds && seconds > 0 ? Math.round(seconds * 1000) : null;
  } catch {
    return null;
  }
}
