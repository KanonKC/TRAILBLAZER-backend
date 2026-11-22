export const REACTION_MEDIA_TYPES = ['IMAGE', 'AUDIO', 'VIDEO'] as const;
export type ReactionMediaType = (typeof REACTION_MEDIA_TYPES)[number];

/** A 3x3 grid of anchor points on the overlay. */
export const REACTION_POSITIONS = [
  'TOP_LEFT',
  'TOP_CENTER',
  'TOP_RIGHT',
  'MIDDLE_LEFT',
  'CENTER',
  'MIDDLE_RIGHT',
  'BOTTOM_LEFT',
  'BOTTOM_CENTER',
  'BOTTOM_RIGHT',
] as const;
export type ReactionPosition = (typeof REACTION_POSITIONS)[number];

export const MAX_REACTIONS_PER_WIDGET = 50;

/** The first point switches on this many Reactions at once; every further point adds the second amount. */
export const ACTIVE_REACTIONS_FOR_FIRST_POINT = 10;
export const ACTIVE_REACTIONS_PER_EXTRA_POINT = 5;

/**
 * Points a streamer pays while `activeReactionCount` Reactions are enabled.
 * Having the widget on costs nothing by itself: 0 active = 0 points, 1-10 = 1, 11-15 = 2, 16-20 = 3 ...
 */
export function pointsForActiveReactions(activeReactionCount: number): number {
  if (activeReactionCount <= 0) return 0;
  if (activeReactionCount <= ACTIVE_REACTIONS_FOR_FIRST_POINT) return 1;
  return 1 + Math.ceil((activeReactionCount - ACTIVE_REACTIONS_FOR_FIRST_POINT) / ACTIVE_REACTIONS_PER_EXTRA_POINT);
}

/** The most Reactions that can be enabled at once with `availablePoints` to spend on this widget. */
export function activeReactionsAllowedByPoints(availablePoints: number): number {
  const wholePoints = Math.floor(availablePoints);
  if (wholePoints <= 0) return 0;
  return Math.min(
    MAX_REACTIONS_PER_WIDGET,
    ACTIVE_REACTIONS_FOR_FIRST_POINT + (wholePoints - 1) * ACTIVE_REACTIONS_PER_EXTRA_POINT
  );
}

const KILOBYTES_PER_MEGABYTE = 1024;

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];
export const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'application/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
];
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'];

export const IMAGE_MAX_KB = 2 * KILOBYTES_PER_MEGABYTE;
export const AUDIO_MAX_KB = 2 * KILOBYTES_PER_MEGABYTE;
export const VIDEO_MAX_KB = 20 * KILOBYTES_PER_MEGABYTE;
export const MAX_TIMED_MEDIA_DURATION_MS = 30_000;

/** Extra time the queue holds an item beyond its media length, in case the overlay's end report never arrives. */
export const QUEUE_CEILING_SLACK_MS = 5_000;
/** Used wherever a file has no recorded duration. */
export const UNKNOWN_MEDIA_LENGTH_MS = 30_000;

/** The overlay refreshes this every 15 seconds while it is connected; it expires after 45. */
export const PRESENCE_REFRESH_MS = 15_000;
export const PRESENCE_TTL_SECONDS = 45;
export const presenceKey = (ownerId: string) => `reactive-reward:presence:${ownerId}`;

export interface StoredFileFacts {
  type: string;
  size_kb: number;
  duration_ms: number | null;
}

/**
 * Whether a stored file may play as `mediaType` (or, for `role: 'sound'`, as the sound next to an image).
 * Returns the reason it may not, or null when it is fine.
 */
export function mediaFileProblem(
  file: StoredFileFacts,
  mediaType: ReactionMediaType,
  role: 'media' | 'sound' = 'media'
): string | null {
  const label = role === 'sound' ? 'Sound' : mediaType === 'IMAGE' ? 'Image' : mediaType === 'AUDIO' ? 'Audio' : 'Video';
  if (mediaType === 'IMAGE') {
    if (!IMAGE_MIME_TYPES.includes(file.type)) return `${label} must be png, jpeg, gif, webp or avif`;
    if (file.size_kb > IMAGE_MAX_KB) return `${label} must be at most 2 MB`;
    return null;
  }
  if (mediaType === 'AUDIO') {
    if (!AUDIO_MIME_TYPES.includes(file.type)) return `${label} must be mp3, wav or ogg`;
    if (file.size_kb > AUDIO_MAX_KB) return `${label} must be at most 2 MB`;
    // A missing duration is tolerated: the queue then assumes the worst case and the overlay reports the real end
    if (file.duration_ms !== null && file.duration_ms > MAX_TIMED_MEDIA_DURATION_MS)
      return `${label} must be at most 30 seconds`;
    return null;
  }
  if (!VIDEO_MIME_TYPES.includes(file.type)) return `${label} must be mp4 or webm`;
  if (file.size_kb > VIDEO_MAX_KB) return `${label} must be at most 20 MB`;
  // Videos only enter through the upload that reads the duration, so a video without one is not trustworthy
  if (!file.duration_ms) return `${label} duration could not be read`;
  if (file.duration_ms > MAX_TIMED_MEDIA_DURATION_MS) return `${label} must be at most 30 seconds`;
  return null;
}

export interface PlaybackFacts {
  mediaType: ReactionMediaType;
  displayDurationMs: number;
  mediaDurationMs: number | null;
  hasSound: boolean;
  soundDurationMs: number | null;
}

/**
 * How long the item is meant to occupy the overlay. Images use their configured display time, an image with a
 * sound lasts until the longer of the two, audio and video last as long as the file. Unknown lengths count as 30 s.
 */
export function playbackLengthMs(facts: PlaybackFacts): number {
  if (facts.mediaType === 'IMAGE') {
    if (!facts.hasSound) return facts.displayDurationMs;
    return Math.max(facts.displayDurationMs, facts.soundDurationMs ?? UNKNOWN_MEDIA_LENGTH_MS);
  }
  return facts.mediaDurationMs ?? UNKNOWN_MEDIA_LENGTH_MS;
}

/** The queue ceiling: the item's length plus slack. The overlay's ack normally releases the queue sooner. */
export function queueCeilingMs(facts: PlaybackFacts): number {
  return playbackLengthMs(facts) + QUEUE_CEILING_SLACK_MS;
}
