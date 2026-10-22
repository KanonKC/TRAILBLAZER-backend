import RandomPoolUploadService from '@/services/randomPool/randomPoolUpload.service';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { TError, UnauthorizedError } from '@/errors';
import { getUserFromRequest } from '@/controllers/middleware';
import RandomPoolService from '@/services/randomPool/randomPool.service';
import { configSchema, poolSchema } from '@/services/randomPool/request';
import { subscriber } from '@/libs/redis';
import { poolState } from '@/services/randomPool/randomPool.logic';
import TLogger, { Layer } from '@/logging/logger';

const identifier = z.string().uuid();
type Request = FastifyRequest<{ Params: { id: string }; Querystring: { key?: string } }>;
export default class RandomPoolController {
  private readonly logger = new TLogger(Layer.CONTROLLER);
  constructor(
    private readonly service: RandomPoolService,
    private readonly uploads: RandomPoolUploadService
  ) {}
  register(server: FastifyInstance) {
    const routes = [
      ['POST', '/uploads', 'beginUpload'],
      ['POST', '/uploads/:id/complete', 'completeUpload'],
      ['GET', '/pools', 'listPools'],
      ['POST', '/pools', 'savePool'],
      ['PUT', '/pools/:id', 'savePool'],
      ['DELETE', '/pools/:id', 'deletePool'],
      ['GET', '/configs', 'listConfigs'],
      ['GET', '/configs/:id', 'getConfig'],
      ['POST', '/configs', 'saveConfig'],
      ['PUT', '/configs/:id', 'saveConfig'],
      ['DELETE', '/configs/:id', 'deleteConfig'],
      ['PUT', '/configs/:id/enabled', 'enable'],
      ['GET', '/configs/:id/logs', 'logs'],
    ] as const;
    for (const [method, path, action] of routes)
      server.route({
        method,
        url: `/api/v1/random-pool${path}`,
        handler: (request, reply) => this.handle(action, request as Request, reply),
      });
    server.get('/api/v1/random-pool/overlay/:id', (request, reply) =>
      this.sse(request as Request, reply)
    );
    server.post('/api/v1/random-pool/overlay/:id/ack', (request, reply) =>
      this.ack(request as Request, reply)
    );
  }
  private async handle(action: string, request: Request, reply: FastifyReply) {
    const logger = this.logger.setContext(`controller.randomPool.${action}`, request.id);
    logger.info({ message: 'Random pool request', data: { method: request.method } });
    try {
      const user = getUserFromRequest(request);
      if (!user) throw new UnauthorizedError();
      const id = request.params.id ? identifier.parse(request.params.id) : undefined;
      let result: unknown;
      switch (action) {
        case 'beginUpload':
          result = await this.uploads.begin(user.id, request.body, request.id);
          break;
        case 'completeUpload':
          result = await this.uploads.complete(user.id, id!, request.id);
          break;
        case 'listPools':
          result = await this.service.listPools(user.id, request.id);
          break;
        case 'savePool':
          result = await this.service.savePool(
            user.id,
            poolSchema.parse(request.body),
            id,
            request.id
          );
          break;
        case 'deletePool':
          result = await this.service.deletePool(user.id, id!, request.id);
          break;
        case 'listConfigs':
          result = await this.service.listConfigs(user.id, request.id);
          break;
        case 'getConfig':
          result = await this.service.getConfig(user.id, id!, request.id);
          break;
        case 'saveConfig':
          result = await this.service.saveConfig(
            user.id,
            user.twitchId,
            configSchema.parse(request.body),
            id,
            request.id
          );
          break;
        case 'enable':
          result = await this.service.enable(
            user.id,
            id!,
            z.object({ enabled: z.boolean() }).parse(request.body).enabled,
            request.id
          );
          break;
        case 'deleteConfig':
          await this.service.deleteConfig(user.id, id!, request.id);
          result = { deleted: true };
          break;
        case 'logs':
          result = await this.service.logs(user.id, id!, request.id);
          break;
      }
      logger.info({
        message: 'Random pool request completed',
        data: { status: request.method === 'POST' ? 201 : 200 },
      });
      return reply.status(request.method === 'POST' ? 201 : 200).send(result);
    } catch (error) {
      return this.error(error, request, reply);
    }
  }
  private error(error: unknown, request: FastifyRequest, reply: FastifyReply) {
    const logger = this.logger.setContext('controller.randomPool.error', request.id);
    const prismaCode =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
    const status =
      error instanceof z.ZodError
        ? 400
        : error instanceof TError
          ? error.status
          : prismaCode === 'P2002'
            ? 409
            : 500;
    logger.error({
      message: 'Random pool request failed',
      data: { status },
      error: error as Error,
    });
    return reply
      .status(status)
      .send({
        message:
          error instanceof z.ZodError
            ? error.issues.map((issue) => issue.message).join('; ')
            : error instanceof TError
              ? error.message
              : prismaCode === 'P2002'
                ? 'Reward is already bound'
                : 'Internal Server Error',
      });
  }
  private async ack(request: Request, reply: FastifyReply) {
    const logger = this.logger.setContext('controller.randomPool.ack', request.id);
    try {
      await this.service.ack(
        identifier.parse(request.params.id),
        request.query.key || '',
        z.object({ jobId: z.string().uuid() }).parse(request.body).jobId,
        request.id
      );
      logger.info({ message: 'Random pool ACK completed' });
      return reply.status(204).send();
    } catch (error) {
      return this.error(error, request, reply);
    }
  }
  private async sse(request: Request, reply: FastifyReply) {
    const logger = this.logger.setContext('controller.randomPool.sse', request.id);
    let heartbeat: NodeJS.Timeout | undefined;
    const connection = subscriber.duplicate();
    const cleanup = () => {
      if (heartbeat) clearInterval(heartbeat);
      if (connection.isOpen) void connection.quit().catch(() => undefined);
    };
    request.raw.on('close', cleanup);
    try {
      const id = identifier.parse(request.params.id);
      const config = await this.service.overlay(id, request.query.key || '', request.id);
      await connection.connect();
      await connection.subscribe(
        ['random-pool:result', 'random-pool:state'],
        (message, channel) => {
          const payload = JSON.parse(message);
          if (payload.config_id === id)
            reply.sse({
              event: channel === 'random-pool:state' ? 'pool-state' : 'pool-result',
              data: message,
            });
        }
      );
      reply.sse({
        event: 'pool-state',
        data: JSON.stringify({
          config_id: id,
          pool_state: poolState(config.pool),
          enabled: config.widget.enabled,
        }),
      });
      heartbeat = setInterval(() => reply.sse({ event: 'heartbeat', data: '{}' }), 15000);
      logger.info({ message: 'Random pool SSE connected', data: { configId: id } });
    } catch (error) {
      cleanup();
      return this.error(error, request, reply);
    }
  }
}
