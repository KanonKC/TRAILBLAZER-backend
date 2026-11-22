import { FastifyReply, FastifyRequest } from 'fastify';
import redis, { subscriber } from '@/libs/redis';
import TLogger, { Layer } from '@/logging/logger';
import WidgetService from '@/services/widget/widget.service';
import { WidgetTypeSlug } from '@/services/constant';
import { TError } from '@/errors';
import {
  PRESENCE_REFRESH_MS,
  PRESENCE_TTL_SECONDS,
  presenceKey,
} from '@/services/reactiveReward/reactiveReward.logic';

const HEARTBEAT_MS = 15_000;

type SseRequest = FastifyRequest<{ Params: { userId: string }; Querystring: { key?: string } }>;

/**
 * The OBS overlay's event stream. While at least one overlay is connected it keeps a presence key alive in Redis,
 * which is how the rest of the system knows whether a redemption would be seen by anyone.
 */
export default class ReactiveRewardEventController {
  private readonly logger = new TLogger(Layer.EVENT_CONTROLLER);
  // userId -> open overlay connections on this instance
  private readonly connections = new Map<string, Set<FastifyReply>>();

  constructor(private readonly widgetService: WidgetService) {}

  async sse(req: SseRequest, res: FastifyReply) {
    const logger = this.logger.setContext('controller.reactiveRewardEvent.sse', req.id);
    const { userId } = req.params;
    const key = req.query.key ?? '';

    // The overlay can leave at any point during setup. `closed` lets every step after an await notice that and stop,
    // so a dead client never ends up with a subscription or a timer that keeps its presence alive.
    let closed = false;
    let subscription: ReturnType<typeof subscriber.duplicate> | undefined;
    let presenceTimer: NodeJS.Timeout | undefined;
    let heartbeatTimer: NodeJS.Timeout | undefined;
    let subscriptionClosed = false;
    // Safe to call from both the disconnect handler and the checks after each await: it quits at most once, and only
    // once the connection is open (a connection still being opened is quit by the check that follows its connect)
    const closeSubscription = () => {
      if (!subscription || subscriptionClosed || !subscription.isOpen) return;
      subscriptionClosed = true;
      void subscription.quit().catch(() => undefined);
    };
    const cleanup = () => {
      closed = true;
      if (presenceTimer) clearInterval(presenceTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      presenceTimer = heartbeatTimer = undefined;
      closeSubscription();
      const userConnections = this.connections.get(userId);
      userConnections?.delete(res);
      if (userConnections?.size === 0) this.connections.delete(userId);
    };
    req.raw.on('close', cleanup);

    logger.info({ message: 'SSE connection attempt', data: { userId } });
    try {
      const isValid = await this.widgetService.validateOverlayAccess(userId, key, req.id, WidgetTypeSlug.REACTIVE_REWARD);
      if (closed) return;
      if (!isValid) {
        logger.warn({ message: 'Invalid key for SSE connection', data: { userId } });
        return res.status(401).send({ message: 'Invalid overlay key' });
      }

      res.sse({ event: 'connected', data: 'connected' });
      if (!this.connections.has(userId)) this.connections.set(userId, new Set());
      this.connections.get(userId)!.add(res);

      subscription = subscriber.duplicate();
      await subscription.connect();
      await subscription.subscribe('reactive-reward:play', (message) => {
        const { userId: targetUserId, ...payload } = JSON.parse(message);
        if (targetUserId === userId) res.sse({ event: 'reaction-play', data: JSON.stringify(payload) });
      });
      if (closed) {
        closeSubscription();
        return;
      }

      // Only now is this overlay able to receive a reaction, so only now does it count as present
      await this.markPresent(userId, req.id);
      if (closed) return;
      presenceTimer = setInterval(() => void this.markPresent(userId, req.id), PRESENCE_REFRESH_MS);
      heartbeatTimer = setInterval(() => res.sse({ event: 'heartbeat', data: '{}' }), HEARTBEAT_MS);
      logger.info({ message: 'SSE connected', data: { userId } });
    } catch (error) {
      cleanup();
      if (error instanceof TError) {
        logger[error.status >= 500 ? 'error' : 'warn']({ message: error.message, error });
        return res.status(error.status).send({ message: error.message });
      }
      logger.error({ message: 'SSE connection failed', error: error as Error });
      return res.status(500).send({ message: 'Internal Server Error' });
    }
  }

  private async markPresent(userId: string, transactionId: string) {
    const logger = this.logger.setContext('controller.reactiveRewardEvent.markPresent', transactionId);
    try {
      await redis.set(presenceKey(userId), '1', { expiration: { type: 'EX', value: PRESENCE_TTL_SECONDS } });
    } catch (error) {
      logger.error({ message: 'Failed to refresh overlay presence', data: { userId }, error: error as Error });
    }
  }

  /** Closes every overlay of the user, used when the key they connected with stops being valid. */
  public disconnectUser(userId: string) {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return;
    const logger = this.logger.setContext('controller.reactiveRewardEvent.disconnectUser');
    logger.info({ message: 'Disconnecting clients', data: { userId, clientCount: userConnections.size } });
    for (const connection of userConnections) connection.raw.end();
    this.connections.delete(userId);
  }
}
