import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './useAuthStore';
import { pocketBaseService } from '../services/PocketBaseService';

export interface Theme {
  id: string;
  name: string;
  swatch?: { c1: string; c2: string };
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

export function getContrastColor(hexColor: string): string {
  if (!hexColor) return '#ffffff';
  let hex = hexColor.trim().replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 160 ? '#000000' : '#ffffff';
  }
  return '#ffffff';
}

export const PRESET_THEMES: Theme[] = [
  {
    id: 'track',
    name: 'Под трек',
    swatch: { c1: '#ffffff', c2: '#2a2a32' },
    colors: {
      bgMain: '#0a0a0c',
      bgSurface: '#121216',
      bgSurfaceHover: '#1c1c22',
      textMain: '#ffffff',
      textSecondary: '#888888',
      borderMain: '#222226',
      accent: '#ff5500',
      accentHover: '#ff4400'
    }
  },
  {
    id: 'neutral',
    name: 'Neutral',
    swatch: { c1: '#ffffff', c2: '#2a2a30' },
    colors: {
      bgMain: '#121214',
      bgSurface: '#18181c',
      bgSurfaceHover: '#222228',
      textMain: '#ffffff',
      textSecondary: '#888888',
      borderMain: '#26262e',
      accent: '#ffffff',
      accentHover: '#e0e0e0'
    }
  },
  {
    id: 'amoled',
    name: 'AMOLED',
    swatch: { c1: '#ffffff', c2: '#111111' },
    colors: {
      bgMain: '#000000',
      bgSurface: '#080808',
      bgSurfaceHover: '#121212',
      textMain: '#ffffff',
      textSecondary: '#777777',
      borderMain: '#1a1a1a',
      accent: '#ffffff',
      accentHover: '#e0e0e0'
    }
  },
  {
    id: 'crimson',
    name: 'Crimson',
    swatch: { c1: '#ff2e4d', c2: '#b91c1c' },
    colors: {
      bgMain: '#0f0608',
      bgSurface: '#170a0e',
      bgSurfaceHover: '#220e15',
      textMain: '#ffffff',
      textSecondary: '#a36d77',
      borderMain: '#2e141c',
      accent: '#ff2e4d',
      accentHover: '#e11d48'
    }
  },
  {
    id: 'nord',
    name: 'Nord',
    swatch: { c1: '#88c0d0', c2: '#5e81ac' },
    colors: {
      bgMain: '#0c1015',
      bgSurface: '#121820',
      bgSurfaceHover: '#1a222d',
      textMain: '#ffffff',
      textSecondary: '#7a8e9e',
      borderMain: '#202b38',
      accent: '#88c0d0',
      accentHover: '#81a1c1'
    }
  },
  {
    id: 'sky',
    name: 'Sky',
    swatch: { c1: '#38bdf8', c2: '#0284c7' },
    colors: {
      bgMain: '#08101a',
      bgSurface: '#0d1826',
      bgSurfaceHover: '#132338',
      textMain: '#ffffff',
      textSecondary: '#728ca6',
      borderMain: '#182b42',
      accent: '#38bdf8',
      accentHover: '#0ea5e9'
    }
  },
  {
    id: 'mint',
    name: 'Mint',
    swatch: { c1: '#22c55e', c2: '#16a34a' },
    colors: {
      bgMain: '#06130b',
      bgSurface: '#0b1d12',
      bgSurfaceHover: '#102919',
      textMain: '#ffffff',
      textSecondary: '#6e967a',
      borderMain: '#153621',
      accent: '#22c55e',
      accentHover: '#16a34a'
    }
  },
  {
    id: 'violet',
    name: 'Violet',
    swatch: { c1: '#a855f7', c2: '#7e22ce' },
    colors: {
      bgMain: '#0f0719',
      bgSurface: '#160b24',
      bgSurfaceHover: '#201034',
      textMain: '#ffffff',
      textSecondary: '#8d75a6',
      borderMain: '#2b1545',
      accent: '#a855f7',
      accentHover: '#9333ea'
    }
  },
  {
    id: 'blossom',
    name: 'Blossom',
    swatch: { c1: '#ec4899', c2: '#be185d' },
    colors: {
      bgMain: '#140610',
      bgSurface: '#1e0918',
      bgSurfaceHover: '#2a0d22',
      textMain: '#ffffff',
      textSecondary: '#9c6f8a',
      borderMain: '#36122c',
      accent: '#ec4899',
      accentHover: '#db2777'
    }
  },
  {
    id: 'sakura',
    name: 'Sakura',
    swatch: { c1: '#f472b6', c2: '#db2777' },
    colors: {
      bgMain: '#13080e',
      bgSurface: '#1c0c15',
      bgSurfaceHover: '#27111e',
      textMain: '#ffffff',
      textSecondary: '#a1788d',
      borderMain: '#351729',
      accent: '#f472b6',
      accentHover: '#ec4899'
    }
  },
  {
    id: 'terminal',
    name: 'Terminal',
    swatch: { c1: '#22c55e', c2: '#15803d' },
    colors: {
      bgMain: '#030d05',
      bgSurface: '#061408',
      bgSurfaceHover: '#0a1d0d',
      textMain: '#ffffff',
      textSecondary: '#5a825f',
      borderMain: '#0f2913',
      accent: '#22c55e',
      accentHover: '#16a34a'
    }
  },
  {
    id: 'aqua',
    name: 'Aqua',
    swatch: { c1: '#06b6d4', c2: '#0891b2' },
    colors: {
      bgMain: '#041014',
      bgSurface: '#08171d',
      bgSurfaceHover: '#0c222b',
      textMain: '#ffffff',
      textSecondary: '#668b94',
      borderMain: '#102e3b',
      accent: '#06b6d4',
      accentHover: '#0891b2'
    }
  },
  {
    id: 'sunset',
    name: 'Sunset',
    swatch: { c1: '#f97316', c2: '#ea580c' },
    colors: {
      bgMain: '#120803',
      bgSurface: '#1a0c05',
      bgSurfaceHover: '#261208',
      textMain: '#ffffff',
      textSecondary: '#9e7964',
      borderMain: '#33190b',
      accent: '#f97316',
      accentHover: '#ea580c'
    }
  },
  {
    id: 'slate',
    name: 'Slate',
    swatch: { c1: '#64748b', c2: '#475569' },
    colors: {
      bgMain: '#0c0f14',
      bgSurface: '#12171f',
      bgSurfaceHover: '#18202b',
      textMain: '#ffffff',
      textSecondary: '#7b8594',
      borderMain: '#202937',
      accent: '#64748b',
      accentHover: '#475569'
    }
  }
];

export interface FontOption {
  id: string;
  name: string;
  family: string;
  category: 'system' | 'modern' | 'serif' | 'mono' | 'hand' | 'deco' | 'game' | string;
  sample?: string;
  preview?: string;
}

export const AVAILABLE_FONTS: FontOption[] = [
  // System
  { id: 'default', name: 'Default', family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", category: 'system', sample: 'Aa' },
  { id: 'segoe', name: 'Segoe UI', family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", category: 'system', sample: 'Aa' },
  { id: 'arial', name: 'Arial', family: "Arial, Helvetica, sans-serif", category: 'system', sample: 'Aa' },
  { id: 'tahoma', name: 'Tahoma', family: "Tahoma, Verdana, sans-serif", category: 'system', sample: 'Aa' },
  { id: 'trebuchet', name: 'Trebuchet MS', family: "'Trebuchet MS', sans-serif", category: 'system', sample: 'Aa' },
  { id: 'verdana', name: 'Verdana', family: "Verdana, Geneva, sans-serif", category: 'system', sample: 'Aa' },
  { id: 'impact', name: 'Impact', family: "Impact, Charcoal, sans-serif", category: 'system', sample: 'Aa' },

  // Modern
  { id: 'inter', name: 'Inter', family: "'Inter', sans-serif", category: 'modern', sample: 'Aa' },
  { id: 'montserrat', name: 'Montserrat', family: "'Montserrat', sans-serif", category: 'modern', sample: 'Aa' },
  { id: 'manrope', name: 'Manrope', family: "'Manrope', sans-serif", category: 'modern', sample: 'Aa' },
  { id: 'rubik', name: 'Rubik', family: "'Rubik', sans-serif", category: 'modern', sample: 'Aa' },
  { id: 'unbounded', name: 'Unbounded', family: "'Unbounded', sans-serif", category: 'modern', sample: 'Aa' },
  { id: 'roboto', name: 'Roboto', family: "'Roboto', sans-serif", category: 'modern', sample: 'Aa' },
  { id: 'poppins', name: 'Poppins', family: "'Poppins', sans-serif", category: 'modern', sample: 'Aa' },
  { id: 'open-sans', name: 'Open Sans', family: "'Open Sans', sans-serif", category: 'modern', sample: 'Aa' },
  { id: 'nunito', name: 'Nunito', family: "'Nunito', sans-serif", category: 'modern', sample: 'Aa' },
  { id: 'raleway', name: 'Raleway', family: "'Raleway', sans-serif", category: 'modern', sample: 'Aa' },

  // Serif
  { id: 'playfair', name: 'Playfair Display', family: "'Playfair Display', serif", category: 'serif', sample: 'Aa' },
  { id: 'georgia', name: 'Georgia', family: "Georgia, serif", category: 'serif', sample: 'Aa' },
  { id: 'times', name: 'Times New Roman', family: "'Times New Roman', Times, serif", category: 'serif', sample: 'Aa' },
  { id: 'cinzel', name: 'Cinzel', family: "'Cinzel', serif", category: 'serif', sample: 'Aa' },
  { id: 'merriweather', name: 'Merriweather', family: "'Merriweather', serif", category: 'serif', sample: 'Aa' },

  // Mono
  { id: 'jetbrains', name: 'JetBrains Mono', family: "'JetBrains Mono', monospace", category: 'mono', sample: 'Aa' },
  { id: 'fira-code', name: 'Fira Code', family: "'Fira Code', monospace", category: 'mono', sample: 'Aa' },
  { id: 'consolas', name: 'Consolas', family: "Consolas, 'Courier New', monospace", category: 'mono', sample: 'Aa' },
  { id: 'courier', name: 'Courier New', family: "'Courier New', Courier, monospace", category: 'mono', sample: 'Aa' },
  { id: 'space-mono', name: 'Space Mono', family: "'Space Mono', monospace", category: 'mono', sample: 'Aa' },

  // Hand
  { id: 'caveat', name: 'Caveat', family: "'Caveat', cursive", category: 'hand', sample: 'Aa' },
  { id: 'comfortaa', name: 'Comfortaa', family: "'Comfortaa', cursive", category: 'hand', sample: 'Aa' },
  { id: 'pacifico', name: 'Pacifico', family: "'Pacifico', cursive", category: 'hand', sample: 'Aa' },
  { id: 'marck', name: 'Marck Script', family: "'Marck Script', cursive", category: 'hand', sample: 'Aa' },
  { id: 'bad-script', name: 'Bad Script', family: "'Bad Script', cursive", category: 'hand', sample: 'Aa' },

  // Deco
  { id: 'oswald', name: 'Oswald', family: "'Oswald', sans-serif", category: 'deco', sample: 'Aa' },
  { id: 'russo', name: 'Russo One', family: "'Russo One', sans-serif", category: 'deco', sample: 'Aa' },
  { id: 'bebas', name: 'Bebas Neue', family: "'Bebas Neue', sans-serif", category: 'deco', sample: 'Aa' },
  { id: 'lobster', name: 'Lobster', family: "'Lobster', cursive", category: 'deco', sample: 'Aa' },

  // Game
  { id: 'pixel', name: 'Press Start 2P', family: "'Press Start 2P', monospace", category: 'game', sample: 'Aa' },
  { id: 'silkscreen', name: 'Silkscreen', family: "'Silkscreen', monospace", category: 'game', sample: 'Aa' },
  { id: 'vt323', name: 'VT323', family: "'VT323', monospace", category: 'game', sample: 'Aa' },
  { id: 'orbitron', name: 'Orbitron', family: "'Orbitron', sans-serif", category: 'game', sample: 'Aa' }
];

export interface WallpaperPreset {
  id: string;
  name: string;
  url: string;
  preview: string;
}

export interface MediaLibraryItem {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'gif' | 'video';
  thumbnail?: string;
  createdAt: number;
}

export interface CustomSlotItem {
  id: string;
  type: 'image' | 'gif' | 'video';
  url: string;
  name?: string;
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
         cleanUrl.startsWith('data:video/') ||
         (cleanUrl.startsWith('blob:') && !cleanUrl.includes('image'));
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
  customSlots: (CustomSlotItem | null)[];
  mediaLibrary: MediaLibraryItem[];
  addMediaItem: (item: MediaLibraryItem) => void;
  removeMediaItem: (id: string) => void;
  setSlotMedia: (slotIndex: number, item: CustomSlotItem | null) => void;
  clearSlot: (slotIndex: number) => void;
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
  fontSize: number;
  setFontSize: (size: number) => void;
  fontWeight: string;
  setFontWeight: (weight: string) => void;
  transparencyEnabled: boolean;
  setTransparencyEnabled: (enabled: boolean) => void;
  windowOpacity: number;
  setWindowOpacity: (opacity: number) => void;
  glassStrength: number;
  setGlassStrength: (strength: number) => void;
  glassBlur: number;
  setGlassBlur: (blur: number) => void;
  trackTheme: Theme | null;
  setTrackTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      currentThemeId: 'dark-orange',
      trackTheme: null,
      setTrackTheme: (trackTheme) => set({ trackTheme }),
      customThemes: [],
      fontId: 'default',
      trackFontId: 'same',
      fontSize: 16,
      fontWeight: 'Auto',
      transparencyEnabled: true,
      windowOpacity: 63,
      glassStrength: 70,
      glassBlur: 24,
      setTransparencyEnabled: (transparencyEnabled) => set({ transparencyEnabled }),
      setWindowOpacity: (windowOpacity) => set({ windowOpacity }),
      setGlassStrength: (glassStrength) => set({ glassStrength }),
      setGlassBlur: (glassBlur) => set({ glassBlur, wallpaperBlur: glassBlur }),
      customWallpaper: null,
      wallpaperBlur: 0,
      wallpaperOpacity: 45,
      wallpaperSpeed: 1.0,
      customCover: null,
      coverSpeed: 1.0,
      customSlots: [null, null, null, null, null],
      mediaLibrary: [],
      addMediaItem: (item) => set((state) => {
        const exists = state.mediaLibrary.some(m => m.url === item.url);
        if (exists) return state;
        return { mediaLibrary: [item, ...state.mediaLibrary] };
      }),
      removeMediaItem: (id) => set((state) => {
        const itemToRemove = state.mediaLibrary.find(m => m.id === id);
        const newLibrary = state.mediaLibrary.filter(m => m.id !== id);
        const nextSlots = state.customSlots.map(s => (s?.id === id || (itemToRemove && s?.url === itemToRemove.url) ? null : s));
        const updates: Partial<ThemeStore> = {
          mediaLibrary: newLibrary,
          customSlots: nextSlots
        };
        if (itemToRemove) {
          if (state.customWallpaper === itemToRemove.url) {
            updates.customWallpaper = null;
          }
          if (state.customCover === itemToRemove.url) {
            updates.customCover = null;
          }
        }
        return updates;
      }),
      setSlotMedia: (slotIndex, item) => set((state) => {
        const nextSlots = [...state.customSlots];
        while (nextSlots.length < 5) nextSlots.push(null);
        nextSlots[slotIndex] = item;

        const updates: Partial<ThemeStore> = { customSlots: nextSlots };

        // Slot 0: Wallpaper
        if (slotIndex === 0) {
          updates.customWallpaper = item ? item.url : null;
        }
        // Slot 1: Custom Player Cover
        if (slotIndex === 1) {
          updates.customCover = item ? item.url : null;
        }
        // Slot 2: Video background
        if (slotIndex === 2) {
          updates.customWallpaper = item ? item.url : null;
        }
        // Slot 3: Profile Banner
        if (slotIndex === 3) {
          const bannerUrl = item ? item.url : undefined;
          useAuthStore.getState().updateUser({ banner: bannerUrl });
          pocketBaseService.updateProfile({ banner: bannerUrl || '' }).catch(console.warn);
        }

        return updates;
      }),
      clearSlot: (slotIndex) => set((state) => {
        const nextSlots = [...state.customSlots];
        while (nextSlots.length < 5) nextSlots.push(null);
        nextSlots[slotIndex] = null;

        const updates: Partial<ThemeStore> = { customSlots: nextSlots };

        if (slotIndex === 0 || slotIndex === 2) {
          updates.customWallpaper = null;
        } else if (slotIndex === 1) {
          updates.customCover = null;
        } else if (slotIndex === 3) {
          useAuthStore.getState().updateUser({ banner: undefined });
          pocketBaseService.updateProfile({ banner: '' }).catch(console.warn);
        }

        return updates;
      }),
      setFontSize: (fontSize) => set({ fontSize }),
      setFontWeight: (fontWeight) => set({ fontWeight }),
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
        if (state.currentThemeId === 'track') {
          return state.trackTheme || PRESET_THEMES[0];
        }
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

