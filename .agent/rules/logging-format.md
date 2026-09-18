---
trigger: always_on
---

# Logging Rules

When implementing logging in the `trailblazer-backend` project, you must follow the structured logging format using the `TLogger` wrapper. This ensures consistency and makes logs easier to search and filter in Better Stack (logtail.com), which is where structured logs are forwarded. New Relic remains in place for APM/monitoring only.

## Import
Always import the logger wrapper and Layer enum from the project's logging module:
```typescript
import TLogger, { Layer } from "@/logging/logger";
```

## Instantiation
Instantiate the logger once per file (typically a class or module), specifying the architectural layer:
```typescript
const logger = new TLogger(Layer.CONTROLLER); // or SERVICE, REPOSITORY, etc.
```

## Structure
All log calls use a single object argument implementing the `LogMeta` interface. You must always use `setContext` at the first line of every function to set the context for subsequent log calls in that scope.

**`setContext()` is immutable.** It never mutates the `TLogger` instance it is called on — it always returns a brand NEW `TLogger`. A `TLogger` field like `this.logger` is created once per class and that class instance is reused across concurrent requests, so mutating `this.context` / `this.transactionId` in place would let concurrent requests cross-contaminate each other's `transaction_id`. Always capture the return value in a local variable and use that local variable — never call log methods on the original field after `setContext()`.

```typescript
interface LogMeta {
    message: string;
    data?: any;       // Relevant data context
    error?: Error | string; // Error object or message
    user?: User;      // Optional user object
}

// Usage — transactionId comes from req.id at the controller and is threaded
// explicitly down through service -> repository calls.
const logger = this.logger.setContext("domain.feature.action", transactionId);
logger.<level>({ 
    message: "Log message", 
    ... 
});
```

- **layer**: Automatically handled by the `TLogger` instance.
- **transaction_id**: Populated from the `transactionId` passed into `setContext()`. Every log line for a single request shares the same `transaction_id`, sourced from Fastify's `req.id` (configured as a UUID via `genReqId` in `src/routes.ts`).

## Layer responsibilities
- **Controller**: log entry (method/path) and exit (status code + duration) for every return path (400/404/500/200/etc).
- **Service**: log immediately before and after every call to an external provider/integration (each with its own `duration_ms`), and log on every return path (success and failure).
- **Repository**: log ONLY when a DB operation throws — not on every successful query.
- **Provider**: normally no separate logging if the calling service already logs before/after; only add provider-level logging when that provider is called from multiple services and raw-error visibility there adds value.

Never log passwords, API keys, tokens, full card numbers, or raw payment/QR payloads. Mask PII (phone/email) unless there's a genuine audit-trail need.

## Usage Examples

### Info
Use `logger.info` for successful operations, key events, and general information flow.

**Format:**
```typescript
const logger = this.logger.setContext("domain.feature.action", transactionId);
logger.info({ 
    message: "Message describing the event", 
    data: variableOkToLog 
});
```

**Example:**
```typescript
const logger = this.logger.setContext("controller.user.login", transactionId);
logger.info({ 
    message: "Login successful", 
    data: user 
});
```

### Warn
Use `logger.warn` for expected implementation issues, validation errors, or missing data that doesn't crash the app but should be noted.

**Format:**
```typescript
const logger = this.logger.setContext("domain.feature.action", transactionId);
logger.warn({ 
    message: "Warning message", 
    data: inputData, 
    error: errorMessageOrObject 
});
```

**Example:**
```typescript
const logger = this.logger.setContext("controller.user.login", transactionId);
logger.warn({ 
    message: "Validation error", 
    data: req.query, 
    error: err.message 
});
```

### Error
Use `logger.error` for exceptions, unexpected failures, and critical issues.

**Format:**
```typescript
const logger = this.logger.setContext("domain.feature.action", transactionId);
logger.error({ 
    message: "Error message", 
    error: errorObject 
});
```

**Example:**
```typescript
const logger = this.logger.setContext("controller.user.login", transactionId);
logger.error({ 
    message: "Login failed", 
    data: req.query, 
    error: err 
});
```
