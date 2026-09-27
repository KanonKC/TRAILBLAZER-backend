---
trigger: always_on
---

# Logging Rules

When implementing logging in the `trailblazer-backend` project, you must follow the structured logging format using the `TLogger` wrapper. This ensures consistency and makes logs easier to search and filter in monitoring tools.

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

```typescript
interface LogMeta {
    message: string;
    context?: string; // e.g., "domain.feature.action"
    data?: any;       // Relevant data context
    error?: Error | string; // Error object or message
    user?: User;      // Optional user object
}

// Usage
logger.setContext("domain.feature.action");
logger.<level>({ 
    message: "Log message", 
    ... 
});
```

- **layer**: Automatically handled by the `TLogger` instance.

## Usage Examples

### Info
Use `logger.info` for successful operations, key events, and general information flow.

**Format:**
```typescript
logger.setContext("domain.feature.action");
logger.info({ 
    message: "Message describing the event", 
    data: variableOkToLog 
});
```

**Example:**
```typescript
logger.setContext("controller.user.login");
logger.info({ 
    message: "Login successful", 
    data: user 
});
```

### Warn
Use `logger.warn` for expected implementation issues, validation errors, or missing data that doesn't crash the app but should be noted.

**Format:**
```typescript
logger.setContext("domain.feature.action");
logger.warn({ 
    message: "Warning message", 
    data: inputData, 
    error: errorMessageOrObject 
});
```

**Example:**
```typescript
logger.setContext("controller.user.login");
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
logger.setContext("domain.feature.action");
logger.error({ 
    message: "Error message", 
    error: errorObject 
});
```

**Example:**
```typescript
logger.setContext("controller.user.login");
logger.error({ 
    message: "Login failed", 
    data: req.query, 
    error: err 
});
```
