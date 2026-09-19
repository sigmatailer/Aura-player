import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Theme {
  id: string;
  name: string;
  colors: {
    bgMain: string;
    bgSurface: string;
    bgSurfaceHover: string;
    textMain: string;
    textSecondary: string;
    borderMain: string;
    accent: string;
    accentHover: string;
  };
}

export const PRESET_THEMES: Theme[] = [
  {
    id: 'dark-orange',
    name: 'Темная (Оригинал)',
    colors: {
      bgMain: '#0a0a0a',
      bgSurface: '#111111',
      bgSurfaceHover: '#1a1a1a',
      textMain: '#ffffff',
      textSecondary: '#a3a3a3',
      borderMain: '#222222',
      accent: '#ff5500',
      accentHover: '#ff4400'
    }
  },
  {
    id: 'light-orange',
    name: 'Светлая',
    colors: {
      bgMain: '#f5f5f5',
      bgSurface: '#ffffff',
      bgSurfaceHover: '#e0e0e0',
      textMain: '#000000',
      textSecondary: '#444444',
      borderMain: '#dddddd',
      accent: '#ff5500',
      accentHover: '#cc4400'
    }
  },
  {
    id: 'dark-blue',
    name: 'Океан',
    colors: {
      bgMain: '#050a15',
      bgSurface: '#0a1224',
      bgSurfaceHover: '#121c36',
      textMain: '#ffffff',
      textSecondary: '#9bb0cc',
      borderMain: '#1c2841',
      accent: '#0066ff',
      accentHover: '#0052cc'
    }
  },
  {
    id: 'pitch-black',
    name: 'AMOLED',
    colors: {
      bgMain: '#000000',
      bgSurface: '#050505',
      bgSurfaceHover: '#0a0a0a',
      textMain: '#ffffff',
      textSecondary: '#9e9e9e',
      borderMain: '#111111',
      accent: '#ff5500',
      accentHover: '#ff4400'
    }
  }
];

export interface FontOption {
  id: string;
  name: string;
  family: string;
  category: string;
  preview: string;
}

export const AVAILABLE_FONTS: FontOption[] = [
  { id: 'inter', name: 'Inter', family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", category: 'Стандартный', preview: 'Aura Music Player 2026' },
  { id: 'montserrat', name: 'Montserrat', family: "'Montserrat', sans-serif", category: 'Геометричный', preview: 'Aura Music Player 2026' },
  { id: 'jetbrains', name: 'JetBrains Mono', family: "'JetBrains Mono', monospace", category: 'Моноширинный', preview: 'Aura Music Player 2026' },
  { id: 'unbounded', name: 'Unbounded', family: "'Unbounded', sans-serif", category: 'Футуристичный', preview: 'Aura Music Player 2026' },
  { id: 'manrope', name: 'Manrope', family: "'Manrope', sans-serif", category: 'Премиальный', preview: 'Aura Music Player 2026' },
  { id: 'rubik', name: 'Rubik', family: "'Rubik', sans-serif", category: 'Округлый', preview: 'Aura Music Player 2026' },
  { id: 'comfortaa', name: 'Comfortaa', family: "'Comfortaa', cursive", category: 'Мягкий', preview: 'Aura Music Player 2026' },
  { id: 'oswald', name: 'Oswald', family: "'Oswald', sans-serif", category: 'Плакатный', preview: 'Aura Music Player 2026' },
  { id: 'russo', name: 'Russo One', family: "'Russo One', sans-serif", category: 'Сай-фай', preview: 'Aura Music Player 2026' },
  { id: 'playfair', name: 'Playfair Display', family: "'Playfair Display', serif", category: 'С засечками', preview: 'Aura Music Player 2026' },
  { id: 'caveat', name: 'Caveat', family: "'Caveat', cursive", category: 'Рукописный', preview: 'Aura Music Player 2026' },
  { id: 'pixel', name: 'Press Start 2P', family: "'Press Start 2P', monospace", category: 'Ретро 8-bit', preview: 'Aura 2026' },
  { id: 'system', name: 'Segoe UI (Система)', family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", category: 'Системный', preview: 'Aura Music Player 2026' },
];

export interface WallpaperPreset {
  id: string;
  name: string;
  url: string;
  preview: string;
}

export const PRESET_WALLPAPERS: WallpaperPreset[] = [
  {
    id: 'cyberpunk',
    name: 'Неоновый город',
    url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=1920&auto=format&fit=crop',
    preview: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=300&auto=format&fit=crop'
  },
  {
    id: 'lofi',
    name: 'Уютный вечер',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1920&auto=format&fit=crop',
    preview: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=300&auto=format&fit=crop'
  },
  {
    id: 'space',
    name: 'Космос и звёзды',
    url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=1920&auto=format&fit=crop',
    preview: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=300&auto=format&fit=crop'
  },
  {
    id: 'minimal-dark',
    name: 'Тёмные волны',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1920&auto=format&fit=crop',
    preview: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=300&auto=format&fit=crop'
  }
];

export const TRACK_FONT_OPTIONS: FontOption[] = [
  { id: 'same', name: 'Синхронно с интерфейсом', family: 'inherit', category: 'Авто', preview: 'Aura Music Player 2026' },
  ...AVAILABLE_FONTS
];

export const isVideoUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
  return cleanUrl.endsWith('.mp4') || 
         cleanUrl.endsWith('.webm') || 
         cleanUrl.endsWith('.mov') || 
         cleanUrl.endsWith('.mkv') || 
         cleanUrl.startsWith('data:video/');
};

interface ThemeStore {
  currentThemeId: string;
  customThemes: Theme[];
  fontId: string;
  trackFontId: string;
  customWallpaper: string | null;
  wallpaperBlur: number;
  wallpaperOpacity: number;
  wallpaperSpeed: number;
  customCover: string | null;
  coverSpeed: number;
  setTheme: (id: string) => void;
  addCustomTheme: (theme: Theme) => void;
  deleteCustomTheme: (id: string) => void;
  getActiveTheme: () => Theme;
  setFontId: (id: string) => void;
  getActiveFont: () => FontOption;
  setTrackFontId: (id: string) => void;
  getActiveTrackFont: () => FontOption;
  setWallpaper: (url: string | null) => void;
  setWallpaperBlur: (blur: number) => void;
  setWallpaperOpacity: (opacity: number) => void;
  setWallpaperSpeed: (speed: number) => void;
  setCustomCover: (url: string | null) => void;
  setCoverSpeed: (speed: number) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      currentThemeId: 'dark-orange',
      customThemes: [],
      fontId: 'inter',
      trackFontId: 'same',
      customWallpaper: null,
      wallpaperBlur: 8,
      wallpaperOpacity: 45,
      wallpaperSpeed: 1.0,
      customCover: null,
      coverSpeed: 1.0,
      setTheme: (id) => set({ currentThemeId: id }),
      addCustomTheme: (theme) => set((state) => ({ customThemes: [...state.customThemes, theme], currentThemeId: theme.id })),
      deleteCustomTheme: (id) => set((state) => {
        const newCustomThemes = state.customThemes.filter(t => t.id !== id);
        return {
          customThemes: newCustomThemes,
          currentThemeId: state.currentThemeId === id ? 'dark-orange' : state.currentThemeId
        };
      }),
      getActiveTheme: () => {
        const state = get();
        const custom = state.customThemes.find(t => t.id === state.currentThemeId);
        if (custom) return custom;
        const preset = PRESET_THEMES.find(t => t.id === state.currentThemeId);
        return preset || PRESET_THEMES[0];
      },
      setFontId: (id) => set({ fontId: id }),
      getActiveFont: () => {
        const state = get();
        const found = AVAILABLE_FONTS.find(f => f.id === state.fontId);
        return found || AVAILABLE_FONTS[0];
      },
      setTrackFontId: (id) => set({ trackFontId: id }),
      getActiveTrackFont: () => {
        const state = get();
        if (!state.trackFontId || state.trackFontId === 'same') {
          return state.getActiveFont();
        }
        const found = AVAILABLE_FONTS.find(f => f.id === state.trackFontId);
        return found || state.getActiveFont();
      },
      setWallpaper: (url) => set({ customWallpaper: url }),
      setWallpaperBlur: (blur) => set({ wallpaperBlur: blur }),
      setWallpaperOpacity: (opacity) => set({ wallpaperOpacity: opacity }),
      setWallpaperSpeed: (speed) => set({ wallpaperSpeed: speed }),
      setCustomCover: (url) => set({ customCover: url }),
      setCoverSpeed: (speed) => set({ coverSpeed: speed }),
    }),
    {
      name: 'music-player-theme',
    }
  )
);

