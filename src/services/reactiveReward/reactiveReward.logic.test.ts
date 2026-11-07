import {
  PlaybackFacts,
  mediaFileProblem,
  playbackLengthMs,
  presenceKey,
  queueCeilingMs,
} from './reactiveReward.logic';

const image = (overrides: Partial<PlaybackFacts> = {}): PlaybackFacts => ({
  mediaType: 'IMAGE',
  displayDurationMs: 5000,
  mediaDurationMs: null,
  hasSound: false,
  soundDurationMs: null,
  ...overrides,
});

describe('playback length and queue ceiling', () => {
  it('holds an image for its display time', () => {
    expect(playbackLengthMs(image({ displayDurationMs: 7000 }))).toBe(7000);
    expect(queueCeilingMs(image({ displayDurationMs: 7000 }))).toBe(12_000);
  });

  it('holds an image with a sound for the longer of the two', () => {
    expect(playbackLengthMs(image({ hasSound: true, soundDurationMs: 9000 }))).toBe(9000);
    expect(playbackLengthMs(image({ hasSound: true, soundDurationMs: 2000 }))).toBe(5000);
  });

  it('assumes 30 seconds for an image sound of unknown length', () => {
    expect(playbackLengthMs(image({ hasSound: true, soundDurationMs: null }))).toBe(30_000);
    expect(queueCeilingMs(image({ hasSound: true, soundDurationMs: null }))).toBe(35_000);
  });

  it('ignores a leftover sound duration when the image has no sound', () => {
    expect(playbackLengthMs(image({ hasSound: false, soundDurationMs: 20_000 }))).toBe(5000);
  });

  it('plays audio and video to the end of the file, whatever the display time says', () => {
    expect(playbackLengthMs({ ...image(), mediaType: 'AUDIO', mediaDurationMs: 3000 })).toBe(3000);
    expect(playbackLengthMs({ ...image(), mediaType: 'VIDEO', mediaDurationMs: 12_000, displayDurationMs: 1000 })).toBe(12_000);
    expect(queueCeilingMs({ ...image(), mediaType: 'VIDEO', mediaDurationMs: 12_000 })).toBe(17_000);
  });

  it('assumes 30 seconds when an audio or video file has no recorded duration', () => {
    expect(playbackLengthMs({ ...image(), mediaType: 'AUDIO', mediaDurationMs: null })).toBe(30_000);
    expect(queueCeilingMs({ ...image(), mediaType: 'VIDEO', mediaDurationMs: null })).toBe(35_000);
  });
});

describe('mediaFileProblem', () => {
  const file = (type: string, size_kb: number, duration_ms: number | null = null) => ({ type, size_kb, duration_ms });

  it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'])('accepts a small %s as an image', (type) => {
    expect(mediaFileProblem(file(type, 100), 'IMAGE')).toBeNull();
  });

  it('refuses an image that is not an image type, or over 2 MB', () => {
    expect(mediaFileProblem(file('image/svg+xml', 10), 'IMAGE')).toMatch(/png, jpeg, gif, webp or avif/);
    expect(mediaFileProblem(file('image/png', 2048), 'IMAGE')).toBeNull();
    expect(mediaFileProblem(file('image/png', 2049), 'IMAGE')).toMatch(/at most 2 MB/);
  });

  it('accepts audio up to 30 seconds and 2 MB', () => {
    expect(mediaFileProblem(file('audio/mpeg', 2048, 30_000), 'AUDIO')).toBeNull();
    expect(mediaFileProblem(file('audio/mpeg', 2049, 1000), 'AUDIO')).toMatch(/at most 2 MB/);
    expect(mediaFileProblem(file('audio/mpeg', 100, 30_001), 'AUDIO')).toMatch(/at most 30 seconds/);
    expect(mediaFileProblem(file('audio/flac', 100, 1000), 'AUDIO')).toMatch(/mp3, wav or ogg/);
  });

  it('tolerates audio whose duration was never recorded', () => {
    expect(mediaFileProblem(file('audio/wav', 100, null), 'AUDIO')).toBeNull();
  });

  it('accepts mp4 and webm video up to 20 MB and 30 seconds', () => {
    expect(mediaFileProblem(file('video/mp4', 20_480, 30_000), 'VIDEO')).toBeNull();
    expect(mediaFileProblem(file('video/webm', 100, 1000), 'VIDEO')).toBeNull();
    expect(mediaFileProblem(file('video/mp4', 20_481, 1000), 'VIDEO')).toMatch(/at most 20 MB/);
    expect(mediaFileProblem(file('video/mp4', 100, 30_001), 'VIDEO')).toMatch(/at most 30 seconds/);
    expect(mediaFileProblem(file('video/quicktime', 100, 1000), 'VIDEO')).toMatch(/mp4 or webm/);
  });

  it('refuses a video without a recorded duration, since only the verifying upload records one', () => {
    expect(mediaFileProblem(file('video/mp4', 100, null), 'VIDEO')).toMatch(/duration could not be read/);
  });

  it('refuses a file of the wrong kind for the chosen media type', () => {
    expect(mediaFileProblem(file('video/mp4', 100, 1000), 'IMAGE')).not.toBeNull();
    expect(mediaFileProblem(file('image/png', 100), 'VIDEO')).not.toBeNull();
    expect(mediaFileProblem(file('image/png', 100), 'AUDIO')).not.toBeNull();
  });

  it('words a problem with the sound next to an image as a sound problem', () => {
    expect(mediaFileProblem(file('audio/mpeg', 100, 31_000), 'AUDIO', 'sound')).toBe('Sound must be at most 30 seconds');
  });
});

describe('presenceKey', () => {
  it('is per owner', () => {
    expect(presenceKey('owner-1')).toBe('reactive-reward:presence:owner-1');
  });
});
