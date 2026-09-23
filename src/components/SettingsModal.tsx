import React, { useState, useEffect } from 'react';
import { 
  X, Cloud, Check, Palette, 
  Upload, Trash2, Sparkles, HardDrive, 
  RefreshCw, Search, Copy, ExternalLink, Loader2, User
} from 'lucide-react';
import { AccountTab } from './AccountTab';
import { useSettingsStore } from '../store/usePlayerStore';
import { useThemeStore, isVideoUrl, PRESET_THEMES, AVAILABLE_FONTS, TRACK_FONT_OPTIONS } from '../store/useThemeStore';
import { useCacheStore, CacheStats } from '../store/useCacheStore';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';

async function fileToMediaUrl(filePath: string): Promise<string> {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const isVideo = ['mp4', 'webm', 'mov', 'mkv'].includes(ext);
  if (isVideo) {
    return convertFileSrc(filePath);
  }
  try {
    const bytes = await readFile(filePath);
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                 ext === 'png' ? 'image/png' :
                 ext === 'gif' ? 'image/gif' :
                 ext === 'webp' ? 'image/webp' : 'image/jpeg';
    let binary = '';
    const uint8Array = new Uint8Array(bytes);
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(uint8Array.subarray(i, i + chunkSize)));
    }
    return `data:${mime};base64,${btoa(binary)}`;
  } catch (e) {
    console.warn('Failed to read file as data url, falling back to convertFileSrc:', e);
    return convertFileSrc(filePath);
  }
}

function hexToHsl(hex: string): [number, number, number] {
  let c = hex.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return [0, 0, 0];
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.max(0, Math.min(255, Math.round(x * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function adjustHexLightness(hex: string, deltaPercent: number): string {
  const [h, s, l] = hexToHsl(hex);
  const newL = Math.max(0, Math.min(100, l + deltaPercent));
  return hslToHex(h, s, newL);
}

function isColorLight(hex: string): boolean {
  const [, , l] = hexToHsl(hex);
  return l > 55;
}

const BG_PALETTE_PRESETS = [
  { label: 'AMOLED', hex: '#000000' },
  { label: 'Полночь', hex: '#0a0a0f' },
  { label: 'Ночь', hex: '#0e1117' },
  { label: 'Океан', hex: '#09131f' },
  { label: 'Слива', hex: '#150d1a' },
  { label: 'Хвоя', hex: '#0a140f' },
  { label: 'Шоколад', hex: '#16110d' },
  { label: 'Графит', hex: '#16161c' },
  { label: 'Сталь', hex: '#20222a' },
  { label: 'Светлая', hex: '#f6f6f8' },
];

const ACCENT_PALETTE_PRESETS = [
  { label: 'Оранж', hex: '#ff5500' },
  { label: 'Коралл', hex: '#ff3366' },
  { label: 'Рубин', hex: '#ef4444' },
  { label: 'Фиолет', hex: '#8b5cf6' },
  { label: 'Кобальт', hex: '#3b82f6' },
  { label: 'Бирюза', hex: '#06b6d4' },
  { label: 'Изумруд', hex: '#10b981' },
  { label: 'Лайм', hex: '#84cc16' },
  { label: 'Янтарь', hex: '#f59e0b' },
  { label: 'Фуксия', hex: '#ec4899' },
  { label: 'Индиго', hex: '#6366f1' },
  { label: 'Белый', hex: '#ffffff' },
];

interface ColorPickerFieldProps {
  label: string;
  color: string;
  onChange: (color: string) => void;
  presets: { label: string; hex: string }[];
}

const ColorPickerField: React.FC<ColorPickerFieldProps> = ({ label, color, onChange, presets }) => {
  const [h, s, l] = hexToHsl(color);
  const [hexInput, setHexInput] = useState(color);

  useEffect(() => {
    setHexInput(color);
  }, [color]);

  const handleHueChange = (newH: number) => {
    const safeS = s < 10 ? 70 : s;
    const safeL = l < 5 ? 15 : l > 95 ? 85 : l;
    onChange(hslToHex(newH, safeS, safeL));
  };

  const handleLightnessChange = (newL: number) => {
    onChange(hslToHex(h, s, newL));
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setHexInput(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      onChange(val.toLowerCase());
    }
  };

  return (
    <div className="space-y-3 bg-[var(--bg-main)] border border-[var(--border-main)] p-3.5 rounded-2xl">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[12px] text-[var(--text-main)] font-semibold">{label}</label>
        
        <div className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-main)] px-2 py-1 rounded-xl">
          <div 
            className="w-4 h-4 rounded-full border border-white/20 shadow-sm shrink-0" 
            style={{ backgroundColor: color }} 
          />
          <input 
            type="text"
            value={hexInput}
            onChange={handleHexChange}
            maxLength={7}
            placeholder="#000000"
            className="w-20 bg-transparent text-[11px] font-mono text-[var(--text-main)] outline-none"
          />
        </div>
      </div>

      {/* Presets Grid */}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {presets.map((preset) => {
          const isActive = color.toLowerCase() === preset.hex.toLowerCase();
          return (
            <button
              key={preset.hex}
              type="button"
              onClick={() => onChange(preset.hex)}
              className={`group relative w-7 h-7 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                isActive 
                  ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-main)] scale-110' 
                  : 'hover:scale-105 border border-white/10'
              }`}
              style={{ backgroundColor: preset.hex }}
              title={`${preset.label} (${preset.hex})`}
            >
              {isActive && (
                <Check 
                  size={14} 
                  strokeWidth={3} 
                  className={isColorLight(preset.hex) ? 'text-black' : 'text-white'} 
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Hue Slider */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-[var(--text-secondary)] font-medium">
          <span>Спектр оттенка</span>
          <span className="font-mono">{h}°</span>
        </div>
        <input 
          type="range"
          min="0"
          max="360"
          value={h}
          onChange={(e) => handleHueChange(parseInt(e.target.value, 10))}
          className="w-full h-3 rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:scale-110 transition-transform"
          style={{
            background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
          }}
        />
      </div>

      {/* Lightness Slider */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-[var(--text-secondary)] font-medium">
          <span>Яркость</span>
          <span className="font-mono">{l}%</span>
        </div>
        <input 
          type="range"
          min="0"
          max="100"
          value={l}
          onChange={(e) => handleLightnessChange(parseInt(e.target.value, 10))}
          className="w-full h-3 rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:scale-110 transition-transform"
          style={{
            background: `linear-gradient(to right, #000000, ${hslToHex(h, s, 50)}, #ffffff)`
          }}
        />
      </div>
    </div>
  );
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { yandexToken, setYandexToken } = useSettingsStore();
  
  const [activeTab, setActiveTab] = useState<'account' | 'services' | 'customization' | 'appearance' | 'cache'>('account');
  const [searchQuery, setSearchQuery] = useState('');

  // Custom theme creation state
  const [newThemeName, setNewThemeName] = useState('');
  const [newThemeBg, setNewThemeBg] = useState('#0e1117');
  const [newThemeAccent, setNewThemeAccent] = useState('#ff5500');
  
  // Cache state
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const { getCacheStats, clearCache } = useCacheStore();

  const loadCacheStats = async () => {
    try {
      const stats = await getCacheStats();
      setCacheStats(stats);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'cache') {
      loadCacheStats();
    }
  }, [activeTab]);

  const handleClearCache = async () => {
    if (!window.confirm('Вы действительно хотите очистить весь кэш треков?')) return;
    try {
      setIsClearingCache(true);
      await clearCache();
      await loadCacheStats();
    } catch (err) {
      console.error('Ошибка очистки кэша:', err);
    } finally {
      setIsClearingCache(false);
    }
  };

  // Yandex Music State
  const [yaSaved, setYaSaved] = useState(false);
  const [yaError, setYaError] = useState('');
  const [showManualToken, setShowManualToken] = useState(false);
  const [manualTokenInput, setManualTokenInput] = useState('');
  const [deviceAuthInfo, setDeviceAuthInfo] = useState<{ user_code: string; verification_url: string } | null>(null);
  const [isStartingAuth, setIsStartingAuth] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Wallpaper and Cover URL input state
  const [wallpaperUrlInput, setWallpaperUrlInput] = useState('');
  const [coverUrlInput, setCoverUrlInput] = useState('');

  // Theme & Font & Wallpaper & Cover State
  const { 
    currentThemeId, setTheme, customThemes, deleteCustomTheme,
    fontId, setFontId,
    trackFontId, setTrackFontId,
    customWallpaper, setWallpaper,
    wallpaperBlur, setWallpaperBlur,
    wallpaperOpacity, setWallpaperOpacity,
    wallpaperSpeed, setWallpaperSpeed,
    customCover, setCustomCover,
    coverSpeed, setCoverSpeed
  } = useThemeStore();

  useEffect(() => {
    if (isOpen) {
      setYaSaved(false);
      setYaError('');
      setWallpaperUrlInput('');
      setCoverUrlInput('');
      setSearchQuery('');
    }
  }, [isOpen]);

  const [yaAccountInfo, setYaAccountInfo] = useState<{ hasPlus: boolean; login?: string } | null>(null);

  useEffect(() => {
    if (!yandexToken) {
      setYaAccountInfo(null);
      return;
    }
    const checkAccount = async () => {
      try {
        const res = await invoke<string>('yandex_api_request', {
          url: 'https://api.music.yandex.net/account/status',
          token: yandexToken
        });
        const data = JSON.parse(res);
        const perms = data.result?.permissions?.values || [];
        const hasPlus = perms.includes('plus') || !!data.result?.plus?.hasPlus;
        const login = data.result?.account?.login || data.result?.account?.displayName || data.result?.account?.fullName;
        setYaAccountInfo({ hasPlus, login });
      } catch (err) {
        console.warn('Could not check Yandex account status:', err);
      }
    };
    checkAccount();
  }, [yandexToken, isOpen]);

  useEffect(() => {
    const unlisten = listen<string>('yandex-token', (event) => {
      setYandexToken(event.payload);
      setDeviceAuthInfo(null);
      setYaSaved(true);
      setTimeout(() => setYaSaved(false), 3000);
    });
    return () => {
      unlisten.then(f => f());
    };
  }, [setYandexToken]);

  const handleStartOAuth = async () => {
    try {
      setIsStartingAuth(true);
      setYaError('');
      const res = await invoke<{ user_code: string; verification_url: string; expires_in: number }>('start_yandex_oauth');
      setDeviceAuthInfo(res);
      // Auto-open browser with user_code prefilled (works on oauth.yandex.ru, never opens Yandex Music app)
      const authUrl = `https://oauth.yandex.ru/device?user_code=${res.user_code}`;
      try {
        await openUrl(authUrl);
      } catch (e) {
        console.warn('Could not auto-open browser', e);
      }
    } catch (err: any) {
      setYaError(typeof err === 'string' ? err : 'Не удалось запустить авторизацию');
    } finally {
      setIsStartingAuth(false);
    }
  };

  if (!isOpen) return null;

  // Sidebar items definitions
  const sidebarItems = [
    { id: 'account' as const, label: 'Аккаунт и Синхронизация', icon: User, group: 'main' },
    { id: 'services' as const, label: 'Сервисы', icon: Cloud, group: 'main' },
    { id: 'cache' as const, label: 'Хранилище', icon: HardDrive, group: 'main' },
    { id: 'customization' as const, label: 'Темы', icon: Palette, group: 'appearance' },
    { id: 'appearance' as const, label: 'Оформление', icon: Sparkles, group: 'appearance' },
  ];

  const filteredItems = sidebarItems.filter(item => 
    !searchQuery.trim() || item.label.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className={`border-0 md:border border-[var(--border-main)] rounded-none md:rounded-3xl w-full h-full md:w-[94vw] md:max-w-6xl md:h-[88vh] md:min-h-[540px] md:max-h-[960px] flex flex-col md:flex-row overflow-hidden shadow-2xl relative select-none transition-all ${
          customWallpaper 
            ? 'bg-[var(--bg-main)]/95 backdrop-blur-2xl text-[var(--text-main)]' 
            : 'bg-[var(--bg-main)] text-[var(--text-main)]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-[max(4.75rem,calc(env(safe-area-inset-top,0px)+16px))] right-4 md:top-5 md:right-5 z-30 w-8 h-8 rounded-full flex items-center justify-center bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-main)] text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-all cursor-pointer shadow-sm"
        >
          <X size={16} />
        </button>

        {/* Navigation Sidebar / Mobile Top Tabs */}
        <div className={`w-full md:w-64 shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-[var(--border-main)] ${customWallpaper ? 'bg-black/40 backdrop-blur-md' : 'bg-[var(--bg-surface)]/50'} p-3 md:p-4 pt-[max(4.75rem,calc(env(safe-area-inset-top,0px)+16px))] md:pt-5 overflow-x-auto md:overflow-hidden scrollbar-hide`}>
          <div className="flex md:flex-col gap-2 md:space-y-5 overflow-x-auto md:overflow-visible scrollbar-hide pr-10 md:pr-0">
            {/* Tabs */}
            <div className="flex md:flex-col gap-1.5 md:space-y-1 shrink-0">
              <span className="hidden md:block text-[10px] font-bold tracking-wider text-[var(--text-secondary)]/70 uppercase px-3 mb-2">
                Основные
              </span>
              <div className="flex md:flex-col gap-1.5 md:space-y-1">
                {filteredItems.filter(i => i.group === 'main').map(item => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`flex items-center gap-2 md:gap-3 px-3 md:px-3.5 py-1.5 md:py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                        isActive 
                          ? 'bg-[var(--bg-surface-hover)] text-[var(--text-main)] shadow-sm font-semibold border border-[var(--border-main)]' 
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)]/40 border border-transparent'
                      }`}
                    >
                      <Icon size={15} className={isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]/70'} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Group: Оформление */}
            <div className="flex md:flex-col gap-1.5 md:space-y-1 shrink-0">
              <span className="hidden md:block text-[10px] font-bold tracking-wider text-[var(--text-secondary)]/70 uppercase px-3 mb-2">
                Оформление
              </span>
              <div className="flex md:flex-col gap-1.5 md:space-y-1">
                {filteredItems.filter(i => i.group === 'appearance').map(item => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`flex items-center gap-2 md:gap-3 px-3 md:px-3.5 py-1.5 md:py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                        isActive 
                          ? 'bg-[var(--bg-surface-hover)] text-[var(--text-main)] shadow-sm font-semibold border border-[var(--border-main)]' 
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)]/40 border border-transparent'
                      }`}
                    >
                      <Icon size={15} className={isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]/70'} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Search at bottom of sidebar (desktop only) */}
          <div className="hidden md:block pt-3 border-t border-[var(--border-main)] mt-auto">
            <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-main)]/70 border border-[var(--border-main)] rounded-full text-xs text-[var(--text-main)]">
              <Search size={14} className="text-[var(--text-secondary)] shrink-0" />
              <input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск..."
                className="bg-transparent border-none outline-none text-xs text-[var(--text-main)] placeholder-[var(--text-secondary)]/50 w-full"
              />
            </div>
          </div>
        </div>

        {/* Right Main Content Area */}
        <div className={`flex-1 flex flex-col p-6 sm:p-7 md:p-8 overflow-y-auto overflow-x-hidden scrollbar-hide [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0 [scrollbar-width:none] [-ms-overflow-style:none] ${customWallpaper ? 'bg-black/20' : 'bg-[var(--bg-main)]'}`}>
          
          {/* Section: Account & Sync */}
          {activeTab === 'account' && <AccountTab />}

          {/* Section 1: Services */}
          {activeTab === 'services' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="text-[11px] font-bold tracking-widest text-[var(--text-secondary)] uppercase mb-4">
                ИНТЕГРАЦИИ И СЕРВИСЫ
              </div>

              {/* Card: Yandex Music */}
              <div className={`${customWallpaper ? 'bg-black/50 backdrop-blur-md' : 'bg-[var(--bg-surface)]'} border border-[var(--border-main)] rounded-2xl p-5 shadow-sm`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[14px] font-semibold text-[var(--text-main)] tracking-tight">Яндекс Музыка</span>
                      {yandexToken ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-full">
                          ПОДКЛЮЧЕНО
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 bg-[var(--bg-main)] border border-[var(--border-main)] text-[var(--text-secondary)] rounded-full">
                          НЕ АВТОРИЗОВАНО
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                      Авторизация в аккаунте открывает доступ к поиску, персональным рекомендациям («Моя волна») и оригинальным обложкам.
                    </p>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-[var(--border-main)] flex items-center gap-3">
                  {yandexToken ? (
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => {
                          setYandexToken(null);
                          setYaSaved(false);
                          setYaAccountInfo(null);
                        }}
                        className="self-start px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 active:scale-95"
                      >
                        <X size={15} />
                        Выйти из аккаунта
                      </button>
                      <button 
                        onClick={() => setShowManualToken(!showManualToken)}
                        className="px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-main)] underline transition-colors cursor-pointer"
                      >
                        {showManualToken ? 'Скрыть ввод' : 'Заменить токен вручную'}
                      </button>

                      {yaAccountInfo && (
                        <div className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-main)] flex flex-col gap-1.5">
                          <div className="flex items-center gap-2 text-xs font-semibold">
                            <span className="text-[var(--text-main)]">Логин: {yaAccountInfo.login || 'Подключен'}</span>
                            {yaAccountInfo.hasPlus ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">Плюс активен (полные треки)</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">Нет подписки Плюс</span>
                            )}
                          </div>
                          {!yaAccountInfo.hasPlus ? (
                            <p className="text-[11px] text-amber-400/90 leading-relaxed">
                              На этом аккаунте нет подписки Яндекс Плюс. Aura автоматически воспроизводит полные треки через резервный источник без 30-секундных превью! Чтобы слушать оригинальные 320 kbps потоки Яндекса, войдите в аккаунт с Яндекс Плюсом.
                            </p>
                          ) : (
                            <p className="text-[11px] text-emerald-400/90 leading-relaxed">
                              Подписка активна! Треки играются целиком в оригинальном качестве 320 kbps.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <button 
                        onClick={handleStartOAuth}
                        disabled={isStartingAuth}
                        className="px-5 py-2.5 bg-[var(--bg-surface-hover)] hover:brightness-110 border border-[var(--border-main)] rounded-xl text-[var(--text-main)] text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 active:scale-95 shadow-md hover:border-[var(--accent)]/50 disabled:opacity-50"
                      >
                        {isStartingAuth ? (
                          <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
                        ) : (
                          <Cloud size={16} />
                        )}
                        {isStartingAuth ? 'Получение кода...' : 'Авторизоваться в Яндекс'}
                      </button>
                      <button 
                        onClick={() => setShowManualToken(!showManualToken)}
                        className="px-3.5 py-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-main)] underline transition-colors cursor-pointer"
                      >
                        {showManualToken ? 'Скрыть ввод' : 'Ввести токен вручную'}
                      </button>
                    </div>
                  )}

                  {yaSaved && (
                    <span className="text-emerald-400 text-xs flex items-center gap-1.5 font-medium">
                      <Check size={14} /> Успешно авторизовано!
                    </span>
                  )}
                  {yaError && <span className="text-red-400 text-xs">{yaError}</span>}
                </div>

                {/* Device Authorization Flow card */}
                {!yandexToken && deviceAuthInfo && (
                  <div className="mt-4 p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border-main)] flex flex-col gap-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--text-main)]">Авторизация через Яндекс ID</span>
                      <button 
                        onClick={() => setDeviceAuthInfo(null)}
                        className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-main)] cursor-pointer"
                      >
                        Отмена
                      </button>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Подтвердите подключение в открывшейся вкладке браузера. Если страница не открылась, нажмите кнопку ниже:
                    </p>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-main)]">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">Одноразовый код</span>
                        <span className="text-lg font-mono font-bold tracking-widest text-[var(--accent)] select-all">{deviceAuthInfo.user_code}</span>
                      </div>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(deviceAuthInfo.user_code);
                          setIsCopied(true);
                          setTimeout(() => setIsCopied(false), 2000);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-main)] text-xs text-[var(--text-main)] flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        {isCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        {isCopied ? 'Скопировано' : 'Копировать'}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => openUrl(`https://oauth.yandex.ru/device?user_code=${deviceAuthInfo.user_code}`)}
                        className="flex-1 py-2.5 px-4 bg-[var(--accent)] hover:brightness-110 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95"
                      >
                        <ExternalLink size={14} />
                        Открыть страницу Яндекса
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] justify-center pt-1">
                      <Loader2 size={13} className="animate-spin text-[var(--accent)]" />
                      <span>Ожидаем подтверждения в Яндекс ID...</span>
                    </div>
                  </div>
                )}

                {showManualToken && (
                  <div className="mt-4 pt-3 border-t border-[var(--border-main)]/50 flex flex-col gap-2">
                    <span className="text-[11px] text-[var(--text-secondary)]">Вставьте или замените токен Яндекс Музыки (OAuth / Bearer):</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={manualTokenInput} 
                        onChange={(e) => setManualTokenInput(e.target.value)} 
                        placeholder="y0_AgAAAA... или ey0__..." 
                        className="flex-1 px-3 py-2 bg-[var(--bg-main)] border border-[var(--border-main)] rounded-xl text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                      />
                      <button 
                        type="button"
                        onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText();
                            if (text) setManualTokenInput(text.trim());
                          } catch {}
                        }}
                        className="px-3 py-2 bg-[var(--bg-surface-hover)] border border-[var(--border-main)] text-xs text-[var(--text-main)] rounded-xl hover:brightness-110 cursor-pointer"
                        title="Вставить из буфера"
                      >
                        Вставить
                      </button>
                      <button 
                        onClick={() => {
                          if (manualTokenInput.trim()) {
                            setYandexToken(manualTokenInput.trim());
                            setYaSaved(true);
                            setManualTokenInput('');
                            setTimeout(() => setYaSaved(false), 3000);
                          }
                        }}
                        className="px-4 py-2 bg-[var(--accent)] text-white text-xs font-semibold rounded-xl hover:brightness-110 transition-all cursor-pointer"
                      >
                        Сохранить
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Card: External Playlist Importers */}
              <div className={`${customWallpaper ? 'bg-black/50 backdrop-blur-md' : 'bg-[var(--bg-surface)]'} border border-[var(--border-main)] rounded-2xl p-5 shadow-sm`}>
                <span className="text-[14px] font-semibold text-[var(--text-main)] tracking-tight block">
                  Поддерживаемые сервисы импорта
                </span>
                <p className="text-[12px] text-[var(--text-secondary)] mt-1 mb-4 leading-relaxed">
                  Быстрый перенос любых плейлистов по ссылке через кнопку «+» в Коллекциях.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
                  {[
                    { name: 'Яндекс Музыка', desc: 'UUID, альбомы, артисты' },
                    { name: 'ВКонтакте', desc: 'vk.com и vk.ru плейлисты' },
                    { name: 'Spotify', desc: 'Публичные плейлисты' },
                    { name: 'YouTube Music', desc: 'Polymer и lockup плейлисты' },
                    { name: 'Apple Music', desc: 'Плейлисты и альбомы' },
                    { name: 'Текстовый список', desc: 'Любой список построчно' }
                  ].map((s, idx) => (
                    <div key={idx} className="p-3 bg-[var(--bg-main)]/60 border border-[var(--border-main)] rounded-xl flex flex-col justify-center min-w-0 overflow-hidden">
                      <span className="text-xs font-medium text-[var(--text-main)] truncate min-w-0">{s.name}</span>
                      <span className="text-[10px] text-[var(--text-secondary)] mt-0.5 truncate min-w-0">{s.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}



          {/* Section 3: Themes & Palettes */}
          {activeTab === 'customization' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="text-[11px] font-bold tracking-widest text-[var(--text-secondary)] uppercase mb-4">
                ТЕМЫ И ОФОРМЛЕНИЕ
              </div>

              {/* Card: Preset Themes */}
              <div className={`${customWallpaper ? 'bg-black/50 backdrop-blur-md' : 'bg-[var(--bg-surface)]'} border border-[var(--border-main)] rounded-2xl p-5 shadow-sm`}>
                <span className="text-[14px] font-semibold text-[var(--text-main)] tracking-tight block">
                  Готовые палитры
                </span>
                <p className="text-[12px] text-[var(--text-secondary)] mt-1 mb-4 leading-relaxed">
                  Выберите цветовую гамму интерфейса с акцентными оттенками.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {PRESET_THEMES.map(theme => {
                    const isSelected = currentThemeId === theme.id;
                    return (
                      <div 
                        key={theme.id}
                        onClick={() => setTheme(theme.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all min-w-0 overflow-hidden ${
                          isSelected 
                            ? 'bg-[var(--bg-surface-hover)] border-2 border-[var(--accent)] text-[var(--text-main)] shadow-md' 
                            : 'bg-[var(--bg-main)]/60 hover:bg-[var(--bg-surface-hover)]/60 border border-[var(--border-main)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                        }`}
                      >
                        <div 
                          className="w-8 h-8 rounded-full border border-[var(--border-main)] shrink-0 flex items-center justify-center overflow-hidden relative shadow-inner"
                          style={{ backgroundColor: theme.colors.bgMain }}
                        >
                          <div className="absolute bottom-0 right-0 w-full h-1/2 opacity-90" style={{ backgroundColor: theme.colors.accent }} />
                        </div>
                        <span className="font-medium text-xs truncate min-w-0 flex-1">{theme.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Card: Custom Themes (if any) */}
              {customThemes && customThemes.length > 0 && (
                <div className={`${customWallpaper ? 'bg-black/50 backdrop-blur-md' : 'bg-[var(--bg-surface)]'} border border-[var(--border-main)] rounded-2xl p-5 shadow-sm`}>
                  <span className="text-[14px] font-semibold text-[var(--text-main)] tracking-tight block">
                    Пользовательские темы
                  </span>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-1 mb-4 leading-relaxed">
                    Созданные вами темы оформления.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {customThemes.map(theme => {
                      const isSelected = currentThemeId === theme.id;
                      return (
                        <div 
                          key={theme.id}
                          className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all min-w-0 overflow-hidden ${
                            isSelected 
                              ? 'bg-[var(--bg-surface-hover)] border-2 border-[var(--accent)] text-[var(--text-main)] shadow-md' 
                              : 'bg-[var(--bg-main)]/60 hover:bg-[var(--bg-surface-hover)]/60 border border-[var(--border-main)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                          }`}
                        >
                          <div 
                            onClick={() => setTheme(theme.id)}
                            className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden"
                          >
                            <div 
                              className="w-7 h-7 rounded-full border border-[var(--border-main)] shrink-0 overflow-hidden relative"
                              style={{ backgroundColor: theme.colors.bgMain }}
                            >
                              <div className="absolute bottom-0 right-0 w-full h-1/2 opacity-90" style={{ backgroundColor: theme.colors.accent }} />
                            </div>
                            <span className="font-medium text-xs truncate min-w-0 flex-1">{theme.name}</span>
                          </div>
                          
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteCustomTheme(theme.id);
                            }}
                            className="p-1 text-[var(--text-secondary)] hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors shrink-0"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Card: Create Theme */}
              <div className={`${customWallpaper ? 'bg-black/50 backdrop-blur-md' : 'bg-[var(--bg-surface)]'} border border-[var(--border-main)] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4`}>
                <div>
                  <span className="text-[14px] font-semibold text-[var(--text-main)] tracking-tight block">
                    Создать свою тему
                  </span>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                    Выберите цвета из дизайнерской палитры или настройте собственный оттенок.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Background color picker */}
                  <ColorPickerField 
                    label="Цвет фона"
                    color={newThemeBg}
                    onChange={setNewThemeBg}
                    presets={BG_PALETTE_PRESETS}
                  />

                  {/* Accent color picker */}
                  <ColorPickerField 
                    label="Акцентный цвет"
                    color={newThemeAccent}
                    onChange={setNewThemeAccent}
                    presets={ACCENT_PALETTE_PRESETS}
                  />
                </div>

                {/* Live Preview & Theme Name */}
                <div className="space-y-2 pt-1">
                  <label className="text-[11px] text-[var(--text-secondary)] font-medium block">Предпросмотр темы</label>
                  <div 
                    className="p-4 rounded-2xl border transition-all shadow-md flex items-center justify-between gap-3"
                    style={{
                      backgroundColor: newThemeBg,
                      borderColor: isColorLight(newThemeBg) ? adjustHexLightness(newThemeBg, -14) : adjustHexLightness(newThemeBg, 18)
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div 
                        className="text-xs font-bold truncate"
                        style={{ color: isColorLight(newThemeBg) ? '#0a0a0a' : '#ffffff' }}
                      >
                        {newThemeName.trim() || 'Моя персональная тема'}
                      </div>
                      <div 
                        className="text-[11px] truncate mt-0.5"
                        style={{ color: isColorLight(newThemeBg) ? '#555555' : '#a3a3a3' }}
                      >
                        Фон: <span className="font-mono">{newThemeBg}</span> · Акцент: <span className="font-mono">{newThemeAccent}</span>
                      </div>
                    </div>

                    <div 
                      className="px-3 py-1.5 rounded-xl font-bold text-xs shadow-md shrink-0 flex items-center gap-1.5"
                      style={{
                        backgroundColor: newThemeAccent,
                        color: isColorLight(newThemeAccent) ? '#000000' : '#ffffff'
                      }}
                    >
                      Кнопка
                    </div>
                  </div>
                </div>

                {/* Theme Name input */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-[var(--text-secondary)] font-medium block">Название темы</label>
                  <input 
                    type="text" 
                    value={newThemeName}
                    onChange={(e) => setNewThemeName(e.target.value)}
                    placeholder="Например: Неоновый закат" 
                    className="w-full px-3.5 py-2.5 bg-[var(--bg-main)] border border-[var(--border-main)] rounded-xl text-xs text-[var(--text-main)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <button
                  onClick={() => {
                    const name = newThemeName.trim() || 'Пользовательская тема';
                    const isLight = isColorLight(newThemeBg);
                    
                    const bgMain = newThemeBg;
                    const bgSurface = isLight ? adjustHexLightness(bgMain, -5) : adjustHexLightness(bgMain, 6);
                    const bgSurfaceHover = isLight ? adjustHexLightness(bgMain, -9) : adjustHexLightness(bgMain, 12);
                    const borderMain = isLight ? adjustHexLightness(bgMain, -14) : adjustHexLightness(bgMain, 16);
                    const textMain = isLight ? '#0a0a0a' : '#ffffff';
                    const textSecondary = isLight ? '#555555' : '#a3a3a3';
                    const accent = newThemeAccent;
                    const accentHover = isColorLight(accent) ? adjustHexLightness(accent, -10) : adjustHexLightness(accent, 10);

                    useThemeStore.getState().addCustomTheme({
                      id: 'custom-' + Date.now(),
                      name,
                      colors: {
                        bgMain,
                        bgSurface,
                        bgSurfaceHover,
                        textMain,
                        textSecondary,
                        borderMain,
                        accent,
                        accentHover,
                      }
                    });
                    setNewThemeName('');
                  }}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[var(--accent)] hover:opacity-90 active:scale-98 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg shadow-[var(--accent)]/30"
                >
                  Сохранить и применить
                </button>
              </div>
            </div>
          )}

          {/* Section 4: Typography & Media (Appearance) */}
          {activeTab === 'appearance' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="text-[11px] font-bold tracking-widest text-[var(--text-secondary)] uppercase mb-4">
                ШРИФТ И ОБОИ
              </div>

              {/* Card: App Font */}
              <div className={`${customWallpaper ? 'bg-black/50 backdrop-blur-md' : 'bg-[var(--bg-surface)]'} border border-[var(--border-main)] rounded-2xl p-5 shadow-sm`}>
                <span className="text-[14px] font-semibold text-[var(--text-main)] tracking-tight block">
                  Шрифт интерфейса
                </span>
                <p className="text-[12px] text-[var(--text-secondary)] mt-1 mb-4 leading-relaxed">
                  Основной шрифт для элементов навигации, кнопок и списков.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {AVAILABLE_FONTS.map(f => {
                    const isSelected = fontId === f.id;
                    return (
                      <div
                        key={f.id}
                        onClick={() => setFontId(f.id)}
                        className={`p-3.5 rounded-xl cursor-pointer transition-all flex flex-col justify-between min-w-0 overflow-hidden ${
                          isSelected 
                            ? 'bg-[var(--bg-surface-hover)] border-2 border-[var(--accent)] text-[var(--text-main)] shadow-md' 
                            : 'bg-[var(--bg-main)]/60 hover:bg-[var(--bg-surface-hover)]/60 border border-[var(--border-main)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                          <span className="font-semibold text-xs text-[var(--text-main)] truncate min-w-0 flex-1">{f.name}</span>
                          <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] font-medium shrink-0 whitespace-nowrap">
                            {f.category}
                          </span>
                        </div>
                        <div 
                          className="text-xs text-[var(--text-main)]/80 tracking-wide truncate mt-0.5 min-w-0"
                          style={{ fontFamily: f.family }}
                        >
                          Быстрый ритм трека 2026
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Card: Track Font */}
              <div className={`${customWallpaper ? 'bg-black/50 backdrop-blur-md' : 'bg-[var(--bg-surface)]'} border border-[var(--border-main)] rounded-2xl p-5 shadow-sm`}>
                <span className="text-[14px] font-semibold text-[var(--text-main)] tracking-tight block">
                  Шрифт названий треков
                </span>
                <p className="text-[12px] text-[var(--text-secondary)] mt-1 mb-4 leading-relaxed">
                  Акцентный шрифт для названий песен в очереди, коллекциях и мини-плеере.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {TRACK_FONT_OPTIONS.map(tf => {
                    const isSelected = trackFontId === tf.id;
                    return (
                      <div
                        key={tf.id}
                        onClick={() => setTrackFontId(tf.id)}
                        className={`p-3 rounded-xl cursor-pointer transition-all flex flex-col justify-between min-w-0 overflow-hidden ${
                          isSelected 
                            ? 'bg-[var(--bg-surface-hover)] border-2 border-[var(--accent)] text-[var(--text-main)] shadow-md' 
                            : 'bg-[var(--bg-main)]/60 hover:bg-[var(--bg-surface-hover)]/60 border border-[var(--border-main)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                        }`}
                      >
                        <span className="font-semibold text-xs text-[var(--text-main)] truncate block min-w-0">{tf.name}</span>
                        <div 
                          className="text-xs text-[var(--text-secondary)] truncate mt-1.5 min-w-0"
                          style={{ fontFamily: tf.family === 'inherit' ? 'var(--font-family)' : tf.family }}
                        >
                          Aura Music Player
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Card: Custom Wallpaper */}
              <div className={`${customWallpaper ? 'bg-black/50 backdrop-blur-md' : 'bg-[var(--bg-surface)]'} border border-[var(--border-main)] rounded-2xl p-5 shadow-sm`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[14px] font-semibold text-[var(--text-main)] tracking-tight">
                    Пользовательские обои
                  </span>
                  {customWallpaper && (
                    <button
                      onClick={() => setWallpaper(null)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-xl text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors font-medium cursor-pointer"
                    >
                      <Trash2 size={13} />
                      Удалить обои
                    </button>
                  )}
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] mb-4 leading-relaxed">
                  Видео (MP4, WEBM), GIF или изображение на заднем фоне окна приложения.
                </p>

                {/* Wallpaper Preview */}
                {customWallpaper && (
                  <div className="mb-4 flex items-center gap-3.5 p-3 bg-[var(--bg-main)]/60 border border-[var(--border-main)] rounded-xl">
                    <div className="w-14 h-14 rounded-xl overflow-hidden shadow-md shrink-0 border border-[var(--border-main)] bg-black/40 relative">
                      {isVideoUrl(customWallpaper) ? (
                        <video 
                          src={customWallpaper} 
                          autoPlay 
                          loop 
                          muted 
                          playsInline 
                          onLoadedMetadata={(e) => { e.currentTarget.playbackRate = wallpaperSpeed; }}
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <img src={customWallpaper} alt="Wallpaper preview" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-[var(--text-main)]">Активные обои</span>
                      <span className="text-[11px] text-[var(--text-secondary)] truncate">
                        {isVideoUrl(customWallpaper) ? 'Цикличное фоновое видео' : 'Статичное изображение / GIF'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Upload or URL */}
                <div className="space-y-2.5">
                  <button
                    onClick={async () => {
                      try {
                        const selected = await open({
                          multiple: false,
                          filters: [{ name: 'Медиа (Видео, GIF, Фото)', extensions: ['mp4', 'webm', 'mov', 'mkv', 'gif', 'png', 'jpg', 'jpeg', 'webp'] }]
                        });
                        if (selected && typeof selected === 'string') {
                          const mediaUrl = await fileToMediaUrl(selected);
                          setWallpaper(mediaUrl);
                        }
                      } catch (err) {
                        console.error('Failed to open wallpaper file:', err);
                      }
                    }}
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-[var(--bg-surface-hover)] hover:brightness-110 border border-[var(--border-main)] text-[var(--text-main)] rounded-xl text-xs font-semibold transition-all shadow-md active:scale-95 cursor-pointer hover:border-[var(--accent)]/50"
                  >
                    <Upload size={15} />
                    Выбрать файл (MP4, WEBM, GIF, PNG, JPG)
                  </button>

                  <div className="flex items-center gap-2 w-full">
                    <input
                      type="text"
                      value={wallpaperUrlInput}
                      onChange={(e) => setWallpaperUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && wallpaperUrlInput.trim()) {
                          setWallpaper(wallpaperUrlInput.trim());
                          setWallpaperUrlInput('');
                        }
                      }}
                      placeholder="Или прямая ссылка на видео / GIF / фото (https://...)"
                      className="flex-1 min-w-0 px-3 py-2 bg-[var(--bg-main)] border border-[var(--border-main)] rounded-xl text-xs text-[var(--text-main)] placeholder-[var(--text-secondary)]/40 focus:outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      onClick={() => {
                        if (wallpaperUrlInput.trim()) {
                          setWallpaper(wallpaperUrlInput.trim());
                          setWallpaperUrlInput('');
                        }
                      }}
                      className="px-4 py-2 bg-[var(--bg-surface-hover)] hover:brightness-110 border border-[var(--border-main)] text-[var(--text-main)] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      ОК
                    </button>
                  </div>
                </div>

                {/* Wallpaper Sliders */}
                {customWallpaper && (
                  <div className="mt-4 pt-4 border-t border-[var(--border-main)] space-y-3.5">
                    <div>
                      <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1.5">
                        <span>Размытие (Blur)</span>
                        <span className="font-mono text-[var(--text-main)] font-medium">{wallpaperBlur} px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="25"
                        step="1"
                        value={wallpaperBlur}
                        onChange={(e) => setWallpaperBlur(parseInt(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none outline-none cursor-pointer accent-[var(--accent)] bg-[var(--border-main)]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1.5">
                        <span>Яркость (Прозрачность)</span>
                        <span className="font-mono text-[var(--text-main)] font-medium">{wallpaperOpacity} %</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        step="5"
                        value={wallpaperOpacity}
                        onChange={(e) => setWallpaperOpacity(parseInt(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none outline-none cursor-pointer accent-[var(--accent)] bg-[var(--border-main)]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1.5">
                        <span>Скорость видео / анимации</span>
                        <span className="font-mono text-[var(--text-main)] font-medium">{wallpaperSpeed.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="2.0"
                        step="0.1"
                        value={wallpaperSpeed}
                        onChange={(e) => setWallpaperSpeed(parseFloat(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none outline-none cursor-pointer accent-[var(--accent)] bg-[var(--border-main)]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Card: Custom Track Cover */}
              <div className={`${customWallpaper ? 'bg-black/50 backdrop-blur-md' : 'bg-[var(--bg-surface)]'} border border-[var(--border-main)] rounded-2xl p-5 shadow-sm`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[14px] font-semibold text-[var(--text-main)] tracking-tight">
                    Кастомная обложка трека
                  </span>
                  {customCover && (
                    <button
                      onClick={() => setCustomCover(null)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-xl text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors font-medium cursor-pointer"
                    >
                      <Trash2 size={13} />
                      Сбросить обложку
                    </button>
                  )}
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] mb-4 leading-relaxed">
                  Заменяет стандартную обложку во всех окнах плеера на видео (MP4/WEBM), GIF или картинку.
                </p>

                {/* Cover Preview */}
                {customCover && (
                  <div className="mb-4 flex items-center gap-3.5 p-3 bg-[var(--bg-main)]/60 border border-[var(--border-main)] rounded-xl">
                    <div className="w-14 h-14 rounded-xl overflow-hidden shadow-md shrink-0 border border-[var(--border-main)] bg-black/40 relative">
                      {isVideoUrl(customCover) ? (
                        <video 
                          src={customCover} 
                          autoPlay 
                          loop 
                          muted 
                          playsInline 
                          onLoadedMetadata={(e) => { e.currentTarget.playbackRate = coverSpeed; }}
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <img src={customCover} alt="Cover preview" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-[var(--text-main)]">Кастомная обложка</span>
                      <span className="text-[11px] text-[var(--text-secondary)] truncate">
                        {isVideoUrl(customCover) ? 'Цикличное видео' : 'Статичное изображение / GIF'}
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-2.5">
                  <button
                    onClick={async () => {
                      try {
                        const selected = await open({
                          multiple: false,
                          filters: [{ name: 'Медиа (Видео, GIF, Фото)', extensions: ['mp4', 'webm', 'mov', 'mkv', 'gif', 'png', 'jpg', 'jpeg', 'webp'] }]
                        });
                        if (selected && typeof selected === 'string') {
                          const mediaUrl = await fileToMediaUrl(selected);
                          setCustomCover(mediaUrl);
                        }
                      } catch (err) {
                        console.error('Failed to open cover media file:', err);
                      }
                    }}
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-[var(--bg-surface-hover)] hover:brightness-110 border border-[var(--border-main)] text-[var(--text-main)] rounded-xl text-xs font-semibold transition-all shadow-md active:scale-95 cursor-pointer hover:border-[var(--accent)]/50"
                  >
                    <Upload size={15} />
                    Выбрать файл обложки (MP4, WEBM, GIF, PNG, JPG)
                  </button>

                  <div className="flex items-center gap-2 w-full">
                    <input
                      type="text"
                      value={coverUrlInput}
                      onChange={(e) => setCoverUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && coverUrlInput.trim()) {
                          setCustomCover(coverUrlInput.trim());
                          setCoverUrlInput('');
                        }
                      }}
                      placeholder="Или ссылка на видео / GIF / фото (https://...)"
                      className="flex-1 min-w-0 px-3 py-2 bg-[var(--bg-main)] border border-[var(--border-main)] rounded-xl text-xs text-[var(--text-main)] placeholder-[var(--text-secondary)]/40 focus:outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      onClick={() => {
                        if (coverUrlInput.trim()) {
                          setCustomCover(coverUrlInput.trim());
                          setCoverUrlInput('');
                        }
                      }}
                      className="px-4 py-2 bg-[var(--bg-surface-hover)] hover:brightness-110 border border-[var(--border-main)] text-[var(--text-main)] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      ОК
                    </button>
                  </div>
                </div>

                {customCover && (
                  <div className="mt-4 pt-4 border-t border-[var(--border-main)]">
                    <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1.5">
                      <span>Скорость анимации обложки</span>
                      <span className="font-mono text-[var(--text-main)] font-medium">{coverSpeed.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="2.0"
                      step="0.1"
                      value={coverSpeed}
                      onChange={(e) => setCoverSpeed(parseFloat(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none outline-none cursor-pointer accent-[var(--accent)] bg-[var(--border-main)]"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 5: Storage & Cache */}
          {activeTab === 'cache' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="text-[11px] font-bold tracking-widest text-[var(--text-secondary)] uppercase mb-4">
                ХРАНИЛИЩЕ И КЭШ
              </div>

              {/* Card: Cache Stats & Actions */}
              <div className={`${customWallpaper ? 'bg-black/50 backdrop-blur-md' : 'bg-[var(--bg-surface)]'} border border-[var(--border-main)] rounded-2xl p-5 shadow-sm`}>
                <span className="text-[14px] font-semibold text-[var(--text-main)] tracking-tight block">
                  Кэширование треков
                </span>
                <p className="text-[12px] text-[var(--text-secondary)] mt-1 mb-4 leading-relaxed">
                  Кэшированные аудиозаписи сохраняются на вашем компьютере и играют без интернета.
                </p>

                <div className="flex items-center justify-between p-4 bg-[var(--bg-main)]/60 border border-[var(--border-main)] rounded-xl mb-4">
                  <div>
                    <span className="text-xs text-[var(--text-secondary)] block">Занятое пространство на диске</span>
                    <span className="text-xl font-mono font-bold text-[var(--text-main)] mt-0.5 block">
                      {cacheStats ? cacheStats.formatted_size : '...'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-[var(--text-secondary)] block">Количество файлов</span>
                    <span className="text-sm font-semibold text-[var(--text-main)]/80 mt-0.5 block">
                      {cacheStats ? `${cacheStats.file_count} треков` : 'Загрузка...'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={loadCacheStats}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-main)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-main)] rounded-xl text-xs font-semibold text-[var(--text-main)] transition-all cursor-pointer active:scale-95"
                  >
                    <RefreshCw size={14} />
                    Обновить данные
                  </button>

                  <button
                    onClick={handleClearCache}
                    disabled={isClearingCache || !cacheStats || cacheStats.file_count === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={14} />
                    {isClearingCache ? 'Очистка...' : 'Очистить кэш треков'}
                  </button>
                </div>
              </div>

              {/* Card: How it works */}
              <div className={`${customWallpaper ? 'bg-black/50 backdrop-blur-md' : 'bg-[var(--bg-surface)]'} border border-[var(--border-main)] rounded-2xl p-5 shadow-sm`}>
                <span className="text-[14px] font-semibold text-[var(--text-main)] tracking-tight block mb-2">
                  Как кэшировать композиции?
                </span>
                <ul className="text-[12px] text-[var(--text-secondary)] space-y-2 list-disc list-inside leading-relaxed">
                  <li>Нажмите на три точки <span className="text-[var(--text-main)] bg-[var(--bg-main)] border border-[var(--border-main)] px-1.5 py-0.5 rounded-md font-mono text-[11px]">...</span> у любого трека в очереди, поиске или коллекциях.</li>
                  <li>Выберите пункт <span className="text-[var(--text-main)] font-medium">«Кэшировать»</span> для мгновенного сохранения.</li>
                  <li>Для локальных файлов трек продолжит играть даже после перемещения или удаления оригинала.</li>
                </ul>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

