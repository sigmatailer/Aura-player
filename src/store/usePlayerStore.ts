import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PlayerState, SettingsState } from '../types';

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      queue: [],
      currentTrackIndex: -1,
      isPlaying: false,
      volume: 1.0,
      progress: 0,
      isShuffle: false,
      repeatMode: 'off',
      isFullscreen: false,
      isMiniPlayer: false,
      miniPlayerStyle: 'square',

      history: [],
      addToHistory: (track) => set((state) => {
        if (!track || !track.id) return state;
        const currentHist = state.history || [];
        const filtered = currentHist.filter(t => t.id !== track.id);
        return { history: [track, ...filtered].slice(0, 30) };
      }),
      
      eqPreset: 'flat',
      eqBands: [0, 0, 0, 0, 0, 0],
      eqPreAmp: 0,

      setQueue: (tracks) => set({ queue: tracks }),
      playContext: (tracks, index) => set({ queue: tracks, currentTrackIndex: index, isPlaying: true, progress: 0 }),
      
      addTrack: (track) => set((state) => {
        if (!track || !track.id) return state;
        const isDuplicate = state.queue.some(t => 
          t.id === track.id || 
          (t.filePath && track.filePath && t.filePath === track.filePath) ||
          (t.title && track.title && t.artist && track.artist &&
           t.title.trim().toLowerCase() === track.title.trim().toLowerCase() &&
           t.artist.trim().toLowerCase() === track.artist.trim().toLowerCase())
        );
        if (isDuplicate) return state;
        return { queue: [...state.queue, track] };
      }),

      removeTrack: (trackId) => set((state) => {
        const indexToRemove = state.queue.findIndex(t => t.id === trackId);
        if (indexToRemove === -1) return state;

        const newQueue = state.queue.filter(t => t.id !== trackId);
        let newCurrentTrackIndex = state.currentTrackIndex;
        let newIsPlaying = state.isPlaying;
        let newProgress = state.progress;

        if (indexToRemove < state.currentTrackIndex) {
          newCurrentTrackIndex--;
        } else if (indexToRemove === state.currentTrackIndex) {
          if (newQueue.length === 0) {
            newCurrentTrackIndex = -1;
            newIsPlaying = false;
            newProgress = 0;
          } else if (indexToRemove >= newQueue.length) {
            newCurrentTrackIndex = newQueue.length - 1;
            newProgress = 0;
          } else {
            newProgress = 0;
          }
        }

        return { 
          queue: newQueue,
          currentTrackIndex: newCurrentTrackIndex,
          isPlaying: newIsPlaying,
          progress: newProgress
        };
      }),

      playTrack: (index) => set({ 
        currentTrackIndex: index, 
        isPlaying: true,
        progress: 0
      }),

      togglePlayPause: () => set((state) => ({ 
        isPlaying: !state.isPlaying 
      })),

      nextTrack: (isNaturalEnd = false) => set((state) => {
        if (state.queue.length === 0) return state;
        
        if (isNaturalEnd && state.repeatMode === 'one') {
          return { progress: 0, isPlaying: true };
        }

        let nextIdx = state.currentTrackIndex + 1;
        if (nextIdx >= state.queue.length) {
          if (isNaturalEnd && state.repeatMode !== 'all') {
            return { isPlaying: false, progress: 0 };
          }
          nextIdx = 0;
        }
        
        if (state.isShuffle) {
          nextIdx = Math.floor(Math.random() * state.queue.length);
        }
        
        return { currentTrackIndex: nextIdx, isPlaying: true, progress: 0 };
      }),

      prevTrack: () => set((state) => {
        if (state.queue.length === 0) return state;
        if (state.progress > 3) {
          return { progress: 0 };
        }
        
        let prevIdx = state.currentTrackIndex - 1;
        if (prevIdx < 0) {
          prevIdx = state.queue.length - 1;
        }
        
        if (state.isShuffle) {
          prevIdx = Math.floor(Math.random() * state.queue.length);
        }
        
        return { currentTrackIndex: prevIdx, isPlaying: true, progress: 0 };
      }),

      setVolume: (volume) => set({ volume }),
      
      setProgress: (progress) => set({ progress }),

      setCustomCover: (trackId, customCoverPath) => set((state) => ({
        queue: state.queue.map(t => t.id === trackId ? { ...t, customCoverPath } : t)
      })),

      toggleShuffle: () => set((state) => ({ isShuffle: !state.isShuffle })),

      toggleRepeat: () => set((state) => {
        const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];
        const currentIdx = modes.indexOf(state.repeatMode);
        return { repeatMode: modes[(currentIdx + 1) % modes.length] };
      }),

      toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),
      
      toggleMiniPlayer: () => set((state) => ({ isMiniPlayer: !state.isMiniPlayer })),
      
      setMiniPlayerStyle: (style) => set({ miniPlayerStyle: style }),
      
      setEqPreset: (preset, bands, preAmp) => set({ eqPreset: preset, eqBands: bands, eqPreAmp: preAmp }),
      setEqBand: (index, value) => set((state) => {
        const newBands = [...state.eqBands];
        newBands[index] = value;
        return { eqBands: newBands, eqPreset: 'custom' };
      }),
      setEqPreAmp: (value) => set({ eqPreAmp: value, eqPreset: 'custom' }),
    }),
    {
      name: 'player-storage',
      partialize: (state) => ({ 
        queue: state.queue,
        currentTrackIndex: state.currentTrackIndex,
        history: state.history || [],
        volume: state.volume, 
        isShuffle: state.isShuffle, 
        repeatMode: state.repeatMode,
        miniPlayerStyle: state.miniPlayerStyle,
        eqPreset: state.eqPreset,
        eqBands: state.eqBands,
        eqPreAmp: state.eqPreAmp
      }),
    }
  )
);

export const useSettingsStore = create<SettingsState>((set) => ({
  geminiApiKey: localStorage.getItem('geminiApiKey') || null,
  setGeminiApiKey: (key) => {
    localStorage.setItem('geminiApiKey', key);
    set({ geminiApiKey: key });
  },
  yandexToken: localStorage.getItem('yandex_access_token') || null,
  setYandexToken: (token) => {
    if (token) {
      localStorage.setItem('yandex_access_token', token);
    } else {
      localStorage.removeItem('yandex_access_token');
    }
    set({ yandexToken: token });
  }
}));
