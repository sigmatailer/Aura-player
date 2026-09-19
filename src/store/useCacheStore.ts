import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { Track } from '../types';
import { usePlayerStore } from './usePlayerStore';

export interface CachedTrackInfo {
  trackId: string;
  cachedPath: string;
  cachedAt: number;
}

export interface CacheStats {
  total_bytes: number;
  file_count: number;
  formatted_size: string;
}

interface CacheState {
  cachedTracks: Record<string, CachedTrackInfo>;
  cachingTrackIds: string[];
  
  // Actions
  isCached: (trackId: string) => boolean;
  isCaching: (trackId: string) => boolean;
  cacheTrack: (track: Track, yandexToken?: string | null) => Promise<string | null>;
  removeCachedTrack: (trackId: string) => Promise<boolean>;
  getCacheStats: () => Promise<CacheStats>;
  clearCache: () => Promise<void>;
  verifyCacheOnDisk: () => Promise<void>;
}

export const useCacheStore = create<CacheState>()(
  persist(
    (set, get) => ({
      cachedTracks: {},
      cachingTrackIds: [],

      isCached: (trackId: string) => {
        return !!get().cachedTracks[trackId];
      },

      isCaching: (trackId: string) => {
        return get().cachingTrackIds.includes(trackId);
      },

      cacheTrack: async (track: Track, yandexToken?: string | null) => {
        const { cachingTrackIds, cachedTracks } = get();
        if (cachingTrackIds.includes(track.id)) return null;
        if (cachedTracks[track.id]) return cachedTracks[track.id].cachedPath;

        set({ cachingTrackIds: [...cachingTrackIds, track.id] });

        try {
          const isYandex = track.filePath.startsWith('yandex:') || 
                           track.id.startsWith('ya_') || 
                           track.album === 'Yandex Music';
          const token = yandexToken || localStorage.getItem('yandex_access_token') || null;

          const cachedPath = await invoke<string>('cache_track', {
            trackId: track.id,
            sourcePathOrUrl: track.filePath,
            isYandex,
            yandexToken: token,
          });

          set((state) => ({
            cachedTracks: {
              ...state.cachedTracks,
              [track.id]: {
                trackId: track.id,
                cachedPath,
                cachedAt: Date.now(),
              }
            },
            cachingTrackIds: state.cachingTrackIds.filter(id => id !== track.id),
          }));

          // Also update cachedFilePath in the current queue if track exists in queue
          const playerStore = usePlayerStore.getState();
          const updatedQueue = playerStore.queue.map(t => 
            t.id === track.id ? { ...t, cachedFilePath: cachedPath } : t
          );
          playerStore.setQueue(updatedQueue);

          return cachedPath;
        } catch (error) {
          console.error(`Failed to cache track ${track.title}:`, error);
          set((state) => ({
            cachingTrackIds: state.cachingTrackIds.filter(id => id !== track.id),
          }));
          throw error;
        }
      },

      removeCachedTrack: async (trackId: string) => {
        try {
          await invoke('remove_cached_track', { trackId });
          set((state) => {
            const next = { ...state.cachedTracks };
            delete next[trackId];
            return { cachedTracks: next };
          });

          // Also remove cachedFilePath from player queue
          const playerStore = usePlayerStore.getState();
          const updatedQueue = playerStore.queue.map(t => 
            t.id === trackId ? { ...t, cachedFilePath: null } : t
          );
          playerStore.setQueue(updatedQueue);

          return true;
        } catch (error) {
          console.error(`Failed to remove cached track ${trackId}:`, error);
          return false;
        }
      },

      getCacheStats: async () => {
        try {
          return await invoke<CacheStats>('get_cache_stats');
        } catch (error) {
          console.error('Failed to get cache stats:', error);
          return { total_bytes: 0, file_count: 0, formatted_size: '0 КБ' };
        }
      },

      clearCache: async () => {
        try {
          await invoke('clear_tracks_cache');
          set({ cachedTracks: {} });

          // Reset cachedFilePath in queue
          const playerStore = usePlayerStore.getState();
          const updatedQueue = playerStore.queue.map(t => ({ ...t, cachedFilePath: null }));
          playerStore.setQueue(updatedQueue);
        } catch (error) {
          console.error('Failed to clear cache:', error);
          throw error;
        }
      },

      verifyCacheOnDisk: async () => {
        const { cachedTracks } = get();
        const updated: Record<string, CachedTrackInfo> = {};
        for (const [id, info] of Object.entries(cachedTracks)) {
          try {
            const diskPath = await invoke<string | null>('get_cached_track_path', { trackId: id });
            if (diskPath) {
              updated[id] = { ...info, cachedPath: diskPath };
            }
          } catch {
            // file missing
          }
        }
        set({ cachedTracks: updated });
      }
    }),
    {
      name: 'aura-tracks-cache-store',
    }
  )
);
