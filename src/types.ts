export interface Track {
  id: string; // Уникальный идентификатор (например, hash пути)
  filePath: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // В секундах
  genre?: string;
  
  // Обложки
  originalCoverUrl: string | null; // Blob URL из встроенных тегов
  customCoverPath: string | null;  // Локальный путь к кастомной обложке (если есть)
  
  // Кэш
  cachedFilePath?: string | null;  // Локальный путь к закэшированному файлу (если закэширован)
}

export interface PlayerState {
  queue: Track[];
  currentTrackIndex: number;
  isPlaying: boolean;
  volume: number;
  progress: number; // В секундах
  isShuffle: boolean;
  repeatMode: 'off' | 'all' | 'one';
  isFullscreen: boolean;
  isMiniPlayer: boolean;
  miniPlayerStyle: 'square' | 'rectangle' | 'island';
  
  // History
  history: Track[];
  addToHistory: (track: Track) => void;
  clearHistory: () => void;
  isHistoryDrawerOpen: boolean;
  setHistoryDrawerOpen: (open: boolean) => void;

  // EQ
  eqPreset: string;
  eqBands: number[]; // e.g. [0, 0, 0, 0, 0, 0] for 6 bands
  eqPreAmp: number;
  
  // Действия
  setQueue: (tracks: Track[]) => void;
  clearQueue: () => void;
  playContext: (tracks: Track[], index: number) => void;
  addTrack: (track: Track) => void;
  addTracks: (tracks: Track[]) => void;
  removeTrack: (trackId: string) => void;
  playTrack: (index: number) => void;
  togglePlayPause: () => void;
  nextTrack: (isNaturalEnd?: boolean) => void;
  prevTrack: () => void;
  setVolume: (volume: number) => void;
  setProgress: (progress: number) => void;
  setCustomCover: (trackId: string, customCoverPath: string) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleFullscreen: () => void;
  toggleMiniPlayer: () => void;
  setMiniPlayerStyle: (style: 'square' | 'rectangle' | 'island') => void;
  
  setEqPreset: (preset: string, bands: number[], preAmp: number) => void;
  setEqBand: (index: number, value: number) => void;
  setEqPreAmp: (value: number) => void;
}

export interface SettingsState {
  geminiApiKey: string | null;
  setGeminiApiKey: (key: string) => void;
  yandexToken: string | null;
  setYandexToken: (token: string | null) => void;
}
