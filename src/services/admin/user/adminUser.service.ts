import { NotFoundError } from '@/errors';
import TLogger, { Layer } from '@/logging/logger';
import UserRepository from '@/repositories/user/user.repository';
import WidgetService from '../../widget/widget.service';
import TwitchService from '../../twitch/twitch';
import { Pagination, ListResponse } from '../../response';
import { User } from 'generated/prisma/client';

export default class AdminUserService {
  private readonly userRepository: UserRepository;
  private readonly widgetService: WidgetService;
  private readonly twitchService: TwitchService;
  private readonly logger: TLogger;

  constructor(
    userRepository: UserRepository,
    widgetService: WidgetService,
    twitchService: TwitchService
  ) {
    this.userRepository = userRepository;
    this.widgetService = widgetService;
    this.twitchService = twitchService;
    this.logger = new TLogger(Layer.SERVICE);
  }

  async list(
    transactionId: string,
    pagination: Pagination,
    search?: string,
    tier?: number,
    isShowcase?: boolean
  ): Promise<ListResponse<User & { widget_count: number }>> {
        let logger: TLogger = this.logger;
    logger = this.logger.setContext('service.adminUser.list', transactionId);
    const skip = (pagination.page - 1) * pagination.limit;
    const [users, total] = await Promise.all([
      this.userRepository.findMany(transactionId, skip, pagination.limit, search, tier, isShowcase),
      this.userRepository.count(transactionId, search, tier, isShowcase),
    ]);
    const data = users.map(({ _count, ...user }) => ({ ...user, widget_count: _count.widgets }));
    return { data, pagination: { ...pagination, total } };
  }

  async get(transactionId: string, id: string): Promise<User> {
        let logger: TLogger = this.logger;
    logger = this.logger.setContext('service.adminUser.get', transactionId);
    const user = await this.userRepository.get(transactionId, id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

  async getWidgets(transactionId: string, id: string, pagination: Pagination) {
        let logger: TLogger = this.logger;
    logger = this.logger.setContext('service.adminUser.getWidgets', transactionId);
    await this.get(transactionId, id);
    return this.widgetService.list(transactionId, id, pagination);
  }

  async getEventSubs(transactionId: string, id: string) {
        let logger: TLogger = this.logger;
    logger = this.logger.setContext('service.adminUser.getEventSubs', transactionId);
    const user = await this.get(transactionId, id);
    return this.twitchService.listEventSubs(user.twitch_id);
  }
}
