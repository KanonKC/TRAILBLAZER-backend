# Random Pool: implementation and verification

Source: https://app.notion.com/p/3fe959b0772481359e07d333ab08ae6f
Date: 2026-10-22

Implemented locally: all 10 backend/frontend implementation tasks and the functionality in Phase 1/2 stories that were not Backlog. The design task was already Done. Tasks remain In progress until their merge/deployment/OBS completion gates are met.

## Coverage

| Notion task | Implementation |
| --- | --- |
| BE pool/item CRUD (3fe959b077248156af46d4d12d2394ce) | Owner checks, private visibility, 3 Free / 10 active Pro pools, 50 items, stable item IDs, item validation, soft delete, affected-config count, presigned image upload |
| BE config CRUD (3fe959b0772481d0bd5ef6a791f93cad) | Multiple instances, unique tokens/rewards, channel reward validation, disabled creation, shared Widget Point accounting, EventSub mapping |
| BE invalid pool state (3fe959b077248137b262d8ac3ea42d7c) | READY/EMPTY/DELETED/HIDDEN responses and SSE state updates; skip unusable queued draws and chat |
| BE draw/queue/SSE/chat (3fe959b077248106801ef0d860d245b3) | Server draw, immutable snapshots, Redis queue per config, redemption dedupe, token-authenticated SSE/ACK, chat after ACK, audit log |
| BE weighted/messages/audio (3fe959b07724815bbedec043dbd70efd) | Positive finite weights, default 1 for new items, mode/visualization validation, item/default fallback, variables and 500-character output limit, file ownership/size/audio-duration checks |
| FE pool pages (3fe959b077248152b4b1fd09c23caddc) | List/create/edit routes, usage limit, cover/items editor, upload preview, deletion confirmation, Public disabled |
| FE config pages (3fe959b077248130b45de04e5d49a639) | Config list/create/edit, reward selection, inline shared Pool editor, enable/disable, OBS URL, quota errors, Import disabled |
| FE weighted/messages/audio (3fe959b07724819a9e79cf94619d47d0) | Mode-compatible animation selection, per-item weight/message/audio, default message/audio, upload and preview |
| FE Shuffle overlay (3fe959b0772481299a92c9b735e688fd) | Separate token URL per config, reconnecting SSE, backend result, image/name fallback, completion ACK, transparent page |
| FE Slide/Wheel overlay (3fe959b0772481fe877fe309e68a4b74) | Decelerating horizontal strip, proportional weighted SVG sectors, exact winner landing, spin/result audio, autoplay recovery control |

Public pools, browse/import/duplicate, moderation and Sightengine remain in Backlog. Public and Import are disabled with Coming soon labels.

## Implementation notes

- Entry: `/dashboard/widgets/random-pool`; pool routes `/pools/new`, `/pools/[id]`; config routes `/configs/new`, `/configs/[id]` under that entry.
- OBS: `/overlays/random-pool/[configId]?key=...`. Treat this URL as a credential.
- Backend: `src/controllers/randomPool`, `src/services/randomPool`, `src/repositories/randomPool`.
- API base: `/api/v1/random-pool`. Pool CRUD is `/pools[/:id]`, with item operations included in the pool payload. Config CRUD is `/configs[/:id]`; enable is `PUT /configs/:id/enabled`; recent audit history is `GET /configs/:id/logs` (latest 100).
- SSE: `GET /overlay/:id?key=...`; completion: `POST /overlay/:id/ack?key=...` with `{jobId}`.
- Upload: `POST /uploads` returns a five-minute presigned PUT URL; `POST /uploads/:token/complete` checks the uploaded bytes and audio metadata, then registers the file through the existing UploadedFile pipeline. The final asset gets a fresh key so an unexpired temporary upload URL cannot overwrite it.
- `Widget.instance_key` extends the existing owner/type and channel/type unique keys. Existing widget repositories use the empty singleton key; Random Pool generates a separate key for every config. Every config therefore participates in existing quota reports and downgrade handling.
- Shared widget enables use a user-row lock and transaction for quota calculation. The generic widget update endpoint also routes enable changes through that quota check.
- A newly created config starts disabled and does not require available Widget Points.
- Draws are logged when accepted into the queue, even if no overlay is connected. ACK completion is claimed once with Redis GETDEL before chat is sent. A 25-second fallback releases a queue if an overlay disappears; no result chat is sent without ACK.
- Overlay callbacks validate current config, enabled state and pool state again before displaying/sending chat. Snapshots preserve the original winning item.
- Media is resolved to signed URLs at dispatch, so queued jobs do not carry expiring URLs.
- Generic widget gallery links Random Pool to its config manager instead of presenting a single master switch. Overlay pages hide the site footer.

## Verification

- Backend production build passed.
- Jest: **382 tests passed across 17 suites**, including validation, ownership, file limits, mode combinations, weighted boundaries, message fallback/truncation, unavailable pools, and concurrent duplicate ACKs.
- All 69 migrations, including `20261022050000_random_pool`, applied successfully to a fresh disposable PostgreSQL 16 database.
- `scripts/test-random-pool.ts` passed with real local PostgreSQL, Redis 7 and MinIO: concurrent pool limits, concurrent widget quota, config/item CRUD and cascade deletion, SSE, draw snapshots, redemption dedupe, duplicate ACK, chat ordering, spin logs, presigned image/audio uploads, upload replay rejection, oversized file rejection, and actual 16-second WAV rejection. Twitch reward listing, EventSub provisioning and outgoing chat are test doubles; no messages are sent to a real channel.
- Frontend production build and lint of all changed/new frontend files passed.
- Browser checks: config editor at 390px, lists/editor at 768px and 1440px; no horizontal document overflow. Verified config save, mode/animation correction, private/coming-soon states, Pool item upload with preview and save via presigned PUT, weighted wheel and slide rendering, and transparent overlay backgrounds.
- Browser evidence: `TRAILBLAZER-frontend/docs/random-pool/dashboard.png` (synthetic local test data).

To rerun integration checks, supply **disposable loopback** `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_NAME`, and a test `JWT_SECRET`, with `BETTERSTACK_SOURCE_TOKEN` empty and `NEW_RELIC_ENABLED=false`. Apply migrations to the disposable database, then run:

```sh
RANDOM_POOL_TEST=1 npx ts-node -r tsconfig-paths/register scripts/test-random-pool.ts
```

`RANDOM_POOL_TEST_SERVE=1` optionally leaves the isolated harness running for browser checks. It has synthetic authentication and must never run in production.

## Rollout and remaining completion gates

1. Review and merge the backend and frontend changes. Generate the Prisma client during the backend build (already done by its Dockerfile).
2. Apply `prisma migrate deploy` to the target environment, then deploy both applications. The migration creates the Random Pool WidgetType; a separate full seed is unnecessary.
3. Ensure the existing S3 bucket permits browser PUT from the frontend origin. Configure expiration for abandoned `users/*/pending/*` temporary uploads; successful/failed completion already removes the temporary object.
4. Verify real Twitch reward access, EventSub redemption delivery and chat with a test channel.
5. Test Shuffle/Slide/Wheel, sound autoplay, reconnect and queue order in a real OBS Browser Source. This session verified a browser, not OBS.
6. Exact comparison against the external Claude Design artifact remains unverified: its link was unavailable through the retrieval tool. The implementation uses the repository's shadcn components and local design tokens; the Notion design task remains Done.

No production migration, deployment, merge or real Twitch chat was performed.
