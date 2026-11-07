import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { TError, UnauthorizedError } from '@/errors';
import { getUserFromRequest } from '@/controllers/middleware';
import ReactiveRewardService from '@/services/reactiveReward/reactiveReward.service';
import ReactiveRewardUploadService from '@/services/reactiveReward/reactiveRewardUpload.service';
import { reactionSchema } from '@/services/reactiveReward/request';
import TLogger, { Layer } from '@/logging/logger';
import ReactiveRewardEventController from './reactiveReward.event.controller';

const identifier = z.string().uuid();
type Request = FastifyRequest<{ Params: { id?: string } }>;

export default class ReactiveRewardController {
  private readonly logger = new TLogger(Layer.CONTROLLER);

  constructor(
    private readonly service: ReactiveRewardService,
    private readonly uploads: ReactiveRewardUploadService,
    private readonly eventController: ReactiveRewardEventController
  ) {}

  register(server: FastifyInstance) {
    const routes = [
      ['GET', '', 'get'],
      ['POST', '', 'enable'],
      ['DELETE', '', 'delete'],
      ['POST', '/refresh-key', 'refreshKey'],
      ['POST', '/reactions', 'saveReaction'],
      ['PUT', '/reactions/:id', 'saveReaction'],
      ['DELETE', '/reactions/:id', 'deleteReaction'],
      ['POST', '/reactions/:id/test', 'testReaction'],
      ['POST', '/uploads', 'beginUpload'],
      ['POST', '/uploads/:id/complete', 'completeUpload'],
    ] as const;
    for (const [method, path, action] of routes)
      server.route({
        method,
        url: `/api/v1/reactive-reward${path}`,
        handler: (request, reply) => this.handle(action, request as Request, reply),
      });
  }

  private async handle(action: string, request: Request, reply: FastifyReply) {
    const logger = this.logger.setContext(`controller.reactiveReward.${action}`, request.id);
    logger.info({ message: 'Reactive reward request', data: { method: request.method } });
    try {
      const user = getUserFromRequest(request);
      if (!user) throw new UnauthorizedError();
      const id = request.params.id ? identifier.parse(request.params.id) : undefined;
      let result: unknown;
      switch (action) {
        case 'get':
          result = await this.service.get(user.id, request.id);
          break;
        case 'enable':
          result = await this.service.enable(user.id, user.twitchId, request.id);
          break;
        case 'delete':
          await this.service.delete(user.id, request.id);
          this.eventController.disconnectUser(user.id);
          result = { deleted: true };
          break;
        case 'refreshKey':
          result = await this.service.refreshOverlayKey(user.id, request.id);
          // Overlays still holding the old key must reconnect with the new one
          this.eventController.disconnectUser(user.id);
          break;
        case 'saveReaction':
          result = await this.service.saveReaction(
            user.id,
            user.twitchId,
            reactionSchema.parse(request.body),
            id,
            request.id
          );
          break;
        case 'deleteReaction':
          await this.service.deleteReaction(user.id, id!, request.id);
          result = { deleted: true };
          break;
        case 'testReaction':
          result = await this.service.testReaction(user.id, id!, request.id);
          break;
        case 'beginUpload':
          result = await this.uploads.begin(user.id, request.body, request.id);
          break;
        case 'completeUpload':
          result = await this.uploads.complete(user.id, id!, request.id);
          break;
      }
      const status = request.method === 'POST' ? 201 : 200;
      logger.info({ message: 'Reactive reward request completed', data: { status } });
      return reply.status(status).send(result);
    } catch (error) {
      return this.error(error, request, reply);
    }
  }

  private error(error: unknown, request: FastifyRequest, reply: FastifyReply) {
    const logger = this.logger.setContext('controller.reactiveReward.error', request.id);
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
    logger[status >= 500 ? 'error' : 'warn']({
      message: 'Reactive reward request failed',
      data: { status },
      error: error as Error,
    });
    return reply.status(status).send({
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
}
