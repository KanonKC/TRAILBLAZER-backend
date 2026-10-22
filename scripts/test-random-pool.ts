/** Run only against isolated test services; see docs/random-pool-implementation.md. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import sse from 'fastify-sse-v2';
import { prisma } from '../src/libs/prisma';
import redis, { connectRedis, publisher, subscriber } from '../src/libs/redis';
import RandomPoolRepository from '../src/repositories/randomPool/randomPool.repository';
import WidgetRepository from '../src/repositories/widget/widget.repository';
import UserRepository from '../src/repositories/user/user.repository';
import WidgetService from '../src/services/widget/widget.service';
import UserService from '../src/services/user/user.service';
import TwitchService from '../src/services/twitch/twitch';
import OverlayQueueService from '../src/services/overlayQueue/overlayQueue.service';
import RandomPoolService from '../src/services/randomPool/randomPool.service';
import RandomPoolController from '../src/controllers/randomPool/randomPool.controller';
import RandomPoolUploadService from '../src/services/randomPool/randomPoolUpload.service';
import { UploadedFileService } from '../src/services/uploadedFile/uploadedFile.service';
import { UploadedFileRepository } from '../src/repositories/uploadedFile/uploadedFile.repository';
import EventSubReconcilerService from '../src/services/twitch/eventSubReconciler/eventSubReconciler.service';
import { twitchAppAPI } from '../src/libs/twurple';
import { signAccessToken } from '../src/libs/jwt';
import config from '../src/config';
import { TwitchChannelRedemptionAddEventRequest } from '../src/events/twitch/channelRedemptionAdd/request';

async function main() {
  assert(process.env.RANDOM_POOL_TEST === '1', 'RANDOM_POOL_TEST=1 is required');
  assert(
    new URL(process.env.DATABASE_URL!).hostname === '127.0.0.1',
    'Test database must be local'
  );
  assert(new URL(process.env.REDIS_URL!).hostname === '127.0.0.1', 'Test Redis must be local');
  assert(new URL(process.env.S3_ENDPOINT!).hostname === '127.0.0.1', 'Test S3 must be local');
  await connectRedis();
  const owner = await prisma.user.create({
    data: {
      twitch_id: `test-${randomUUID()}`,
      username: 'random-pool-test',
      display_name: 'Random Pool Test',
    },
  });
  const user = {
    id: owner.id,
    twitchId: owner.twitch_id,
    username: owner.username,
    displayName: owner.display_name,
    avatarUrl: null,
    tier: 0,
    extraWidgetQuota: 0,
  };
  const token = signAccessToken(user);
  const repository = new RandomPoolRepository();
  const widgetRepository = new WidgetRepository();
  const userService = {
    get: async () => ({ ...owner, tier: 0 }),
    getMaxStorageMB: async () => 100,
  } as unknown as UserService;
  const widgets = new WidgetService(widgetRepository, userService, new UserRepository());
  const queue = new OverlayQueueService();
  queue.setWidgetService(widgets);
  const twitch = {
    listChannelRewards: async () => ({
      data: Array.from({ length: 10 }, (_, index) => ({
        id: `reward-${owner.id}-${index}`,
        title: `Reward ${index}`,
        cost: 100,
      })),
    }),
  } as unknown as TwitchService;
  EventSubReconcilerService.ensureEventSubs = async () => [];
  const messages: string[] = [];
  twitchAppAPI.chat.sendChatMessageAsApp = async (_sender, _channel, message) => {
    messages.push(message);
    return {} as Awaited<ReturnType<typeof twitchAppAPI.chat.sendChatMessageAsApp>>;
  };
  const service = new RandomPoolService(repository, widgets, queue, twitch);
  const uploads = new UploadedFileService(config, new UploadedFileRepository(), userService);
  const app = Fastify();
  await app.register(cookie);
  await app.register(sse);
  let allowTestUi = false;
  let activeId = '';
  app.addHook('onRequest', async (request) => {
    if (allowTestUi && !request.headers.authorization && !request.cookies.accessToken)
      request.headers.authorization = `Bearer ${token}`;
  });
  app.post('/test-spin/:visualization', async (request) => {
    const visualization = (request.params as { visualization: string }).visualization;
    const current = await repository.config(activeId);
    if (!current) return;
    await repository.saveConfig(
      owner.id,
      owner.twitch_id,
      {
        name: current.name,
        pool_id: current.pool_id,
        twitch_reward_id: current.twitch_reward_id,
        visualization: visualization as 'WHEEL',
        mode: visualization === 'WHEEL' ? 'WEIGHTED' : 'UNIFORM',
        default_chat_message: '{user}: {item}',
        items: [],
      },
      activeId
    );
    await service.redeem({
      id: randomUUID(),
      reward: { id: current.twitch_reward_id },
      broadcaster_user_id: owner.twitch_id,
      user_name: 'Browser Test',
    } as TwitchChannelRedemptionAddEventRequest);
    return { queued: true };
  });
  new RandomPoolController(service, new RandomPoolUploadService(uploads)).register(app);
  app.get('/api/v1/user/me', async () => user);
  app.get('/api/v1/twitch/channel-rewards', () => twitch.listChannelRewards(owner.twitch_id));
  app.get('/api/v1/uploaded-files', () => uploads.list(owner.id, {}, { page: 1, limit: 100 }));
  app.get('/api/v1/widget-types', async () => ({ data: await prisma.widgetType.findMany() }));
  app.get('/test-login', async (_request, reply) =>
    reply
      .setCookie('accessToken', token, { path: '/', httpOnly: true })
      .redirect('http://127.0.0.1:3311/dashboard/widgets/random-pool')
  );
  const request = async (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    payload?: object,
    authenticated = true
  ) => {
    const response = await app.inject({
      method,
      url: `/api/v1/random-pool${path}`,
      payload,
      headers: authenticated ? { authorization: `Bearer ${token}` } : {},
    });
    return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
  };
  assert.equal((await request('GET', '/pools', undefined, false)).status, 401);
  assert.equal(
    (await request('POST', '/pools', { name: 'Public', visibility: 'PUBLIC', items: [] })).status,
    400
  );
  const poolResponse = await request('POST', '/pools', {
    name: 'Test Prizes',
    items: [{ name: 'Gold' }, { name: 'Silver' }, { name: 'Bronze' }],
  });
  assert.equal(poolResponse.status, 201);
  const pool = poolResponse.body;
  const settings = {
    name: 'Prize Draw',
    pool_id: pool.id,
    twitch_reward_id: `reward-${owner.id}-0`,
    mode: 'WEIGHTED',
    visualization: 'WHEEL',
    default_chat_message: '{user}: {item}',
    items: [{ item_id: pool.items[0].id, weight: 8 }],
  };
  const first = await request('POST', '/configs', settings);
  assert.equal(first.status, 201);
  const second = await request('POST', '/configs', {
    ...settings,
    name: 'Second Draw',
    twitch_reward_id: `reward-${owner.id}-1`,
  });
  assert.equal(second.status, 201);
  assert.notEqual(first.body.widget.overlay_key, second.body.widget.overlay_key);
  assert.equal(first.body.widget.enabled, false);
  assert.equal((await request('POST', '/configs', settings)).status, 400);
  const enables = await Promise.all([
    request('PUT', `/configs/${first.body.id}/enabled`, { enabled: true }),
    request('PUT', `/configs/${second.body.id}/enabled`, { enabled: true }),
  ]);
  assert.equal(enables.filter((result) => result.status === 200).length, 1);
  assert.equal(await prisma.widget.count({ where: { owner_id: owner.id, enabled: true } }), 1);
  // Concurrent pool creation must not exceed the Free limit.
  const creates = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      request('POST', '/pools', { name: `Extra ${index}`, items: [] })
    )
  );
  assert.equal(creates.filter((result) => result.status === 201).length, 2);
  assert.equal((await request('GET', '/pools')).body.data.length, 3);
  // Deleting an item cascades config settings, while new items default to weight 1.
  await request('PUT', `/pools/${pool.id}`, {
    name: 'Test Prizes',
    items: [pool.items[1], pool.items[2], { name: 'New prize' }],
  });
  assert.equal(await prisma.randomPoolConfigItem.count({ where: { config_id: first.body.id } }), 0);
  assert.equal((await request('GET', `/configs/${first.body.id}`)).body.pool_state, 'READY');
  const active = (await repository.listConfigs(owner.id)).find((config) => config.widget.enabled)!;
  activeId = active.id;
  const event = {
    id: randomUUID(),
    reward: { id: active.twitch_reward_id },
    broadcaster_user_id: owner.twitch_id,
    user_name: 'Viewer',
  } as TwitchChannelRedemptionAddEventRequest;
  const serverAddress = await app.listen({ port: 0, host: '127.0.0.1' });
  const abort = new AbortController();
  const stream = await fetch(
    `${serverAddress}/api/v1/random-pool/overlay/${active.id}?key=${active.widget.overlay_key}`,
    { signal: abort.signal }
  );
  assert.equal(stream.status, 200);
  const reader = stream.body!.getReader();
  await reader.read();
  await service.redeem(event);
  let raw = '';
  while (!raw.includes('"jobId"')) {
    raw += new TextDecoder().decode((await reader.read()).value);
  }
  const payload = JSON.parse(
    raw
      .split('\n')
      .find((line) => line.startsWith('data:') && line.includes('"jobId"'))!
      .slice(5)
  );
  assert.equal(messages.length, 0);
  assert(payload.item.id);
  assert.equal(payload.config_id, active.id);
  assert.equal(
    (await request('POST', `/overlay/${active.id}/ack?key=wrong`, { jobId: payload.jobId })).status,
    401
  );
  const ackPath = `/overlay/${active.id}/ack?key=${active.widget.overlay_key}`;
  const acks = await Promise.all([
    request('POST', ackPath, { jobId: payload.jobId }),
    request('POST', ackPath, { jobId: payload.jobId }),
  ]);
  assert(acks.every((result) => result.status === 204));
  assert.equal(messages.length, 1);
  assert.equal(await prisma.randomPoolSpinLog.count({ where: { config_id: active.id } }), 1);
  await service.redeem(event); // Twitch retry is deduplicated.
  assert.equal(await prisma.randomPoolSpinLog.count({ where: { config_id: active.id } }), 1);
  abort.abort();
  // Verify presigned upload with actual MinIO and server-side metadata registration.
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
    forcePathStyle: true,
  });
  await s3.send(new CreateBucketCommand({ Bucket: process.env.S3_BUCKET_NAME! })).catch((error) => {
    if (error.name !== 'BucketAlreadyOwnedByYou') throw error;
  });
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FmcAAAAASUVORK5CYII=',
    'base64'
  );
  const presign = await request('POST', '/uploads', {
    name: 'pixel.png',
    type: 'image/png',
    kind: 'image',
    size: image.length,
  });
  assert.equal(presign.status, 201);
  assert.equal(
    (
      await fetch(presign.body.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: image,
      })
    ).status,
    200
  );
  const complete = await request('POST', `/uploads/${presign.body.token}/complete`);
  assert.equal(complete.status, 201);
  assert(complete.body.key);
  assert(complete.body.url);
  assert.equal((await request('POST', `/uploads/${presign.body.token}/complete`)).status, 404);
  assert.equal(
    (
      await request('PUT', `/pools/${pool.id}`, {
        name: 'Test Prizes',
        cover_key: complete.body.key,
        items: [
          { name: 'Gold', image_key: complete.body.key },
          { name: 'Silver' },
          { name: 'Bronze' },
        ],
      })
    ).status,
    200
  );
  const wav = (seconds: number) => {
    const buffer = Buffer.alloc(44 + seconds * 8000 * 2);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(buffer.length - 8, 4);
    buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(8000, 24);
    buffer.writeUInt32LE(16000, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(buffer.length - 44, 40);
    return buffer;
  };
  for (const seconds of [1, 16]) {
    const audio = wav(seconds);
    const pending = await request('POST', '/uploads', {
      name: `sound-${seconds}.wav`,
      type: 'audio/wav',
      kind: 'audio',
      size: audio.length,
    });
    assert.equal(pending.status, 201);
    assert.equal(
      (
        await fetch(pending.body.url, {
          method: 'PUT',
          headers: { 'Content-Type': 'audio/wav' },
          body: audio,
        })
      ).status,
      200
    );
    const result = await request('POST', `/uploads/${pending.body.token}/complete`);
    assert.equal(result.status, seconds === 1 ? 201 : 400);
  }
  assert.equal(
    (
      await request('POST', '/uploads', {
        name: 'large.png',
        type: 'image/png',
        kind: 'image',
        size: 2097153,
      })
    ).status,
    400
  );
  process.stdout.write(
    'PASS: real PostgreSQL limits/concurrent quota, config/item CRUD, Redis draw/SSE/dedupe/ACK/chat/log, MinIO presigned upload.\n'
  );
  // Keep fixtures for browser verification; UI requests receive a test-only session.
  if (process.env.RANDOM_POOL_TEST_SERVE === '1') {
    allowTestUi = true;
    const source = await request('GET', `/configs/${active.id}`);
    process.stdout.write(
      `TEST_SERVER=${serverAddress} OVERLAY=/overlays/random-pool/${active.id}?key=${source.body.widget.overlay_key}\n`
    );
    queue.start();
    return;
  }
  queue.stop();
  await app.close();
  await prisma.$disconnect();
  await Promise.all([redis.quit(), publisher.quit(), subscriber.quit()]);
  s3.destroy();
}
main().catch((error) => {
  process.stderr.write(String(error.stack || error) + '\n');
  process.exit(1);
});
