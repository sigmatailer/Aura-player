import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PlayerState, SettingsState, Track } from '../types';
import { audioService } from '../services/AudioService';

const getTrackKey = (track: Track | undefined | null): string => {
  if (!track) return '';
  return (track.id || track.filePath || '').toLowerCase();
};

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
      isWaveActive: false,
      setIsWaveActive: (active: boolean) => set({ isWaveActive: active }),

      playedShuffleTrackIds: [],
      shuffleHistory: [],
      shuffleHistoryIndex: -1,

      history: [],
      addToHistory: (track) => set((state) => {
        if (!track || !track.id) return state;
        const currentHist = state.history || [];
        const trackKey = (track.filePath || track.id).toLowerCase();
        const filtered = currentHist.filter(t => {
          const k = (t.filePath || t.id).toLowerCase();
          return k !== trackKey;
        });
        return { history: [track, ...filtered].slice(0, 1000) };
      }),
      clearHistory: () => set({ history: [] }),
      isHistoryDrawerOpen: false,
      setHistoryDrawerOpen: (open) => set({ isHistoryDrawerOpen: open }),
      
      eqPreset: 'flat',
      eqBands: [0, 0, 0, 0, 0, 0],
      eqPreAmp: 0,

      setQueue: (tracks) => set((state) => {
        const trackKeys = new Set(tracks.map(getTrackKey));
        const preservedPlayed = (state.playedShuffleTrackIds || []).filter(k => trackKeys.has(k));
        const curTrack = state.currentTrackIndex >= 0 ? tracks[state.currentTrackIndex] : null;
        const curKey = getTrackKey(curTrack);
        const finalPlayed = curKey && !preservedPlayed.includes(curKey) 
          ? [...preservedPlayed, curKey] 
          : preservedPlayed;

        return { 
          queue: tracks,
          playedShuffleTrackIds: finalPlayed
        };
      }),
      clearQueue: () => {
        try {
          audioService.stop();
        } catch (e) {
          console.error('Error stopping audio on clearQueue:', e);
        }
        set({
          queue: [],
          currentTrackIndex: -1,
          isPlaying: false,
          progress: 0,
          playbackContext: undefined,
          playedShuffleTrackIds: [],
          shuffleHistory: [],
          shuffleHistoryIndex: -1,
        });
      },
      playbackContext: undefined,
      playContext: (tracks, index, contextInfo) => {
        const cur = tracks[index];
        const curKey = getTrackKey(cur);
        const isObj = typeof contextInfo === 'object' && contextInfo !== null;
        const derivedContext = (isObj && contextInfo.title) ? {
          title: contextInfo.title,
          type: (contextInfo.type as any) || 'playlist',
          coverUrl: contextInfo.coverUrl
        } : (cur?.id?.startsWith('vibe_') 
          ? { title: 'Моя волна', type: 'wave' as const } 
          : undefined);
        set({ 
          queue: tracks, 
          currentTrackIndex: index, 
          isPlaying: true, 
          progress: 0,
          playbackContext: derivedContext,
          playedShuffleTrackIds: curKey ? [curKey] : [],
          shuffleHistory: index >= 0 ? [index] : [],
          shuffleHistoryIndex: index >= 0 ? 0 : -1,
        });
      },
      
      addTrack: (track) => set((state) => {
        const trackKey = getTrackKey(track);
        // If track is re-added to queue, allow it to be picked again in shuffle
        const newPlayed = (state.playedShuffleTrackIds || []).filter(k => k !== trackKey);
        return { 
          queue: [...state.queue, track],
          playedShuffleTrackIds: newPlayed,
        };
      }),

      addTracks: (tracks) => set((state) => {
        const addedKeys = new Set(tracks.map(getTrackKey));
        const newPlayed = (state.playedShuffleTrackIds || []).filter(k => !addedKeys.has(k));
        return { 
          queue: [...state.queue, ...tracks],
          playedShuffleTrackIds: newPlayed,
        };
      }),

      removeTrack: (trackId) => set((state) => {
        const indexToRemove = state.queue.findIndex(t => t.id === trackId);
        if (indexToRemove === -1) return state;

        const removedTrack = state.queue[indexToRemove];
        const removedKey = getTrackKey(removedTrack);
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

        const newPlayed = (state.playedShuffleTrackIds || []).filter(k => k !== removedKey);
        const newShuffleHistory = (state.shuffleHistory || [])
          .filter(idx => idx !== indexToRemove)
          .map(idx => (idx > indexToRemove ? idx - 1 : idx));
        const newShuffleHistoryIndex = Math.min(
          Math.max(0, state.shuffleHistoryIndex ?? 0),
          Math.max(0, newShuffleHistory.length - 1)
        );

        return { 
          queue: newQueue,
          currentTrackIndex: newCurrentTrackIndex,
          isPlaying: newIsPlaying,
          progress: newProgress,
          playedShuffleTrackIds: newPlayed,
          shuffleHistory: newShuffleHistory,
          shuffleHistoryIndex: newShuffleHistoryIndex,
        };
      }),

      playTrack: (index) => set((state) => {
        const track = state.queue[index];
        const trackKey = getTrackKey(track);
        const played = state.playedShuffleTrackIds || [];
        const newPlayed = trackKey && !played.includes(trackKey) ? [...played, trackKey] : played;

        const hist = state.shuffleHistory || [];
        const hIdx = state.shuffleHistoryIndex ?? -1;
        const sliced = hIdx >= 0 ? hist.slice(0, hIdx + 1) : [];
        const newHistory = [...sliced, index];

        return {
          currentTrackIndex: index, 
          isPlaying: true,
          progress: 0,
          playedShuffleTrackIds: newPlayed,
          shuffleHistory: newHistory,
          shuffleHistoryIndex: newHistory.length - 1,
        };
      }),

      togglePlayPause: () => set((state) => ({ 
        isPlaying: !state.isPlaying 
      })),

      nextTrack: (isNaturalEnd = false) => set((state) => {
        if (state.queue.length === 0) return state;
        
        if (isNaturalEnd && state.repeatMode === 'one') {
          return { progress: 0, isPlaying: true };
        }

        // LINEAR PLAYBACK (isShuffle === false)
        if (!state.isShuffle) {
          let nextIdx = state.currentTrackIndex + 1;
          if (nextIdx >= state.queue.length) {
            if (isNaturalEnd && state.repeatMode !== 'all') {
              return { isPlaying: false, progress: 0 };
            }
            nextIdx = 0;
          }
          return { currentTrackIndex: nextIdx, isPlaying: true, progress: 0 };
        }

        // SMART SHUFFLE PLAYBACK (isShuffle === true)
        const curTrack = state.currentTrackIndex >= 0 ? state.queue[state.currentTrackIndex] : null;
        const curKey = getTrackKey(curTrack);
        let played = state.playedShuffleTrackIds || [];
        if (curKey && !played.includes(curKey)) {
          played = [...played, curKey];
        }

        const shuffleHist = state.shuffleHistory || [];
        const histIdx = state.shuffleHistoryIndex ?? -1;

        // If user previously clicked 'prev' and is stepping forward through already-visited shuffle history
        if (histIdx >= 0 && histIdx < shuffleHist.length - 1) {
          const nextHistIdx = histIdx + 1;
          const targetQueueIdx = shuffleHist[nextHistIdx];
          if (targetQueueIdx >= 0 && targetQueueIdx < state.queue.length) {
            return {
              currentTrackIndex: targetQueueIdx,
              shuffleHistoryIndex: nextHistIdx,
              isPlaying: true,
              progress: 0,
              playedShuffleTrackIds: played,
            };
          }
        }

        // Find candidate tracks that have NOT been played yet in this shuffle cycle
        const unplayedCandidateIndices = state.queue
          .map((t, idx) => ({ key: getTrackKey(t), idx }))
          .filter(item => item.idx !== state.currentTrackIndex && !played.includes(item.key))
          .map(item => item.idx);

        // If there are unplayed tracks available in queue, pick a truly random one
        if (unplayedCandidateIndices.length > 0) {
          const randomPick = unplayedCandidateIndices[Math.floor(Math.random() * unplayedCandidateIndices.length)];
          const chosenTrack = state.queue[randomPick];
          const chosenKey = getTrackKey(chosenTrack);
          const newPlayed = chosenKey ? [...played, chosenKey] : played;
          const newHistory = [...shuffleHist.slice(0, Math.max(0, histIdx + 1)), randomPick];

          return {
            currentTrackIndex: randomPick,
            shuffleHistory: newHistory,
            shuffleHistoryIndex: newHistory.length - 1,
            playedShuffleTrackIds: newPlayed,
            isPlaying: true,
            progress: 0,
          };
        }

        // All tracks in queue have been played!
        if (isNaturalEnd && state.repeatMode !== 'all') {
          // Natural completion of the entire queue without repeat
          return {
            isPlaying: false,
            progress: 0,
            playedShuffleTrackIds: [],
            shuffleHistory: [],
            shuffleHistoryIndex: -1,
          };
        }

        // Repeat 'all' is active OR user manually clicked 'next' button
        // Reset shuffle cycle and pick a random track (other than current if queue > 1)
        const candidateIndices = state.queue
          .map((_, idx) => idx)
          .filter(idx => state.queue.length <= 1 || idx !== state.currentTrackIndex);

        const resetTargetIdx = candidateIndices.length > 0
          ? candidateIndices[Math.floor(Math.random() * candidateIndices.length)]
          : 0;

        const resetTrack = state.queue[resetTargetIdx];
        const resetKey = getTrackKey(resetTrack);

        return {
          currentTrackIndex: resetTargetIdx,
          shuffleHistory: [resetTargetIdx],
          shuffleHistoryIndex: 0,
          playedShuffleTrackIds: resetKey ? [resetKey] : [],
          isPlaying: true,
          progress: 0,
        };
      }),

      prevTrack: () => set((state) => {
        if (state.queue.length === 0) return state;
        if (state.progress > 3) {
          return { progress: 0 };
        }
        
        // LINEAR PLAYBACK
        if (!state.isShuffle) {
          let prevIdx = state.currentTrackIndex - 1;
          if (prevIdx < 0) {
            prevIdx = state.queue.length - 1;
          }
          return { currentTrackIndex: prevIdx, isPlaying: true, progress: 0 };
        }

        // SMART SHUFFLE: step backward in shuffle history
        const shuffleHist = state.shuffleHistory || [];
        const histIdx = state.shuffleHistoryIndex ?? -1;

        if (histIdx > 0 && histIdx < shuffleHist.length) {
          const prevHistIdx = histIdx - 1;
          const targetQueueIdx = shuffleHist[prevHistIdx];
          if (targetQueueIdx >= 0 && targetQueueIdx < state.queue.length) {
            return {
              currentTrackIndex: targetQueueIdx,
              shuffleHistoryIndex: prevHistIdx,
              isPlaying: true,
              progress: 0,
            };
          }
        }

        // At beginning of history or no history
        return { progress: 0 };
      }),

      setVolume: (volume) => set({ volume }),
      
      setProgress: (progress) => set({ progress }),

      setCustomCover: (trackId, customCoverPath) => set((state) => ({
        queue: state.queue.map(t => t.id === trackId ? { ...t, customCoverPath } : t)
      })),

      toggleShuffle: () => set((state) => {
        const nextShuffle = !state.isShuffle;
        if (nextShuffle) {
          const curTrack = state.currentTrackIndex >= 0 ? state.queue[state.currentTrackIndex] : null;
          const curKey = getTrackKey(curTrack);
          return {
            isShuffle: true,
            playedShuffleTrackIds: curKey ? [curKey] : [],
            shuffleHistory: state.currentTrackIndex >= 0 ? [state.currentTrackIndex] : [],
            shuffleHistoryIndex: state.currentTrackIndex >= 0 ? 0 : -1,
          };
        }
        return { isShuffle: false };
      }),

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
        eqPreAmp: state.eqPreAmp,
        playedShuffleTrackIds: state.playedShuffleTrackIds || [],
        shuffleHistory: state.shuffleHistory || [],
        shuffleHistoryIndex: state.shuffleHistoryIndex ?? -1,
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
