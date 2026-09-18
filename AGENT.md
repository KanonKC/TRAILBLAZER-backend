# Trailblazer Backend - Agent Instructions

Welcome to the `trailblazer-backend` project! This file serves as the core instruction manual for any AI agent interacting with this repository. Please follow these guidelines, coding standards, and project-specific rules for all interactions, feature implementations, and refactoring tasks.

## 🚀 Tech Stack
- **Framework**: Fastify (Node.js)
- **Language**: TypeScript
- **Database & ORM**: PostgreSQL with Prisma (`@prisma/client`, `@prisma/adapter-pg`)
- **Key External Services/Libraries**: 
  - Redis (`redis`) for caching/sessions.
  - AWS S3 (`@aws-sdk/client-s3`) for file storage.
  - Twitch API (`@twurple/api`, `@twurple/auth`) for Twitch integrations.
  - Zod (`zod`) for schema validation.
  - New Relic (`newrelic`) for monitoring and APM (APM only — log forwarding moved to Better Stack).
  - Better Stack (`@logtail/node`, `@logtail/winston`) for structured log forwarding.
  - Winston (`winston`) for structured logging.

## 🏗️ Architecture & Structure
This project follows a layered architecture (Controller -> Service -> Repository / Integration / Library) to maintain separation of concerns.

### Project Directory Layout
```text
.agent/             # AI Agent rules & workflows
prisma/             # Database ORM models and migrations
src/
├── config/         # System configuration & environment variables
├── controllers/    # Express/Fastify route handlers & Zod validation
├── errors/         # Custom application error definitions (TError)
├── events/         # Websocket/SSE event emitters
├── libs/           # External service wrappers (Prisma, Redis, AWS, Twitch)
├── logging/        # Structured logging definition (TLogger)
├── providers/      # 3rd-party API integrations (e.g., Twitch GQL)
├── repositories/   # Database access layer (Prisma queries)
├── services/       # Core business logic and authorization checks
├── utils/          # General utility functions
├── index.ts        # Application entry point
└── routes.ts       # Central API route definitions
```

- **Controllers** (`src/controllers/`): Handle incoming requests, route parameters, payload validation (via Zod), and send responses. Should contain minimal business logic.
- **Services** (`src/services/`): Core business logic. Call repositories or external APIs and return data or standardized errors to the controllers.
- **Repositories** (`src/repositories/`): Data access layer interacting directly with the database via Prisma.

## 📜 Coding Conventions & Rules

### 1. Database & Prisma
- **Naming Conventions**: Use **snake_case** for all Prisma field names and database columns.
- Keep the `schema.prisma` file clean and well-documented.

### 2. Logging format (Strict Requirement)
All logging across the backend must use the project's structured logger instead of standard `console.log`.
- **Import**: `import TLogger, { Layer } from "@/logging/logger";`
- **Instantiation**: Instantiate exactly once per file/class, specifying the layer:
  ```typescript
  const logger = new TLogger(Layer.CONTROLLER); // Use CONTROLLER, SERVICE, REPOSITORY, EVENT, PROVIDER
  ```
- **Context Setting (immutable)**: `setContext()` never mutates `this` — it always returns a NEW `TLogger`. Always call it as the first line of an executing function and assign the result to a local variable, then use that local variable (not the class field) for the rest of the function:
  ```typescript
  const logger = this.logger.setContext("domain.feature.action", transactionId);
  ```
  This avoids a race condition where two concurrent requests sharing the same class instance would otherwise overwrite each other's `transaction_id`.
- **Transaction threading**: `transactionId` is sourced from Fastify's `req.id` (a UUID, via `genReqId` in `src/routes.ts`) at the controller and threaded explicitly as a parameter through service -> repository (and into fire-and-forget calls) rather than relying on AsyncLocalStorage.
- **Log Levels**:
  - `logger.info({ message: "...", data: ... })` - For successful flows, key events, state changes.
  - `logger.warn({ message: "...", data: ..., error: "..." })` - For expected failures, validation errors, or missing safe data.
  - `logger.error({ message: "...", data: ..., error: err })` - For unhandled exceptions or critical application failures.

### 3. Error Handling
- Use the project's standard `TError` subclass system (defined in the application structure) for handled throws from the service layer, preventing raw generic errors leaking to the controllers.
- Perform explicit authorization/ownership checks (`authorize` methods) inside services rather than relying solely on the UI or middleware.

### 4. Code Quality & Formatting
- Ensure strict TypeScript typing. Avoid `any` where `unknown` or a specific generic/Zod-inferred type can be used.
- Import paths should preferentially utilize aliases if configured (e.g., `@/`).
- Adhere to the established Prettier and ESLint formats (checked via `.prettierrc`).

## 🛠️ Workflows
There are specific `.md` workflows located in the `.agent/workflows` directory for executing regular developer tasks (e.g., `/create-new-widget-api`, `/add-logger`). Consult these workflows if asked to implement a feature they cover to ensure consistency with the established patterns.

---
**Agent Directive:** When addressing tasks in `trailblazer-backend`, ALWAYS review this `AGENT.md` and related `.agent/rules/**/*` first. Ensure your code strictly adheres to these rules, specifically the *structured logging* rules and *Prisma naming* rules.
