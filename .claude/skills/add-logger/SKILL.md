---
name: add-logger
description: Adds TLogger structured logging to a controller, service, or repository file in blaze-backend. Use when user asks to add logging, add TLogger, instrument a file with logs, or replace console.log.
---

# Add Logger

## Quick start

```typescript
import TLogger, { Layer } from "@/logging/logger";

const logger = new TLogger(Layer.SERVICE); // CONTROLLER | SERVICE | REPOSITORY

async myMethod() {
    logger.setContext("domain.feature.action");
    logger.info({ message: "Success", data: result });
}
```

## Workflow

- [ ] 1. **Import** — add `import TLogger, { Layer } from "@/logging/logger";` at the top
- [ ] 2. **Determine layer** — pick the correct `Layer` enum for the file's architectural role:
  - `Layer.CONTROLLER` — Fastify request handlers
  - `Layer.SERVICE` — business logic classes
  - `Layer.REPOSITORY` — Prisma query classes
- [ ] 3. **Instantiate** — create `const logger = new TLogger(Layer.YOUR_LAYER);` at class/module level
- [ ] 4. **Set context** — first line of every method: `logger.setContext("domain.feature.action")` (e.g. `user.auth.login`)
- [ ] 5. **Add log statements** — replace `console.log` or add new logs:
  - `logger.info({ message: "...", data: { ... } })` — successful ops / general flow
  - `logger.warn({ message: "...", data: { ... }, error: "..." })` — expected issues / validation
  - `logger.error({ message: "...", error: err })` — exceptions / critical failures
- [ ] 6. **Verify** — `TLogger` and `Layer` imported, `setContext` called before any log in scope, `LogMeta` structure followed

## Notes

- Never use `console.log` — always use `TLogger`
- `setContext` must be the **first** line in any method scope that logs
- Context string format: `domain.feature.action` (e.g. `widget.clipShoutout.create`)
