import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import AdminUserService from '@/services/admin/user/adminUser.service';
import { AdminAuthMiddleware } from '../../middleware';
import TLogger, { Layer } from '@/logging/logger';
import { TError } from '@/errors';
import { listAdminUserSchema, getUserWidgetsSchema } from './schemas';

export default class AdminUserController {
  private readonly adminUserService: AdminUserService;
  private readonly adminAuthMiddleware: AdminAuthMiddleware;
  private readonly logger: TLogger;

  constructor(adminUserService: AdminUserService, adminAuthMiddleware: AdminAuthMiddleware) {
    this.adminUserService = adminUserService;
    this.adminAuthMiddleware = adminAuthMiddleware;
    this.logger = new TLogger(Layer.CONTROLLER);
  }

  async list(req: FastifyRequest, res: FastifyReply) {
        let logger: TLogger = this.logger;
    logger = this.logger.setContext('controller.adminUser.list', req.id);
    const admin = await this.adminAuthMiddleware.authenticate(req, res);
    if (!admin) return; // 401 already sent

    try {
      const query = listAdminUserSchema.parse(req.query);
      const result = await this.adminUserService.list({ page: query.page, limit: query.limit }, query.search, query.tier, query.is_showcase, req.id);
      res.send(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).send({ message: 'Validation Error', errors: error.issues });
      }
      if (error instanceof TError) {
        return res.status(error.status).send(error.toJSON());
      }
      logger.error({ message: 'Failed to list users', error: error as Error });
      res.status(500).send({ message: 'Internal Server Error' });
    }
  }

  async get(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        let logger: TLogger = this.logger;
    logger = this.logger.setContext('controller.adminUser.get', req.id);
    const admin = await this.adminAuthMiddleware.authenticate(req, res);
    if (!admin) return; // 401 already sent

    try {
      const user = await this.adminUserService.get(req.params.id, req.id);
      res.send(user);
    } catch (error) {
      if (error instanceof TError) {
        return res.status(error.status).send(error.toJSON());
      }
      logger.error({ message: 'Failed to get user', error: error as Error });
      res.status(500).send({ message: 'Internal Server Error' });
    }
  }

  async getWidgets(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        let logger: TLogger = this.logger;
    logger = this.logger.setContext('controller.adminUser.getWidgets', req.id);
    const admin = await this.adminAuthMiddleware.authenticate(req, res);
    if (!admin) return; // 401 already sent

    try {
      const query = getUserWidgetsSchema.parse(req.query);
      const result = await this.adminUserService.getWidgets(req.params.id, {
        page: query.page,
        limit: query.limit,
      }, req.id);
      res.send(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).send({ message: 'Validation Error', errors: error.issues });
      }
      if (error instanceof TError) {
        return res.status(error.status).send(error.toJSON());
      }
      logger.error({ message: 'Failed to get user widgets', error: error as Error });
      res.status(500).send({ message: 'Internal Server Error' });
    }
  }

  async getEventSubs(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply) {
        let logger: TLogger = this.logger;
    logger = this.logger.setContext('controller.adminUser.getEventSubs', req.id);
    const admin = await this.adminAuthMiddleware.authenticate(req, res);
    if (!admin) return; // 401 already sent

    try {
      const result = await this.adminUserService.getEventSubs(req.params.id, req.id);
      res.send(result);
    } catch (error) {
      if (error instanceof TError) {
        return res.status(error.status).send(error.toJSON());
      }
      logger.error({ message: 'Failed to get user event subs', error: error as Error });
      res.status(500).send({ message: 'Internal Server Error' });
    }
  }

  async listEventDefinitions(req: FastifyRequest, res: FastifyReply) {
    const admin = await this.adminAuthMiddleware.authenticate(req, res);
    if (!admin) return; // 401 already sent
    res.send(this.adminUserService.listEventDefinitions());
  }

  async subscribeEvent(req: FastifyRequest<{ Params: { id: string; type: string } }>, res: FastifyReply) {
    const logger = this.logger.setContext('controller.adminUser.subscribeEvent', req.id);
    const admin = await this.adminAuthMiddleware.authenticate(req, res);
    if (!admin) return; // 401 already sent

    try {
      const result = await this.adminUserService.subscribeEvent(req.params.id, req.params.type, req.id);
      res.send(result);
    } catch (error) {
      if (error instanceof TError) {
        return res.status(error.status).send(error.toJSON());
      }
      logger.error({ message: 'Failed to subscribe event', error: error as Error });
      res.status(500).send({ message: 'Internal Server Error' });
    }
  }

  async unsubscribeEvent(req: FastifyRequest<{ Params: { id: string; type: string } }>, res: FastifyReply) {
    const logger = this.logger.setContext('controller.adminUser.unsubscribeEvent', req.id);
    const admin = await this.adminAuthMiddleware.authenticate(req, res);
    if (!admin) return; // 401 already sent

    try {
      const result = await this.adminUserService.unsubscribeEvent(req.params.id, req.params.type, req.id);
      res.send(result);
    } catch (error) {
      if (error instanceof TError) {
        return res.status(error.status).send(error.toJSON());
      }
      logger.error({ message: 'Failed to unsubscribe event', error: error as Error });
      res.status(500).send({ message: 'Internal Server Error' });
    }
  }
}
