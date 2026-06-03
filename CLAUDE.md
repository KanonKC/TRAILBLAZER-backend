# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Trailblazer Backend** — a Fastify + TypeScript backend for a Twitch streamer overlay/widget platform. It manages user authentication (Twitch OAuth), widget configurations, real-time Twitch EventSub webhooks, and SSE event streaming to browser overlays.

## Commands

```bash
# Development
npm run dev            # Start with nodemon (no APM)
npm run dev:log        # Start with nodemon + New Relic APM

# Build & Run
npm run build          # Compile TypeScript (tsc + tsc-alias)
npm start              # Run compiled build with dotenv + New Relic

# Testing
npm test               # Run all tests
npm run test:coverage  # Run tests with coverage report

# Single test file
npx jest src/services/user/user.service.test.ts

# Database
npx prisma migrate dev     # Apply migrations
npx prisma generate        # Regenerate Prisma client after schema changes
npx prisma studio          # Open database GUI

# Twitch token generation
npm run generate:twitch-login       # Dev environment
npm run generate:twitch-login:prod  # Production
```

## Architecture

The app follows a strict **Controller → Service → Repository** layered architecture. All dependencies are manually instantiated and wired in [src/routes.ts](src/routes.ts) (no DI container). The entry point is [src/index.ts](src/index.ts) which starts Fastify on port 8080.

```
src/
├── config/         # Typed config loaded from env vars
├── controllers/    # Request handling, Zod validation, HTTP responses
├── services/       # Business logic, authorization checks, error throwing
├── repositories/   # Prisma database queries only
├── events/         # Twitch EventSub webhook handlers
├── libs/           # Singleton wrappers: Prisma, Redis, AWS S3, Twitch (twurple)
├── providers/      # External API clients: TwitchGQL, Sightengine
├── errors/         # TError subclass hierarchy (NotFoundError, ForbiddenError, etc.)
├── logging/        # TLogger structured logger with Layer enum
└── cron.ts         # Scheduled jobs
```

### Key Domain Concepts

- **Widget**: A streamer's overlay component (FirstWord, ClipShoutout, DropImage, RandomDbdPerk, ExportVideo). Each widget has an `overlay_key` for unauthenticated browser overlay access.
- **Tier system**: Users have a `tier` (0–N) controlling how many widgets and storage they get. Managed via `WidgetService.getQuota()`.
- **Referral system**: Users earn tier upgrades via referral codes. `UserService` and `ReferralService` have a circular dependency resolved via `setReferralService()` / `setWidgetService()` setter injection.
- **SSE events**: Browser overlays connect to `/api/v1/events/:widget/:userId` to receive real-time triggers from Twitch chat/redemptions.
- **Twitch EventSub**: Webhooks at `/webhook/v1/twitch/event-sub/*` receive Twitch events and fan out to the appropriate widget services.

## Coding Rules

### Logging (Strict)

Every controller, service, and repository file must use `TLogger`. Never use `console.log`.

```typescript
import TLogger, { Layer } from "@/logging/logger";

const logger = new TLogger(Layer.SERVICE); // CONTROLLER | SERVICE | REPOSITORY

async myMethod() {
    logger.setContext("domain.feature.action"); // Always first line
    logger.info({ message: "...", data: { ... } });
    logger.warn({ message: "...", data: { ... }, error: "..." });
    logger.error({ message: "...", data: { ... }, error: err });
}
```

### Error Handling

Services throw typed errors — never return `null` or `false` to signal failure:

```typescript
import { NotFoundError, ForbiddenError, BadRequestError } from "@/errors";

throw new NotFoundError("Widget not found");
throw new ForbiddenError("You do not own this resource");
```

Controllers catch errors with the standard try/catch pattern handling `z.ZodError`, `TError`, and generic errors separately (see [.agent/rules/controller-error-handling.md](.agent/rules/controller-error-handling.md)).

### Authorization

Services must call a private `authorize(userId, resource)` method after fetching any owned resource in `get`, `update`, and `delete` operations. Skip only for creation, public data, or webhook system events.

### Database / Prisma

- All Prisma field names and DB columns use **snake_case**.
- The Prisma client is generated to `generated/prisma/` (not `node_modules`).
- Use `import prisma from "@/libs/prisma"` for the singleton client.

### TypeScript

- Use strict types; avoid `any` — prefer `unknown` or Zod-inferred types.
- Import aliases: use `@/` for `src/` (e.g., `@/services/user/user.service`).

## Agent Workflows

The `.agent/workflows/` directory contains step-by-step guides for common tasks:
- `create-new-widget-api.md` — Adding a new widget type end-to-end
- `add-logger.md` — Adding structured logging to an existing file
- `review-changes.md` — Code review checklist

Always consult these before implementing features they cover.

## Claude Skills

Project-specific skills are in `.claude/skills/` and can be invoked with `/` in Claude Code:

| Skill | Command | When to use |
|---|---|---|
| `create-new-widget-api` | `/create-new-widget-api` | Scaffolding a new widget type end-to-end (DB → repository → service → controller → routes) |
| `add-logger` | `/add-logger` | Adding `TLogger` structured logging to a newly created or updated service/controller |
| `review-changes` | `/review-changes` | Reviewing changed code compared to the develop branch before merging |
