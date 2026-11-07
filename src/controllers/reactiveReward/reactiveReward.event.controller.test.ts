import { EventEmitter } from 'events';
import redis, { subscriber } from '@/libs/redis';
import ReactiveRewardEventController from './reactiveReward.event.controller';

jest.mock('@/libs/redis', () => ({
  __esModule: true,
  default: { set: jest.fn() },
  subscriber: { duplicate: jest.fn() },
}));

const redisMock = redis as unknown as { set: jest.Mock };
const subscriberMock = subscriber as unknown as { duplicate: jest.Mock };

function fakeSubscription() {
  let deliver: (message: string) => void = () => undefined;
  return {
    isOpen: true,
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockImplementation(async (_channel: string, listener: (message: string) => void) => {
      deliver = listener;
    }),
    quit: jest.fn().mockResolvedValue(undefined),
    publish: (message: unknown) => deliver(JSON.stringify(message)),
  };
}

function fakeConnection(userId = 'owner-1', key = 'overlay-key') {
  const raw = Object.assign(new EventEmitter(), { end: jest.fn() });
  const req = { id: 'tx', params: { userId }, query: { key }, raw } as any;
  const send = jest.fn();
  const res: any = { sse: jest.fn(), raw, status: jest.fn().mockReturnThis(), send };
  return { req, res, raw, send };
}

describe('ReactiveRewardEventController.sse', () => {
  const widgetService = { validateOverlayAccess: jest.fn() };
  let controller: ReactiveRewardEventController;
  let subscription: ReturnType<typeof fakeSubscription>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    widgetService.validateOverlayAccess.mockResolvedValue(true);
    redisMock.set.mockResolvedValue('OK');
    subscription = fakeSubscription();
    subscriberMock.duplicate.mockReturnValue(subscription);
    controller = new ReactiveRewardEventController(widgetService as any);
  });

  afterEach(() => jest.useRealTimers());

  it('only accepts a key that belongs to a Reactive Reward widget of that user', async () => {
    const { req, res } = fakeConnection();
    await controller.sse(req, res);
    expect(widgetService.validateOverlayAccess).toHaveBeenCalledWith('owner-1', 'overlay-key', 'tx', 'reactive-reward');
  });

  it('turns away an invalid key with 401, without subscribing or claiming presence', async () => {
    widgetService.validateOverlayAccess.mockResolvedValue(false);
    const { req, res } = fakeConnection();
    await controller.sse(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.sse).not.toHaveBeenCalled();
    expect(subscriberMock.duplicate).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('treats a missing key as invalid', async () => {
    widgetService.validateOverlayAccess.mockResolvedValue(false);
    const { req, res } = fakeConnection();
    req.query = {};
    await controller.sse(req, res);
    expect(widgetService.validateOverlayAccess).toHaveBeenCalledWith('owner-1', '', 'tx', 'reactive-reward');
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('announces the connection, then marks the overlay present for 45 seconds', async () => {
    const { req, res } = fakeConnection();
    await controller.sse(req, res);
    expect(res.sse).toHaveBeenCalledWith({ event: 'connected', data: 'connected' });
    expect(redisMock.set).toHaveBeenCalledWith('reactive-reward:presence:owner-1', '1', { expiration: { type: 'EX', value: 45 } });
  });

  it('claims presence only after the subscription is in place', async () => {
    const { req, res } = fakeConnection();
    const order: string[] = [];
    subscription.subscribe.mockImplementation(async () => void order.push('subscribed'));
    redisMock.set.mockImplementation(async () => void order.push('present'));
    await controller.sse(req, res);
    expect(order).toEqual(['subscribed', 'present']);
  });

  it('refreshes presence every 15 seconds while connected', async () => {
    const { req, res } = fakeConnection();
    await controller.sse(req, res);
    redisMock.set.mockClear();
    await jest.advanceTimersByTimeAsync(15_000);
    expect(redisMock.set).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(redisMock.set).toHaveBeenCalledTimes(3);
  });

  it('keeps the stream alive with a heartbeat', async () => {
    const { req, res } = fakeConnection();
    await controller.sse(req, res);
    res.sse.mockClear();
    await jest.advanceTimersByTimeAsync(15_000);
    expect(res.sse).toHaveBeenCalledWith({ event: 'heartbeat', data: '{}' });
  });

  it("forwards only this owner's reactions, as reaction-play events without the internal user id", async () => {
    const { req, res } = fakeConnection();
    await controller.sse(req, res);
    res.sse.mockClear();
    subscription.publish({ userId: 'someone-else', jobId: 'job-9', reaction_id: 'r-9' });
    expect(res.sse).not.toHaveBeenCalled();
    subscription.publish({ userId: 'owner-1', jobId: 'job-1', duration_ms: 10_000, reaction_id: 'r-1', display_ms: 5000 });
    expect(res.sse).toHaveBeenCalledTimes(1);
    const sent = res.sse.mock.calls[0][0];
    expect(sent.event).toBe('reaction-play');
    expect(JSON.parse(sent.data)).toEqual({ jobId: 'job-1', duration_ms: 10_000, reaction_id: 'r-1', display_ms: 5000 });
  });

  it('stops refreshing presence and drops the subscription when the overlay disconnects', async () => {
    const { req, res, raw } = fakeConnection();
    await controller.sse(req, res);
    raw.emit('close');
    expect(subscription.quit).toHaveBeenCalled();
    redisMock.set.mockClear();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('sets nothing up when the overlay leaves before the key check finishes', async () => {
    let finishValidation: (valid: boolean) => void = () => undefined;
    widgetService.validateOverlayAccess.mockReturnValue(new Promise((resolve) => (finishValidation = resolve)));
    const { req, res, raw } = fakeConnection();
    const pending = controller.sse(req, res);
    raw.emit('close');
    finishValidation(true);
    await pending;
    await jest.advanceTimersByTimeAsync(60_000);
    expect(subscriberMock.duplicate).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
    expect(res.sse).not.toHaveBeenCalled();
  });

  it('closes the subscription and never claims presence when the overlay leaves while it is subscribing', async () => {
    const { req, res, raw } = fakeConnection();
    subscription.subscribe.mockImplementation(async () => void raw.emit('close'));
    await controller.sse(req, res);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(subscription.quit).toHaveBeenCalledTimes(1);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('starts no refresh timer when the overlay leaves while its presence is being written', async () => {
    const { req, res, raw } = fakeConnection();
    redisMock.set.mockImplementation(async () => void raw.emit('close'));
    await controller.sse(req, res);
    redisMock.set.mockClear();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('does not let a failing presence write break the stream', async () => {
    redisMock.set.mockRejectedValue(new Error('redis down'));
    const { req, res } = fakeConnection();
    await expect(controller.sse(req, res)).resolves.toBeUndefined();
    expect(res.sse).toHaveBeenCalledWith({ event: 'connected', data: 'connected' });
  });

  describe('disconnectUser', () => {
    it("ends every overlay of the user, and nobody else's", async () => {
      const first = fakeConnection('owner-1');
      const second = fakeConnection('owner-1');
      const other = fakeConnection('owner-2');
      for (const connection of [first, second, other]) await controller.sse(connection.req, connection.res);
      controller.disconnectUser('owner-1');
      expect(first.raw.end).toHaveBeenCalled();
      expect(second.raw.end).toHaveBeenCalled();
      expect(other.raw.end).not.toHaveBeenCalled();
    });

    it('does nothing for a user with no overlay connected', () => {
      expect(() => controller.disconnectUser('nobody')).not.toThrow();
    });
  });
});
