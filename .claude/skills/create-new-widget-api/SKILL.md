---
name: create-new-widget-api
description: Scaffolds a complete new widget API in blaze-backend across all layers: Prisma schema, repository, service, controller, and route registration. Use when user wants to add a new widget type, create a widget API, or scaffold a new widget end-to-end.
---

# Create New Widget API

## Quick start

Determine widget name (e.g. `MyNewWidget`) and required data fields, then follow the checklist below layer by layer.

## Workflow

### 1. Database — `prisma/schema.prisma`
- [ ] Add a new model with `id`, your fields, a `Widget` relation, `created_at`, `updated_at`
- [ ] Run `npx prisma generate`
- [ ] (Optional) Run `npx prisma migrate dev --name add_my_new_widget`

```prisma
model MyNewWidget {
  id         String   @id @default(cuid())
  setting_a  String
  widget     Widget   @relation(fields: [widget_id], references: [id], onDelete: Cascade)
  widget_id  String   @unique
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
}
```

### 2. Repository — `src/repositories/[widgetName]/`
- [ ] `request.ts` — interfaces for create/update input
- [ ] `response.ts` — interfaces for data returned to service
- [ ] `[widgetName].repository.ts` — class with `create`, `get`, `update`, `delete` using Prisma

### 3. Service — `src/services/[widgetName]/`
- [ ] `request.ts` — DTOs for service methods
- [ ] `[widgetName].service.ts` — class with business logic; inject `config` + repository via constructor; use `TLogger(Layer.SERVICE)`

### 4. Controller — `src/controllers/[widgetName]/`
- [ ] `schemas.ts` — Zod schemas for request validation
- [ ] `[widgetName].controller.ts` — Fastify handler class; inject service via constructor; use `TLogger(Layer.CONTROLLER)`; follow standard try/catch error pattern

### 5. Route registration — `src/routes.ts`
- [ ] Import Repository, Service, Controller
- [ ] Instantiate in order: repository → service → controller
- [ ] Register routes: `POST /api/v1/[widget]`, `GET`, `PUT`, `DELETE`

### 6. (Optional) Event handling
- [ ] Create `src/events/twitch/[eventName]/[eventName].event.ts` if widget reacts to Twitch events
- [ ] Register webhook route in `src/routes.ts`

## Notes

- Follow Controller → Service → Repository strictly — no skipping layers
- Services throw typed errors (`NotFoundError`, `ForbiddenError`) — never return `null`/`false`
- Services must call `authorize(userId, resource)` for `get`, `update`, `delete` operations
- All Prisma field names use **snake_case**
- See [REFERENCE.md](REFERENCE.md) for full code examples
