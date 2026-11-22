import { z } from 'zod';
import { REACTION_MEDIA_TYPES, REACTION_POSITIONS } from './reactiveReward.logic';

export const reactionSchema = z
  .object({
    twitch_reward_id: z.string().trim().min(1).max(100),
    enabled: z.boolean().default(true),
    media_type: z.enum(REACTION_MEDIA_TYPES),
    /** UploadedFile.key of the image, audio or video to play. */
    media_key: z.string().min(1),
    /** UploadedFile.key of a sound played together with an IMAGE. */
    sound_key: z.string().min(1).nullable().optional(),
    volume: z.number().int().min(0).max(100).default(80),
    display_duration_ms: z.number().int().min(1000).max(30_000).default(5000),
    position: z.enum(REACTION_POSITIONS).default('CENTER'),
    size_percent: z.number().int().min(10).max(100).default(50),
  })
  .refine((reaction) => reaction.media_type === 'IMAGE' || !reaction.sound_key, {
    message: 'Only an image can have a separate sound',
    path: ['sound_key'],
  });

export type ReactionInput = z.infer<typeof reactionSchema>;
