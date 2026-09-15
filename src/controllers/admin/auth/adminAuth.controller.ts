import { FastifyReply, FastifyRequest } from 'fastify';
import Configurations from '@/config/index';
import TLogger, { Layer } from '@/logging/logger';
import AdminAuthService from '@/services/admin/auth/adminAuth.service';
import { AdminAuthMiddleware } from '../../middleware';
import { setAdminAuthCookies, clearAdminAuthCookies } from '@/libs/cookies';
import { TError } from '@/errors';

export default class AdminAuthController {
  private readonly cfg: Configurations;
  private readonly adminAuthService: AdminAuthService;
  private readonly adminAuthMiddleware: AdminAuthMiddleware;
  private readonly logger: TLogger;

  constructor(
    cfg: Configurations,
    adminAuthService: AdminAuthService,
    adminAuthMiddleware: AdminAuthMiddleware
  ) {
    this.cfg = cfg;
    this.adminAuthService = adminAuthService;
    this.adminAuthMiddleware = adminAuthMiddleware;
    this.logger = new TLogger(Layer.CONTROLLER);
  }

  async google(req: FastifyRequest, res: FastifyReply) {
    this.logger.setContext('controller.adminAuth.google');
    try {
      const url = await this.adminAuthService.buildGoogleAuthUrl();
      res.redirect(url);
    } catch (err) {
      this.logger.error({ message: 'Failed to build Google auth URL', error: err as Error });
      res.status(500).send({ message: 'Internal Server Error' });
    }
  }

  async googleCallback(
    req: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>,
    res: FastifyReply
  ) {
    this.logger.setContext('controller.adminAuth.googleCallback');
    const { code, state, error } = req.query;

    if (error || !code || !state) {
      this.logger.warn({ message: 'Google callback missing code/state', data: { error } });
      return res.redirect(`${this.cfg.admin.frontendOrigin}/login?error=oauth_failed`);
    }

    try {
      const { accessToken, refreshToken, admin } = await this.adminAuthService.handleGoogleCallback(
        code,
        state
      );
      setAdminAuthCookies(res, { accessToken, refreshToken });
      this.logger.info({
        message: 'Admin login successful',
        data: { adminId: admin.id, email: admin.email },
      });
      res.redirect(this.cfg.admin.frontendOrigin);
    } catch (err) {
      if (err instanceof TError) {
        this.logger.warn({ message: err.message, error: err });
        return res.redirect(
          `${this.cfg.admin.frontendOrigin}/login?error=${encodeURIComponent(err.message)}`
        );
      }
      this.logger.error({ message: 'Google callback failed', error: err as Error });
      res.redirect(`${this.cfg.admin.frontendOrigin}/login?error=oauth_failed`);
    }
  }

  async refresh(req: FastifyRequest, res: FastifyReply) {
    this.logger.setContext('controller.adminAuth.refresh');
    const { adminRefreshToken } = req.cookies;
    if (!adminRefreshToken) {
      return res.status(401).send({ message: 'No refresh token' });
    }

    try {
      const tokens = await this.adminAuthService.refreshToken(adminRefreshToken);
      setAdminAuthCookies(res, tokens);
      res.send({ message: 'Token refreshed' });
    } catch (err) {
      if (err instanceof TError) {
        this.logger.error({ message: err.message, error: err });
        clearAdminAuthCookies(res);
        return res.status(err.status).send(err.toJSON());
      }
      this.logger.error({ message: 'Admin token refresh failed', error: err as string | Error });
      clearAdminAuthCookies(res);
      res.status(401).send({ message: 'Invalid refresh token' });
    }
  }

  async logout(req: FastifyRequest, res: FastifyReply) {
    this.logger.setContext('controller.adminAuth.logout');
    try {
      await this.adminAuthService.logout(req.cookies.adminRefreshToken);
      clearAdminAuthCookies(res);
      res.send({ message: 'Logged out' });
    } catch (err) {
      this.logger.error({ message: 'Admin logout failed', error: err as Error });
      clearAdminAuthCookies(res);
      res.status(500).send({ message: 'Internal Server Error' });
    }
  }

  async me(req: FastifyRequest, res: FastifyReply) {
    this.logger.setContext('controller.adminAuth.me');
    const decoded = await this.adminAuthMiddleware.authenticate(req, res);
    if (!decoded) return; // 401 already sent
    res.send(decoded);
  }
}
