import { pocketBaseService } from './PocketBaseService';
import { Track } from '../types';

export interface ListeningLog {
  track: Track;
  listenedSeconds: number;
  totalDuration: number;
  isSkipped: boolean;
  isCompleted: boolean;
}

class WaveAnalyticsService {
  private localAnalyticsBuffer: ListeningLog[] = [];
  private dislikedTrackIds: Set<string> = new Set();
  private preferredArtists: Set<string> = new Set();
  private dislikedArtists: Set<string> = new Set();

  constructor() {
    this.loadCachedInsights();
  }

  private loadCachedInsights() {
    try {
      const cached = localStorage.getItem('wave_insights');
      if (cached) {
        const parsed = JSON.parse(cached);
        this.dislikedTrackIds = new Set(parsed.dislikedTrackIds || []);
        this.preferredArtists = new Set(parsed.preferredArtists || []);
        this.dislikedArtists = new Set(parsed.dislikedArtists || []);
      }
    } catch {
      // Ignore
    }
  }

  private saveCachedInsights() {
    try {
      localStorage.setItem('wave_insights', JSON.stringify({
        dislikedTrackIds: Array.from(this.dislikedTrackIds),
        preferredArtists: Array.from(this.preferredArtists),
        dislikedArtists: Array.from(this.dislikedArtists)
      }));
    } catch {
      // Ignore
    }
  }

  public async logTrackEvent(log: ListeningLog) {
    const { track, listenedSeconds, totalDuration, isSkipped, isCompleted } = log;
    if (!track || !track.id) return;

    // Fast local memory update for Wave recommendations
    if (isSkipped) {
      this.dislikedTrackIds.add(track.id);
      if (track.artist) {
        // If track skipped very early (< 15 seconds)
        if (listenedSeconds < 15) {
          this.dislikedArtists.add(track.artist.toLowerCase().trim());
        }
      }
    } else if (isCompleted) {
      if (track.artist) {
        this.preferredArtists.add(track.artist.toLowerCase().trim());
        this.dislikedArtists.delete(track.artist.toLowerCase().trim());
      }
    }
    this.saveCachedInsights();

    // Send to PocketBase wave_analytics collection
    try {
      const pb = pocketBaseService.pb;
      const userId = pocketBaseService.getUserId();

      await pb.collection('wave_analytics').create({
        user: userId || null,
        track_id: track.id,
        title: track.title,
        artist: track.artist,
        listened_seconds: Math.round(listenedSeconds),
        total_duration: Math.round(totalDuration),
        is_skipped: isSkipped,
        is_completed: isCompleted,
        device_info: pocketBaseService.getDeviceName()
      });
    } catch (e) {
      // If offline or network glitch, store locally
      this.localAnalyticsBuffer.push(log);
      if (this.localAnalyticsBuffer.length > 50) {
        this.localAnalyticsBuffer.shift();
      }
    }
  }

  public isTrackDisliked(trackId: string): boolean {
    return this.dislikedTrackIds.has(trackId);
  }

  public isArtistDisliked(artist: string): boolean {
    return this.dislikedArtists.has(artist.toLowerCase().trim());
  }

  public isArtistPreferred(artist: string): boolean {
    return this.preferredArtists.has(artist.toLowerCase().trim());
  }

  public async fetchServerStats(): Promise<{
    totalListens: number;
    completedCount: number;
    skippedCount: number;
    completionRate: number;
    topArtists: { artist: string; count: number }[];
  }> {
    const pb = pocketBaseService.pb;
    const userId = pocketBaseService.getUserId();
    
    try {
      const filter = userId ? `user = "${userId}"` : '';
      const list = await pb.collection('wave_analytics').getList(1, 100, {
        filter,
        sort: '-created'
      });

      const totalListens = list.totalItems;
      let completedCount = 0;
      let skippedCount = 0;
      const artistMap: Record<string, number> = {};

      for (const item of list.items) {
        if (item.is_completed) completedCount++;
        if (item.is_skipped) skippedCount++;
        if (item.artist && item.is_completed) {
          artistMap[item.artist] = (artistMap[item.artist] || 0) + 1;
        }
      }

      const topArtists = Object.entries(artistMap)
        .map(([artist, count]) => ({ artist, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const completionRate = totalListens > 0 ? Math.round((completedCount / totalListens) * 100) : 0;

      return {
        totalListens,
        completedCount,
        skippedCount,
        completionRate,
        topArtists
      };
    } catch {
      return {
        totalListens: 0,
        completedCount: 0,
        skippedCount: 0,
        completionRate: 0,
        topArtists: []
      };
    }
  }
}

export const waveAnalyticsService = new WaveAnalyticsService();
