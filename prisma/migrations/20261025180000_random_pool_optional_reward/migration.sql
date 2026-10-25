-- A config is created when the widget is enabled, before the streamer has picked a channel reward.
ALTER TABLE "RandomPoolConfig" ALTER COLUMN "twitch_reward_id" DROP NOT NULL;
