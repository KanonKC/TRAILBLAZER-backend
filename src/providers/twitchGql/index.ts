import axios, { AxiosInstance } from 'axios';
import Configurations from '@/config/index';
import { ExportVideoToYoutubeResponse, TwitchClipResponse } from './response';
import { ExportVideoToYoutubeRequest } from './request';
import AuthService from '@/services/auth/auth.service';
import TLogger, { Layer } from '@/logging/logger';

export default class TwitchGql {
  private readonly endpoint: string = 'https://gql.twitch.tv/gql';
  private readonly api: AxiosInstance;
  private readonly cfg: Configurations;
  private readonly logger = new TLogger(Layer.SERVICE);

  constructor(cfg: Configurations) {
    this.cfg = cfg;
    this.api = axios.create({
      baseURL: this.endpoint,
      headers: {
        'Client-ID': this.cfg.twitchGql.clientId,
      },
    });
  }

  async getClip(slug: string): Promise<TwitchClipResponse> {
    this.logger.setContext('twitch.gql.getClip');
    const body = {
      operationName: 'VideoAccessToken_Clip',
      variables: {
        slug: slug,
        platform: 'web',
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: this.cfg.twitchGql.sha256Hash,
        },
      },
    };
    try {
      const response = await this.api.post('', body);
      this.logger.info({ message: 'Fetched clip from Twitch GQL', data: { slug } });
      return response.data;
    } catch (error) {
      this.logger.error({
        message: 'Failed to fetch clip from Twitch GQL',
        error: error as Error,
        data: { slug },
      });
      throw error;
    }
  }

  async getClipProductionUrl(slug: string): Promise<string> {
    this.logger.setContext('twitch.gql.getClipProductionUrl');
    const response = await this.getClip(slug);
    const clipData = response.data.clip;
    const playbackToken = clipData.playbackAccessToken;
    const videoQualities = clipData.videoQualities;

    const distinctQuality = videoQualities.find((q) => q.quality === '1080') || videoQualities[0];

    if (distinctQuality) {
      const sourceUrl = distinctQuality.sourceURL;
      const signature = playbackToken.signature;
      const token = encodeURIComponent(playbackToken.value);

      const finalLink = `${sourceUrl}?sig=${signature}&token=${token}`;
      this.logger.info({
        message: 'Resolved clip production URL',
        data: { slug, quality: distinctQuality.quality },
      });
      return finalLink;
    } else {
      this.logger.warn({ message: 'No suitable video quality found for clip', data: { slug } });
      throw new Error('No suitable video quality found.');
    }
  }

  async exportVideosToYoutube(
    req: ExportVideoToYoutubeRequest[],
    token: string
  ): Promise<ExportVideoToYoutubeResponse[]> {
    this.logger.setContext('twitch.gql.exportVideosToYoutube');
    const body = req.map((r) => ({
      operationName: 'YoutubeExportModal_ExportVideoToYoutube',
      variables: {
        input: {
          videoID: r.videoId,
          title: r.title,
          description: r.description || '',
          tags: r.tags || [],
          privacyStatus: r.privacyStatus || 'PRIVATE',
          doSplit: r.doSplit || false,
        },
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: this.cfg.twitchGql.exportVideo.sha256Hash,
        },
      },
    }));
    try {
      const response = await this.api.post('', body, {
        headers: {
          Authorization: `OAuth ${token}`,
        },
      });
      this.logger.info({
        message: 'Exported videos to YouTube',
        data: { count: req.length, videoIds: req.map((r) => r.videoId) },
      });
      return response.data;
    } catch (error) {
      this.logger.error({
        message: 'Failed to export videos to YouTube',
        error: error as Error,
        data: { count: req.length, videoIds: req.map((r) => r.videoId) },
      });
      throw error;
    }
  }
}
