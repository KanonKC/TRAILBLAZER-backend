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

  async list(pagination: Pagination, search?: string, tier?: number): Promise<ListResponse<User>> {
    this.logger.setContext('service.adminUser.list');
    const skip = (pagination.page - 1) * pagination.limit;
    const [data, total] = await Promise.all([
      this.userRepository.findMany(skip, pagination.limit, search, tier),
      this.userRepository.count(search, tier),
    ]);
    return { data, pagination: { ...pagination, total } };
  }

  async get(id: string): Promise<User> {
    this.logger.setContext('service.adminUser.get');
    const user = await this.userRepository.get(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

  async getWidgets(id: string, pagination: Pagination) {
    this.logger.setContext('service.adminUser.getWidgets');
    await this.get(id);
    return this.widgetService.list(id, pagination);
  }

  async getEventSubs(id: string) {
    this.logger.setContext('service.adminUser.getEventSubs');
    const user = await this.get(id);
    return this.twitchService.listEventSubs(user.twitch_id);
  }
}
