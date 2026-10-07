import { create } from 'zustand';
import { Track } from '../types';
import { pocketBaseService } from '../services/PocketBaseService';
import { usePlayerStore } from './usePlayerStore';
import { useAuthStore } from './useAuthStore';

const DEFAULT_COVERS = [
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=400&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=400&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=400&auto=format&fit=crop'
];

export interface TrackPlayStat {
  trackId: string;
  title: string;
  artist: string;
  cover?: string;
  playCount: number;
  totalSeconds: number;
  lastPlayed: number;
}

export interface AnalyticsState {
  totalPlays: number;
  totalSeconds: number;
  completedPlays: number;
  skippedPlays: number;
  trackStats: Record<string, TrackPlayStat>;
  topCovers: string[];
  
  // Actions
  recordTrackPlay: (track: Track) => void;
  recordTrackEnd: (track: Track, listenedSeconds: number, isSkipped: boolean, isCompleted: boolean) => void;
  recordListeningSeconds: (seconds: number) => void;
  syncWithDatabase: () => Promise<void>;
  getTotalHoursFormatted: () => string;
  loadUserAnalytics: (userId?: string) => void;
}

function computeTopCovers(trackStats: Record<string, TrackPlayStat>, historyTracks: Track[] = []): string[] {
  const covers: string[] = [];

  // 1. Most played tracks covers
  const sortedTracks = Object.values(trackStats)
    .filter(t => t.cover && typeof t.cover === 'string' && t.cover.length > 5)
    .sort((a, b) => b.playCount - a.playCount || b.lastPlayed - a.lastPlayed);

  for (const t of sortedTracks) {
    if (t.cover && !covers.includes(t.cover)) {
      covers.push(t.cover);
    }
    if (covers.length >= 4) break;
  }

  // 2. Fallback to recent player history covers
  if (covers.length < 4 && historyTracks && historyTracks.length > 0) {
    for (const h of historyTracks) {
      const c = h.customCoverPath || h.originalCoverUrl;
      if (c && !covers.includes(c)) {
        covers.push(c);
      }
      if (covers.length >= 4) break;
    }
  }

  // 3. Fallback to aesthetic default covers
  let idx = 0;
  while (covers.length < 4) {
    covers.push(DEFAULT_COVERS[idx % DEFAULT_COVERS.length]);
    idx++;
  }

  return covers.slice(0, 4);
}

const getStorageKey = (explicitUserId?: string) => {
  const userId = explicitUserId || pocketBaseService.getUserId() || useAuthStore.getState().user?.id;
  return userId ? `aura_listening_analytics_${userId}` : 'aura_listening_analytics_guest';
};

let cloudAnalyticsSyncTimer: any = null;
const pushCloudAnalyticsDebounced = () => {
  if (cloudAnalyticsSyncTimer) clearTimeout(cloudAnalyticsSyncTimer);
  cloudAnalyticsSyncTimer = setTimeout(() => {
    const currentUserId = pocketBaseService.getUserId() || useAuthStore.getState().user?.id;
    if (!currentUserId || !pocketBaseService.isLoggedIn()) return;
    const state = useAnalyticsStore.getState();
    pocketBaseService.saveCloudCustomization(currentUserId, {
      analytics: {
        totalPlays: state.totalPlays,
        totalSeconds: state.totalSeconds,
        totalHoursFormatted: state.getTotalHoursFormatted(),
        topCovers: state.topCovers
      }
    }).catch(() => {});
  }, 1500);
};

export const useAnalyticsStore = create<AnalyticsState>((set, get) => {
  // Load initial from user-scoped localStorage
  let savedStats: any = null;
  try {
    const raw = localStorage.getItem(getStorageKey()) || localStorage.getItem('aura_listening_analytics');
    if (raw) savedStats = JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to parse listening analytics:', e);
  }

  const initialTrackStats: Record<string, TrackPlayStat> = savedStats?.trackStats || {};
  let initialTotalPlays = savedStats?.totalPlays || 0;
  let initialTotalSeconds = savedStats?.totalSeconds || 0;
  const initialCompleted = savedStats?.completedPlays || 0;
  const initialSkipped = savedStats?.skippedPlays || 0;

  // If local stats are empty, seed from current player history if available
  const history = usePlayerStore.getState().history || [];
  if (initialTotalPlays === 0 && history.length > 0) {
    initialTotalPlays = history.length;
    let calcSec = 0;
    history.forEach(t => {
      const dur = t.duration && t.duration > 30 ? Math.min(t.duration, 300) : 175;
      calcSec += dur;
      const key = t.id || `${t.title}__${t.artist}`;
      initialTrackStats[key] = {
        trackId: t.id,
        title: t.title || '',
        artist: t.artist || '',
        cover: (t.customCoverPath || t.originalCoverUrl) || undefined,
        playCount: 1,
        totalSeconds: dur,
        lastPlayed: Date.now()
      };
    });
    initialTotalSeconds = calcSec;
  }

  const initialTopCovers = computeTopCovers(initialTrackStats, history);

  const saveToStorage = (state: Partial<AnalyticsState>) => {
    try {
      const current = get();
      localStorage.setItem(getStorageKey(), JSON.stringify({
        totalPlays: state.totalPlays ?? current.totalPlays,
        totalSeconds: state.totalSeconds ?? current.totalSeconds,
        completedPlays: state.completedPlays ?? current.completedPlays,
        skippedPlays: state.skippedPlays ?? current.skippedPlays,
        trackStats: state.trackStats ?? current.trackStats
      }));
    } catch {}
  };

  return {
    totalPlays: initialTotalPlays,
    totalSeconds: initialTotalSeconds,
    completedPlays: initialCompleted,
    skippedPlays: initialSkipped,
    trackStats: initialTrackStats,
    topCovers: initialTopCovers,

    loadUserAnalytics: (userId?: string) => {
      const key = getStorageKey(userId);
      let parsed: any = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw) parsed = JSON.parse(raw);
      } catch {}

      if (parsed) {
        set({
          totalPlays: parsed.totalPlays || 0,
          totalSeconds: parsed.totalSeconds || 0,
          completedPlays: parsed.completedPlays || 0,
          skippedPlays: parsed.skippedPlays || 0,
          trackStats: parsed.trackStats || {},
          topCovers: computeTopCovers(parsed.trackStats || {}, usePlayerStore.getState().history || [])
        });
      } else {
        set({
          totalPlays: 0,
          totalSeconds: 0,
          completedPlays: 0,
          skippedPlays: 0,
          trackStats: {},
          topCovers: computeTopCovers({}, [])
        });
      }
    },

    getTotalHoursFormatted: () => {
      let totalSec = get().totalSeconds || 0;
      const plays = get().totalPlays || 0;
      if (isNaN(totalSec) || totalSec < 0) totalSec = 0;
      if (plays >= 5 && totalSec < plays * 60) {
        totalSec = Math.max(totalSec, plays * 165);
      }
      const hrs = totalSec / 3600;
      if (isNaN(hrs) || hrs <= 0) {
        return plays > 0 ? '0,1' : '0,0';
      }
      if (hrs < 0.1 && plays > 0) {
        return '0,1';
      }
      return hrs.toFixed(1).replace('.', ',');
    },

    recordListeningSeconds: (seconds: number) => {
      if (seconds <= 0) return;
      const newSec = get().totalSeconds + Math.round(seconds);
      set({ totalSeconds: newSec });
      saveToStorage({ totalSeconds: newSec });
      pushCloudAnalyticsDebounced();
    },

    recordTrackPlay: (track: Track) => {
      if (!track || !track.id) return;
      const key = track.id || `${track.title}__${track.artist}`;
      const stats = { ...get().trackStats };
      const current = stats[key] || {
        trackId: track.id,
        title: track.title || '',
        artist: track.artist || '',
        cover: (track.customCoverPath || track.originalCoverUrl) || undefined,
        playCount: 0,
        totalSeconds: 0,
        lastPlayed: Date.now()
      };

      current.playCount += 1;
      current.lastPlayed = Date.now();
      if (!current.cover && (track.customCoverPath || track.originalCoverUrl)) {
        current.cover = (track.customCoverPath || track.originalCoverUrl) || undefined;
      }
      stats[key] = current;

      const newTotalPlays = get().totalPlays + 1;
      const historyTracks = usePlayerStore.getState().history || [];
      const newTopCovers = computeTopCovers(stats, historyTracks);

      set({
        totalPlays: newTotalPlays,
        trackStats: stats,
        topCovers: newTopCovers
      });

      saveToStorage({ totalPlays: newTotalPlays, trackStats: stats });
      pushCloudAnalyticsDebounced();
    },

    recordTrackEnd: (track: Track, listenedSeconds: number, isSkipped: boolean, isCompleted: boolean) => {
      if (!track) return;
      const key = track.id || `${track.title}__${track.artist}`;
      const sec = Math.max(0, Math.round(listenedSeconds));
      const stats = { ...get().trackStats };

      if (stats[key]) {
        stats[key].totalSeconds += sec;
      }

      const newTotalSeconds = get().totalSeconds + sec;
      const newSkipped = isSkipped ? get().skippedPlays + 1 : get().skippedPlays;
      const newCompleted = isCompleted ? get().completedPlays + 1 : get().completedPlays;

      set({
        totalSeconds: newTotalSeconds,
        skippedPlays: newSkipped,
        completedPlays: newCompleted,
        trackStats: stats
      });

      saveToStorage({
        totalSeconds: newTotalSeconds,
        skippedPlays: newSkipped,
        completedPlays: newCompleted,
        trackStats: stats
      });
      pushCloudAnalyticsDebounced();
    },

    syncWithDatabase: async () => {
      const currentUserId = pocketBaseService.getUserId() || useAuthStore.getState().user?.id;
      if (!currentUserId || !pocketBaseService.isLoggedIn()) return;

      try {
        const pb = pocketBaseService.pb;
        const stats = { ...get().trackStats };
        let dbTotalSec = 0;
        let dbCompleted = 0;
        let dbSkipped = 0;
        let uniqueItemsCount = 0;
        const seenEvents = new Set<string>();

        // 1. Fetch wave_analytics strictly for THIS user
        try {
          const list = await pb.collection('wave_analytics').getList(1, 500, {
            filter: `user = "${currentUserId}" && track_id != "__aura_user_card__"`
          });

          if (list && list.items.length > 0) {
            const sortedItems = [...list.items].sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
            for (const item of sortedItems) {
              const timeSlot = Math.floor(new Date(item.created).getTime() / 6000);
              const dedupeKey = `${item.track_id || item.title}_${timeSlot}`;
              if (seenEvents.has(dedupeKey)) continue;
              seenEvents.add(dedupeKey);
              uniqueItemsCount++;

              const sec = item.listened_seconds || 0;
              dbTotalSec += sec;
              if (item.is_completed) dbCompleted++;
              if (item.is_skipped) dbSkipped++;

              const key = item.track_id || `${item.title}__${item.artist}`;
              if (!stats[key]) {
                stats[key] = {
                  trackId: item.track_id || '',
                  title: item.title || '',
                  artist: item.artist || '',
                  cover: undefined,
                  playCount: 1,
                  totalSeconds: sec,
                  lastPlayed: new Date(item.created).getTime()
                };
              } else {
                stats[key].playCount = Math.max(stats[key].playCount + 1, 1);
                stats[key].totalSeconds += sec;
              }
            }
          }
        } catch (e) {
          console.warn('Sync wave_analytics error:', e);
        }

        // 2. Fetch history records strictly for THIS user
        try {
          const historyList = await pb.collection('history').getList(1, 100, {
            filter: `user = "${currentUserId}"`,
            sort: '-updated'
          });
          if (historyList && historyList.items.length > 0) {
            for (const hRecord of historyList.items) {
              const tList = Array.isArray(hRecord.tracks_json) ? hRecord.tracks_json : [];
              for (const t of tList) {
                if (!t || !t.title) continue;
                const key = t.id || `${t.title}__${t.artist}`;
                if (!stats[key]) {
                  stats[key] = {
                    trackId: t.id || '',
                    title: t.title || '',
                    artist: t.artist || '',
                    cover: t.customCoverPath || t.originalCoverUrl || undefined,
                    playCount: 1,
                    totalSeconds: 0,
                    lastPlayed: Date.now()
                  };
                }
              }
            }
          }
        } catch (e) {
          console.warn('Sync history error:', e);
        }

        // 3. Fallback to local history tracks
        const historyTracks = usePlayerStore.getState().history || [];
        for (const t of historyTracks) {
          if (!t || !t.title) continue;
          const key = t.id || `${t.title}__${t.artist}`;
          if (!stats[key]) {
            stats[key] = {
              trackId: t.id || '',
              title: t.title || '',
              artist: t.artist || '',
              cover: t.customCoverPath || t.originalCoverUrl || undefined,
              playCount: 1,
              totalSeconds: 0,
              lastPlayed: Date.now()
            };
          }
        }

        let cloudPlays = 0;
        let cloudSec = 0;
        try {
          const cloudCustom = await pocketBaseService.getCloudCustomization(currentUserId);
          if (cloudCustom?.analytics) {
            cloudPlays = cloudCustom.analytics.totalPlays || 0;
            cloudSec = cloudCustom.analytics.totalSeconds || 0;
          }
        } catch {}

        const resolvedPlays = Math.max(uniqueItemsCount, get().totalPlays, Object.keys(stats).length, cloudPlays);
        let resolvedSec = Math.max(dbTotalSec, get().totalSeconds, cloudSec);
        if (resolvedPlays >= 5 && resolvedSec < resolvedPlays * 60) {
          resolvedSec = Math.max(resolvedSec, resolvedPlays * 165);
        }
        const newTopCovers = computeTopCovers(stats, historyTracks);

        set({
          totalPlays: resolvedPlays,
          totalSeconds: resolvedSec,
          completedPlays: Math.max(get().completedPlays, dbCompleted),
          skippedPlays: Math.max(get().skippedPlays, dbSkipped),
          trackStats: stats,
          topCovers: newTopCovers
        });

        saveToStorage({
          totalPlays: resolvedPlays,
          totalSeconds: resolvedSec,
          completedPlays: Math.max(get().completedPlays, dbCompleted),
          skippedPlays: Math.max(get().skippedPlays, dbSkipped),
          trackStats: stats
        });

        pocketBaseService.saveCloudCustomization(currentUserId, {
          analytics: {
            totalPlays: resolvedPlays,
            totalSeconds: resolvedSec,
            totalHoursFormatted: get().getTotalHoursFormatted(),
            topCovers: newTopCovers
          }
        }).catch(() => {});
      } catch (err) {
        console.warn('Analytics sync error:', err);
      }
    }
  };
});

if (typeof window !== 'undefined') {
  window.addEventListener('aura-sync-all-complete', () => {
    useAnalyticsStore.getState().syncWithDatabase();
  });
  window.addEventListener('aura-auth-changed', (e: any) => {
    const user = e.detail?.user;
    useAnalyticsStore.getState().loadUserAnalytics(user?.id);
    if (user?.id) {
      useAnalyticsStore.getState().syncWithDatabase();
    }
  });
}
