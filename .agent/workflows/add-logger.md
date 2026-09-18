---
description: Add structured logging to a file
---

This workflow guides you through adding structured logging to a file in the `blaze-backend` project, following the standards defined in `logging-format.md`.

1. **Import the Logger**
   - Add the following import statement at the top of the file:
     ```typescript
     import TLogger, { Layer } from "@/logging/logger";
     ```

2. **Determine the Layer**
   - Identify the architectural layer of the file (e.g., Controller, Service, Repository).
   - Use the appropriate `Layer` enum value (e.g., `Layer.CONTROLLER`, `Layer.SERVICE`).

3. **Instantiate the Logger**
   - Create a `logger` instance at the class or module level:
     ```typescript
     const logger = new TLogger(Layer.YOUR_LAYER_HERE);
     ```

4. **Set Context in Methods (immutable — capture the return value)**
   - `setContext()` never mutates the logger instance it's called on; it always returns a NEW `TLogger`. At the beginning of each method, capture that return value in a local variable and use the local variable for every subsequent log call in that method — never call log methods on the original field afterward:
     ```typescript
     const logger = this.logger.setContext("domain.feature.action", transactionId);
     ```
     - Replace `domain.feature.action` with a specific context string (e.g., `user.auth.login`).
     - `transactionId` is threaded explicitly as a parameter from controller -> service -> repository (including into fire-and-forget calls like async emails), sourced from Fastify's `req.id` at the controller (configured as a UUID via `genReqId` in `src/routes.ts`). Do not rely on AsyncLocalStorage.

5. **Add Log Statements**
   - Replace `console.log` or add new logs using `logger.info`, `logger.warn`, or `logger.error`.
   - **Info:** For successful operations and general flow.
     ```typescript
     logger.info({
         message: "Operation successful",
         data: result
     });
     ```
   - **Warn:** For expected issues or validation errors.
     ```typescript
     logger.warn({
         message: "Validation failed",
         data: input,
         error: "Invalid email format"
     });
     ```
   - **Error:** For exceptions and critical failures.
     ```typescript
     logger.error({
         message: "Operation failed",
         error: err
     });
     ```

6. **Verify Imports and Usage**
   - Ensure `TLogger` and `Layer` are correctly imported.
   - Verify that `setContext` is called before any log statements in a scope, and that its return value (not the original `this.logger` field) is used for the rest of the method.
   - Check that the `LogMeta` object structure is followed.
   - Repository layer: only log on the `catch` branch of a DB operation (error-only) — do not log on every successful query.
   - Never log passwords, API keys, tokens, full card numbers, or raw payment/QR payloads; mask PII unless there's a genuine audit need.

## Log destination

Structured logs are forwarded to Better Stack (logtail.com) via the winston
transport in `src/libs/winston.ts`, gated by `BETTERSTACK_SOURCE_TOKEN`. New
Relic remains for APM/monitoring only — it no longer forwards logs.

Make an implementation plan before proceed.