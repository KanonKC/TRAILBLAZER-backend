# Create New Widget API — Code Examples

## Repository example

```typescript
import { prisma } from "@/libs/prisma";
import { MyNewWidget } from "generated/prisma/client";
import { CreateMyNewWidget, UpdateMyNewWidget } from "./request";

export default class MyNewWidgetRepository {
    async create(data: CreateMyNewWidget): Promise<MyNewWidget> {
        return prisma.myNewWidget.create({ data });
    }
    async get(id: string): Promise<MyNewWidget | null> {
        return prisma.myNewWidget.findUnique({ where: { id } });
    }
    async update(id: string, data: UpdateMyNewWidget): Promise<MyNewWidget> {
        return prisma.myNewWidget.update({ where: { id }, data });
    }
    async delete(id: string): Promise<void> {
        await prisma.myNewWidget.delete({ where: { id } });
    }
}
```

## Service example

```typescript
import Configurations from "@/config/index";
import MyNewWidgetRepository from "@/repositories/[widgetName]/[widgetName].repository";
import TLogger, { Layer } from "@/logging/logger";

export default class MyNewWidgetService {
    private readonly logger = new TLogger(Layer.SERVICE);

    constructor(
        private readonly config: Configurations,
        private readonly repository: MyNewWidgetRepository
    ) {}

    async create(data: any) {
        this.logger.setContext("service.myNewWidget.create");
        return this.repository.create(data);
    }
}
```

## Controller example

```typescript
import { FastifyReply, FastifyRequest } from "fastify";
import MyNewWidgetService from "@/services/[widgetName]/[widgetName].service";
import TLogger, { Layer } from "@/logging/logger";
import { createSchema } from "./schemas";

export default class MyNewWidgetController {
    private readonly logger = new TLogger(Layer.CONTROLLER);

    constructor(private readonly service: MyNewWidgetService) {}

    async create(req: FastifyRequest, res: FastifyReply) {
        this.logger.setContext("controller.myNewWidget.create");
        try {
            const body = createSchema.parse(req.body);
            const result = await this.service.create(body);
            res.status(201).send(result);
        } catch (error) {
            this.logger.error({ message: "Failed to create", error });
            res.status(500).send({ message: "Internal Server Error" });
        }
    }
}
```

## Route registration example

```typescript
// src/routes.ts
import MyNewWidgetRepository from "@/repositories/myNewWidget/myNewWidget.repository";
import MyNewWidgetService from "@/services/myNewWidget/myNewWidget.service";
import MyNewWidgetController from "@/controllers/myNewWidget/myNewWidget.controller";

const myNewWidgetRepository = new MyNewWidgetRepository();
const myNewWidgetService = new MyNewWidgetService(config, myNewWidgetRepository);
const myNewWidgetController = new MyNewWidgetController(myNewWidgetService);

server.post("/api/v1/my-new-widget", myNewWidgetController.create.bind(myNewWidgetController));
server.get("/api/v1/my-new-widget/:id", myNewWidgetController.get.bind(myNewWidgetController));
server.put("/api/v1/my-new-widget/:id", myNewWidgetController.update.bind(myNewWidgetController));
server.delete("/api/v1/my-new-widget/:id", myNewWidgetController.delete.bind(myNewWidgetController));
```
