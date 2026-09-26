import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { translations, Language, TranslationKey } from '../utils/translations';

interface AppSettingsState {
  language: Language;
  autolaunch: boolean;
  minimizeToTray: boolean;
  autoSimilar: boolean;
  startupMode: 'disabled' | 'track' | 'queue';
  
  setLanguage: (lang: Language) => void;
  setAutolaunch: (enabled: boolean) => Promise<void>;
  setMinimizeToTray: (enabled: boolean) => Promise<void>;
  setAutoSimilar: (enabled: boolean) => void;
  setStartupMode: (mode: 'disabled' | 'track' | 'queue') => void;
  t: (key: TranslationKey) => string;
}

export const useAppSettingsStore = create<AppSettingsState>()(
  persist(
    (set, get) => ({
      language: 'ru',
      autolaunch: false,
      minimizeToTray: true,
      autoSimilar: true,
      startupMode: 'track',

      setLanguage: (lang) => {
        set({ language: lang });
      },

      setAutolaunch: async (enabled) => {
        set({ autolaunch: enabled });
        try {
          await invoke('set_autostart', { enabled });
        } catch (e) {
          console.error('Failed to update autostart setting', e);
        }
      },

      setMinimizeToTray: async (enabled) => {
        set({ minimizeToTray: enabled });
        try {
          await invoke('set_minimize_to_tray', { enabled });
        } catch (e) {
          console.error('Failed to update minimize_to_tray setting', e);
        }
      },

      setAutoSimilar: (enabled) => {
        set({ autoSimilar: enabled });
      },

      setStartupMode: (mode) => {
        set({ startupMode: mode });
      },

      t: (key: TranslationKey) => {
        const lang = get().language || 'ru';
        const langDict = translations[lang] || translations.ru;
        return langDict[key] || translations.ru[key] || key;
      }
    }),
    {
      name: 'aura-app-settings',
    }
  )
);

// Initialize Rust settings on startup
if (typeof window !== 'undefined') {
  setTimeout(async () => {
    try {
      const state = useAppSettingsStore.getState();
      await invoke('set_minimize_to_tray', { enabled: state.minimizeToTray });
      const currentAutostart = await invoke<boolean>('get_autostart');
      if (currentAutostart !== state.autolaunch) {
        useAppSettingsStore.setState({ autolaunch: currentAutostart });
      }
    } catch (e) {
      // Ignored if in non-tauri dev environment
    }
  }, 500);
}
