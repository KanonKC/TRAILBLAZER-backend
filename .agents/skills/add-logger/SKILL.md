---
name: add-logger
description: Adds TLogger structured logging to a controller, service, or repository file in blaze-backend. Use when user asks to add logging, add TLogger, instrument a file with logs, or replace console.log.
---

# Add Logger

## Quick start

```typescript
import TLogger, { Layer } from "@/logging/logger";

const logger = new TLogger(Layer.SERVICE); // CONTROLLER | SERVICE | REPOSITORY | EVENT | PROVIDER

async myMethod(transactionId: string) {
    // setContext is immutable: it returns a NEW TLogger, it never mutates
    // `this.logger`. Always capture the return value locally and use that
    // local variable for the rest of the method.
    const scoped = logger.setContext("domain.feature.action", transactionId);
    scoped.info({ message: "Success", data: result });
}
```

## Workflow

- [ ] 1. **Import** — add `import TLogger, { Layer } from "@/logging/logger";` at the top
- [ ] 2. **Determine layer** — pick the correct `Layer` enum for the file's architectural role:
  - `Layer.CONTROLLER` — Fastify request handlers
  - `Layer.SERVICE` — business logic classes
  - `Layer.REPOSITORY` — Prisma query classes (error-only logging — see below)
  - `Layer.EVENT` — Twitch EventSub webhook handlers
  - `Layer.PROVIDER` — 3rd-party API client wrappers
- [ ] 3. **Instantiate** — create `const logger = new TLogger(Layer.YOUR_LAYER);` at class/module level
- [ ] 4. **Set context (immutable)** — first line of every method: `const logger = this.logger.setContext("domain.feature.action", transactionId);` (e.g. `user.auth.login`). Use the returned local variable for every log call in that method — never log through the original field afterward.
- [ ] 5. **Thread transactionId** — pass `transactionId` explicitly from controller (sourced from Fastify's `req.id`, a UUID via `genReqId`) down through service -> repository, including into fire-and-forget calls. Do not rely on AsyncLocalStorage.
- [ ] 6. **Add log statements** — replace `console.log` or add new logs:
  - `logger.info({ message: "...", data: { ... } })` — successful ops / general flow
  - `logger.warn({ message: "...", data: { ... }, error: "..." })` — expected issues / validation
  - `logger.error({ message: "...", error: err })` — exceptions / critical failures
  - Repository layer: log ONLY in the `catch` branch when a DB operation throws — not on every successful query
  - Service layer: log immediately before/after every external provider call (with `duration_ms`), and on every return path
- [ ] 7. **Verify** — `TLogger` and `Layer` imported, `setContext`'s return value captured and used (not the original field), `LogMeta` structure followed, no secrets/PII logged

## Notes

- Never use `console.log` — always use `TLogger`
- `setContext` must be the **first** line in any method scope that logs, and its return value must be captured locally (immutable pattern)
- Context string format: `domain.feature.action` (e.g. `widget.clipShoutout.create`)
- Logs are forwarded to Better Stack (logtail.com); New Relic stays for APM/monitoring only
- Never log passwords, API keys, tokens, full card numbers, or raw payment/QR payloads; mask PII (phone/email) unless there's a genuine audit need
