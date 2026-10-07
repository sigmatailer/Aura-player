import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, HardDrive, 
  Moon, Sun, Monitor, Plus, Image as ImageIcon, Trash2,
  ChevronLeft, ChevronRight, Upload, Package, Disc, Sparkles, Check, Camera, Loader2,
  Send, Globe, Pin, Music
} from 'lucide-react';
import { useSettingsStore, usePlayerStore } from '../store/usePlayerStore';
import { useAppSettingsStore } from '../store/useAppSettingsStore';
import { useThemeStore, PRESET_THEMES, AVAILABLE_FONTS, isVideoUrl, MediaLibraryItem } from '../store/useThemeStore';
import { useAuthStore, CloudUser } from '../store/useAuthStore';
import { pocketBaseService } from '../services/PocketBaseService';
import { useCacheStore, CacheStats } from '../store/useCacheStore';
import { 
  PROFILE_COLORS, NICKNAME_FONTS, NICKNAME_EFFECTS, 
  getNicknameFontFamily, getNicknameEffectStyle, 
  NicknameFont, NicknameEffect 
} from '../utils/profileStyles';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { convertFileSrc } from '@tauri-apps/api/core';

// Discord Icon SVG
const DiscordIcon: React.FC<{ size?: number; className?: string }> = ({ size = 15, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

interface SettingsDrawerProps {
  onClose: () => void;
  initialTab?: string;
}

type MainTab = 'profile' | 'general' | 'interface' | 'services' | 'integrations';
type ProfileSubTab = 'edit' | 'security' | 'subscription' | 'privacy';
type GeneralSubTab = 'general' | 'audio' | 'storage' | 'keybinds' | 'overlay';
type InterfaceSubTab = 'view' | 'customization' | 'player';

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ onClose, initialTab }) => {
  const { user } = useAuthStore();
  const { yandexToken, setYandexToken } = useSettingsStore();
  const { miniPlayerStyle, setMiniPlayerStyle } = usePlayerStore();
  const { 
    language, 
    autolaunch, setAutolaunch, 
    minimizeToTray, setMinimizeToTray, 
    autoSimilar, setAutoSimilar, 
    startupMode, setStartupMode,
    t
  } = useAppSettingsStore();
  const { 
    currentThemeId, setTheme,
    customThemes, addCustomTheme, deleteCustomTheme,
    fontId, setFontId,
    fontSize, setFontSize,
    fontWeight, setFontWeight,
    customSlots, mediaLibrary,
    addMediaItem, removeMediaItem,
    setSlotMedia, clearSlot,
    transparencyEnabled, setTransparencyEnabled,
    windowOpacity, setWindowOpacity,
    glassStrength, setGlassStrength,
    glassBlur, setGlassBlur,
    customWallpaper, trackTheme
  } = useThemeStore();
  const { getCacheStats, clearCache } = useCacheStore();

  // Navigation State
  const [mainTab, setMainTab] = useState<MainTab>(() => {
    if (initialTab === 'services') return 'services';
    if (initialTab === 'appearance' || initialTab === 'customization') return 'interface';
    if (initialTab === 'cache') return 'general';
    return 'profile';
  });

  const [profileSubTab, setProfileSubTab] = useState<ProfileSubTab>('edit');
  const [generalSubTab, setGeneralSubTab] = useState<GeneralSubTab>(initialTab === 'cache' ? 'storage' : 'general');
  const [interfaceSubTab, setInterfaceSubTab] = useState<InterfaceSubTab>(initialTab === 'customization' ? 'customization' : 'view');

  // Profile Form States
  const [nickname, setNickname] = useState(user?.name || user?.username || 'User');
  const [username, setUsername] = useState(user?.username || user?.name || 'User');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '');
  const [bannerUrl, setBannerUrl] = useState(user?.banner || '');
  const [bgUrl, setBgUrl] = useState('');
  const [statusText, setStatusText] = useState(user?.status || '');
  const [bioText, setBioText] = useState(user?.bio || '');
  const [profileColor, setProfileColor] = useState(user?.profileColor || '');
  const [nicknameFont, setNicknameFont] = useState<NicknameFont>(user?.nicknameFont || 'default');
  const [nicknameEffect, setNicknameEffect] = useState<NicknameEffect>(user?.nicknameEffect || 'none');
  const [discord, setDiscord] = useState(user?.discord || '');
  const [telegram, setTelegram] = useState(user?.telegram || '');
  const [website, setWebsite] = useState(user?.website || '');
  const [pinnedTrackId, setPinnedTrackId] = useState(user?.pinnedTrackId || '');
  const [pinnedTrackTitle, setPinnedTrackTitle] = useState(user?.pinnedTrackTitle || '');
  const [pinnedTrackArtist, setPinnedTrackArtist] = useState(user?.pinnedTrackArtist || '');
  const [pinnedTrackCover, setPinnedTrackCover] = useState(user?.pinnedTrackCover || '');
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const focusedFieldRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<any>(null);
  const isInitialMount = useRef(true);

  // Customization State
  const [isUrlInputOpen, setIsUrlInputOpen] = useState(false);
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [draggedMediaItem, setDraggedMediaItem] = useState<MediaLibraryItem | null>(null);
  const [pointerDragItem, setPointerDragItem] = useState<MediaLibraryItem | null>(null);
  const [pointerDragPos, setPointerDragPos] = useState<{ x: number; y: number } | null>(null);
  const [pointerHoverSlot, setPointerHoverSlot] = useState<number | null>(null);

  const handleStartPointerDrag = (e: React.PointerEvent, item: MediaLibraryItem) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    setPointerDragItem(item);
    setPointerDragPos({ x: e.clientX, y: e.clientY });

    const onPointerMove = (moveEv: PointerEvent) => {
      setPointerDragPos({ x: moveEv.clientX, y: moveEv.clientY });

      const elem = document.elementFromPoint(moveEv.clientX, moveEv.clientY);
      const slotEl = elem?.closest('[data-slot-idx]');
      if (slotEl) {
        const sIdx = parseInt(slotEl.getAttribute('data-slot-idx') || '-1', 10);
        setPointerHoverSlot(sIdx >= 0 ? sIdx : null);
      } else {
        setPointerHoverSlot(null);
      }
    };

    const onPointerUp = (upEv: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      const elem = document.elementFromPoint(upEv.clientX, upEv.clientY);
      const slotEl = elem?.closest('[data-slot-idx]');
      if (slotEl) {
        const sIdx = parseInt(slotEl.getAttribute('data-slot-idx') || '-1', 10);
        if (sIdx >= 0 && sIdx < 5) {
          setSlotMedia(sIdx, item);
        }
      }
      setPointerDragItem(null);
      setPointerDragPos(null);
      setPointerHoverSlot(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Interface Settings States
  const [themeMode, setThemeMode] = useState<'dark' | 'light' | 'system'>('dark');
  const [fontCategory, setFontCategory] = useState<string>('system');
  const fontScrollRef = useRef<HTMLDivElement>(null);

  // Non-passive wheel event to guarantee horizontal scroll and prevent vertical page jumping
  useEffect(() => {
    const el = fontScrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        e.stopPropagation();
        el.scrollLeft += e.deltaY * 1.5;
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [mainTab, interfaceSubTab, fontCategory]);

  // Custom Theme Editor States
  const [isThemeEditorOpen, setIsThemeEditorOpen] = useState(false);
  const [newThemeName, setNewThemeName] = useState('');
  const [newBgMain, setNewBgMain] = useState('#121214');
  const [newBgSurface, setNewBgSurface] = useState('#18181c');
  const [newAccent, setNewAccent] = useState('#ff5500');
  const [newTextMain, setNewTextMain] = useState('#ffffff');
  const [newTextSecondary, setNewTextSecondary] = useState('#888888');
  const [newBorderMain, setNewBorderMain] = useState('#26262e');

  const handleSaveCustomTheme = () => {
    const name = newThemeName.trim() || 'Моя тема';
    const id = 'custom-' + Date.now();
    addCustomTheme({
      id,
      name,
      swatch: { c1: newAccent, c2: newBgMain },
      colors: {
        bgMain: newBgMain,
        bgSurface: newBgSurface,
        bgSurfaceHover: newBgSurface,
        textMain: newTextMain,
        textSecondary: newTextSecondary,
        borderMain: newBorderMain,
        accent: newAccent,
        accentHover: newAccent
      }
    });
    setTheme(id);
    setIsThemeEditorOpen(false);
    setNewThemeName('');
  };

  // Cache stats
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);

  // Yandex Token input
  const [yaInputToken, setYaInputToken] = useState('');

  useEffect(() => {
    if (generalSubTab === 'storage' && mainTab === 'general') {
      getCacheStats().then(setCacheStats).catch(console.error);
    }
  }, [generalSubTab, mainTab]);

  const lastSavedValuesRef = useRef({
    nickname,
    avatarUrl,
    bannerUrl,
    statusText,
    bioText,
    profileColor,
    nicknameFont,
    nicknameEffect,
    discord,
    telegram,
    website,
    pinnedTrackId,
    pinnedTrackTitle,
    pinnedTrackArtist,
    pinnedTrackCover
  });

  useEffect(() => {
    if (user) {
      if (focusedFieldRef.current !== 'nickname' && user.name !== undefined && user.name !== nickname) {
        setNickname(user.name);
        lastSavedValuesRef.current.nickname = user.name;
      }
      if (user.username) setUsername(user.username);
      if (focusedFieldRef.current !== 'avatar' && (user.avatar ?? '') !== avatarUrl) {
        setAvatarUrl(user.avatar || '');
        lastSavedValuesRef.current.avatarUrl = user.avatar || '';
      }
      if (focusedFieldRef.current !== 'banner' && (user.banner ?? '') !== bannerUrl) {
        setBannerUrl(user.banner || '');
        lastSavedValuesRef.current.bannerUrl = user.banner || '';
      }
      if (focusedFieldRef.current !== 'status' && (user.status ?? '') !== statusText) {
        setStatusText(user.status || '');
        lastSavedValuesRef.current.statusText = user.status || '';
      }
      if (focusedFieldRef.current !== 'bio' && (user.bio ?? '') !== bioText) {
        setBioText(user.bio || '');
        lastSavedValuesRef.current.bioText = user.bio || '';
      }
      if ((user.profileColor ?? '') !== profileColor) {
        setProfileColor(user.profileColor || '');
        lastSavedValuesRef.current.profileColor = user.profileColor || '';
      }
      if (user.nicknameFont && user.nicknameFont !== nicknameFont) {
        setNicknameFont(user.nicknameFont);
        lastSavedValuesRef.current.nicknameFont = user.nicknameFont;
      }
      if (user.nicknameEffect && user.nicknameEffect !== nicknameEffect) {
        setNicknameEffect(user.nicknameEffect);
        lastSavedValuesRef.current.nicknameEffect = user.nicknameEffect;
      }
      if (focusedFieldRef.current !== 'discord' && (user.discord ?? '') !== discord) {
        setDiscord(user.discord || '');
        lastSavedValuesRef.current.discord = user.discord || '';
      }
      if (focusedFieldRef.current !== 'telegram' && (user.telegram ?? '') !== telegram) {
        setTelegram(user.telegram || '');
        lastSavedValuesRef.current.telegram = user.telegram || '';
      }
      if (focusedFieldRef.current !== 'website' && (user.website ?? '') !== website) {
        setWebsite(user.website || '');
        lastSavedValuesRef.current.website = user.website || '';
      }
      if ((user.pinnedTrackId ?? '') !== pinnedTrackId) {
        setPinnedTrackId(user.pinnedTrackId || '');
        setPinnedTrackTitle(user.pinnedTrackTitle || '');
        setPinnedTrackArtist(user.pinnedTrackArtist || '');
        setPinnedTrackCover(user.pinnedTrackCover || '');
        lastSavedValuesRef.current.pinnedTrackId = user.pinnedTrackId || '';
        lastSavedValuesRef.current.pinnedTrackTitle = user.pinnedTrackTitle || '';
        lastSavedValuesRef.current.pinnedTrackArtist = user.pinnedTrackArtist || '';
        lastSavedValuesRef.current.pinnedTrackCover = user.pinnedTrackCover || '';
      }
    }
  }, [user]);

  const handleClearCache = async () => {
    if (!window.confirm('Вы действительно хотите очистить весь кэш треков?')) return;
    try {
      setIsClearingCache(true);
      await clearCache();
      const stats = await getCacheStats();
      setCacheStats(stats);
    } finally {
      setIsClearingCache(false);
    }
  };

  const fieldsRef = useRef({
    nickname,
    avatarUrl,
    bannerUrl,
    statusText,
    bioText,
    profileColor,
    nicknameFont,
    nicknameEffect,
    discord,
    telegram,
    website,
    pinnedTrackId,
    pinnedTrackTitle,
    pinnedTrackArtist,
    pinnedTrackCover
  });

  useEffect(() => {
    fieldsRef.current = {
      nickname,
      avatarUrl,
      bannerUrl,
      statusText,
      bioText,
      profileColor,
      nicknameFont,
      nicknameEffect,
      discord,
      telegram,
      website,
      pinnedTrackId,
      pinnedTrackTitle,
      pinnedTrackArtist,
      pinnedTrackCover
    };
  }, [nickname, avatarUrl, bannerUrl, statusText, bioText, profileColor, nicknameFont, nicknameEffect, discord, telegram, website, pinnedTrackId, pinnedTrackTitle, pinnedTrackArtist, pinnedTrackCover]);

  const flushSaveProfile = useCallback(async (
    overrides?: Partial<CloudUser>,
    blobs?: { avatarBlob?: Blob; bannerBlob?: Blob }
  ) => {
    const current = fieldsRef.current;

    const activeName = overrides?.name !== undefined ? overrides.name : current.nickname.trim();
    const activeAvatar = overrides?.avatar !== undefined ? overrides.avatar : current.avatarUrl.trim();
    const activeBanner = overrides?.banner !== undefined ? overrides.banner : current.bannerUrl.trim();
    const activeStatus = overrides?.status !== undefined ? overrides.status : current.statusText.trim();
    const activeBio = overrides?.bio !== undefined ? overrides.bio : current.bioText.trim();
    const activeColor = overrides?.profileColor !== undefined ? overrides.profileColor : current.profileColor;
    const activeFont = overrides?.nicknameFont !== undefined ? overrides.nicknameFont : current.nicknameFont;
    const activeEffect = overrides?.nicknameEffect !== undefined ? overrides.nicknameEffect : current.nicknameEffect;
    const activeDiscord = overrides?.discord !== undefined ? overrides.discord : current.discord.trim();
    const activeTelegram = overrides?.telegram !== undefined ? overrides.telegram : current.telegram.trim();
    const activeWebsite = overrides?.website !== undefined ? overrides.website : current.website.trim();
    const activePinnedId = overrides?.pinnedTrackId !== undefined ? overrides.pinnedTrackId : current.pinnedTrackId;
    const activePinnedTitle = overrides?.pinnedTrackTitle !== undefined ? overrides.pinnedTrackTitle : current.pinnedTrackTitle;
    const activePinnedArtist = overrides?.pinnedTrackArtist !== undefined ? overrides.pinnedTrackArtist : current.pinnedTrackArtist;
    const activePinnedCover = overrides?.pinnedTrackCover !== undefined ? overrides.pinnedTrackCover : current.pinnedTrackCover;

    lastSavedValuesRef.current = {
      nickname: activeName || '',
      avatarUrl: activeAvatar || '',
      bannerUrl: activeBanner || '',
      statusText: activeStatus || '',
      bioText: activeBio || '',
      profileColor: activeColor || '',
      nicknameFont: activeFont || 'default',
      nicknameEffect: activeEffect || 'none',
      discord: activeDiscord || '',
      telegram: activeTelegram || '',
      website: activeWebsite || '',
      pinnedTrackId: activePinnedId || '',
      pinnedTrackTitle: activePinnedTitle || '',
      pinnedTrackArtist: activePinnedArtist || '',
      pinnedTrackCover: activePinnedCover || ''
    };

    const profileFields: any = {};
    if (activeName !== undefined) profileFields.name = activeName;
    if (activeAvatar !== undefined) profileFields.avatar = activeAvatar;
    if (activeBanner !== undefined) profileFields.banner = activeBanner;
    if (activeStatus !== undefined) profileFields.status = activeStatus;
    if (activeBio !== undefined) profileFields.bio = activeBio;
    if (activeColor !== undefined) profileFields.profileColor = activeColor;
    if (activeFont !== undefined) profileFields.nicknameFont = activeFont;
    if (activeEffect !== undefined) profileFields.nicknameEffect = activeEffect;
    if (activeDiscord !== undefined) profileFields.discord = activeDiscord;
    if (activeTelegram !== undefined) profileFields.telegram = activeTelegram;
    if (activeWebsite !== undefined) profileFields.website = activeWebsite;
    if (activePinnedId !== undefined) profileFields.pinnedTrackId = activePinnedId;
    if (activePinnedTitle !== undefined) profileFields.pinnedTrackTitle = activePinnedTitle;
    if (activePinnedArtist !== undefined) profileFields.pinnedTrackArtist = activePinnedArtist;
    if (activePinnedCover !== undefined) profileFields.pinnedTrackCover = activePinnedCover;
    if (blobs?.avatarBlob) profileFields.avatarBlob = blobs.avatarBlob;
    if (blobs?.bannerBlob) profileFields.bannerBlob = blobs.bannerBlob;

    // Immediately update local store
    useAuthStore.getState().updateUser(profileFields);

    setIsAutoSaving(true);
    try {
      await pocketBaseService.updateProfile(profileFields);
    } catch (err) {
      console.warn('Auto-save profile error:', err);
    } finally {
      setIsAutoSaving(false);
    }
  }, []);

  // Debounced auto-save on profile change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const saved = lastSavedValuesRef.current;
    if (
      nickname === saved.nickname &&
      avatarUrl === saved.avatarUrl &&
      bannerUrl === saved.bannerUrl &&
      statusText === saved.statusText &&
      bioText === saved.bioText &&
      profileColor === saved.profileColor &&
      nicknameFont === saved.nicknameFont &&
      nicknameEffect === saved.nicknameEffect &&
      discord === saved.discord &&
      telegram === saved.telegram &&
      website === saved.website &&
      pinnedTrackId === saved.pinnedTrackId
    ) {
      return;
    }

    setIsAutoSaving(true);
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      flushSaveProfile();
    }, 700);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [nickname, avatarUrl, bannerUrl, statusText, bioText, profileColor, nicknameFont, nicknameEffect, discord, telegram, website, pinnedTrackId, flushSaveProfile]);

  const handleSelectFile = async (setter: (val: string) => void, field?: 'avatar' | 'banner') => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Изображения', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
      });
      if (selected && typeof selected === 'string') {
        const safeUrl = convertFileSrc(selected);
        setter(safeUrl);

        let blob: Blob | undefined;
        try {
          const fileBytes = await readFile(selected);
          const ext = selected.split('.').pop()?.toLowerCase() || 'jpg';
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
          blob = new Blob([fileBytes], { type: mime });
        } catch (e) {
          console.warn('Could not read image file directly via plugin-fs:', e);
        }

        if (field) {
          useAuthStore.getState().updateUser({ [field]: safeUrl });
          const blobPayload = field === 'avatar' ? { avatarBlob: blob } : { bannerBlob: blob };
          flushSaveProfile({ [field]: safeUrl }, blobPayload);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePickLocalMedia = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          { name: 'Медиа (Изображения, GIF, Видео)', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov'] }
        ]
      });
      if (selected) {
        const files = Array.isArray(selected) ? selected : [selected];
        files.forEach(filePath => {
          const safeUrl = convertFileSrc(filePath);
          const isVid = isVideoUrl(filePath);
          const isG = filePath.toLowerCase().endsWith('.gif');
          const name = filePath.split(/[/\\]/).pop() || 'Медиа';
          addMediaItem({
            id: 'med-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
            name,
            url: safeUrl,
            type: isVid ? 'video' : (isG ? 'gif' : 'image'),
            createdAt: Date.now()
          });
        });
      }
    } catch (err) {
      console.error('File pick error:', err);
    }
  };

  const handleAddMediaUrl = () => {
    const raw = mediaUrlInput.trim();
    if (!raw) return;
    const isVid = isVideoUrl(raw);
    const isG = raw.toLowerCase().includes('.gif');
    addMediaItem({
      id: 'med-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      name: isVid ? 'Видео' : (isG ? 'GIF' : 'Изображение'),
      url: raw,
      type: isVid ? 'video' : (isG ? 'gif' : 'image'),
      createdAt: Date.now()
    });
    setMediaUrlInput('');
  };

  return (
    <motion.aside
      initial={{ x: '-105%', opacity: 0 }}
      animate={{ x: '0%', opacity: 1 }}
      exit={{ x: '-105%', opacity: 0 }}
      transition={{
        type: 'spring',
        stiffness: 240,
        damping: 30,
        mass: 0.85
      }}
      className="absolute top-3 bottom-3 left-3 w-[55%] min-w-[560px] max-w-[720px] rounded-[32px] border z-50 flex flex-col overflow-hidden select-none text-[var(--text-main)] font-sans"
      style={{ 
        backgroundColor: transparencyEnabled && customWallpaper
          ? `rgba(14, 14, 18, ${Math.max(0.12, (windowOpacity / 100) * 0.85)})`
          : 'var(--bg-surface)',
        backdropFilter: transparencyEnabled && customWallpaper && glassBlur > 0
          ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.5}%)`
          : undefined,
        WebkitBackdropFilter: transparencyEnabled && customWallpaper && glassBlur > 0
          ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.5}%)`
          : undefined,
        borderColor: transparencyEnabled ? `rgba(255, 255, 255, ${0.08 + (glassStrength / 100) * 0.16})` : 'var(--border-main)',
        boxShadow: `0 30px 90px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,${0.08 + (glassStrength / 100) * 0.20})`
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1. TOP HEADER (Main Navigation Tabs + Close Button) */}
      <div className="flex items-center justify-between px-8 pt-6 pb-4 border-b border-[var(--border-main)] shrink-0">
        <div className="flex items-center gap-7 overflow-x-auto scrollbar-hide py-1">
          {[
            { id: 'profile', label: t('tab_account') },
            { id: 'general', label: t('tab_general') },
            { id: 'interface', label: t('tab_appearance') },
            { id: 'services', label: t('subtab_services') },
            { id: 'integrations', label: language === 'ru' ? 'Интеграции' : 'Integrations' }
          ].map(tab => {
            const isActive = mainTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setMainTab(tab.id as MainTab)}
                className={`text-[15px] font-bold transition-all relative pb-3 cursor-pointer whitespace-nowrap tracking-tight ${
                  isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                }`}
              >
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="main-nav-indicator"
                    className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[var(--accent)] rounded-full"
                    transition={{ duration: 0.2 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Close Button */}
        <button
          onClick={() => {
            if (autoSaveTimerRef.current) {
              clearTimeout(autoSaveTimerRef.current);
            }
            flushSaveProfile();
            onClose();
          }}
          className="p-2 rounded-full hover:bg-[var(--bg-surface-hover)] border border-transparent hover:border-[var(--border-main)] text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-all cursor-pointer shrink-0 ml-4"
          title={language === 'ru' ? 'Закрыть настройки' : 'Close settings'}
        >
          <X size={18} />
        </button>
      </div>

      {/* 2. SUBTABS CAPSULE BAR (Matching Dotify 'tr' component) */}
      <div className="px-8 pt-5 pb-2 shrink-0">
        {mainTab === 'profile' && (
          <div className="flex items-center p-1 bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-full w-full gap-0.5">
            {[
              { id: 'edit', label: t('subtab_edit') },
              { id: 'security', label: language === 'ru' ? 'Безопасность' : 'Security' },
              { id: 'subscription', label: language === 'ru' ? 'Подписка' : 'Subscription' },
              { id: 'privacy', label: language === 'ru' ? 'Приватность' : 'Privacy' }
            ].map(tab => {
              const isActive = profileSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setProfileSubTab(tab.id as ProfileSubTab)}
                  className={`relative flex-1 h-8 rounded-full flex items-center justify-center text-[12.5px] transition-all cursor-pointer select-none font-semibold ${
                    isActive ? 'text-[var(--accent-contrast)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] font-medium'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="subtab-pill-profile"
                      className="absolute inset-0 bg-[var(--accent)] rounded-full shadow-sm"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {mainTab === 'general' && (
          <div className="flex items-center p-1 bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-full w-full gap-0.5">
            {[
              { id: 'general', label: t('subtab_general') },
              { id: 'audio', label: language === 'ru' ? 'Аудио' : 'Audio' },
              { id: 'storage', label: t('subtab_storage') },
              { id: 'keybinds', label: language === 'ru' ? 'Бинды' : 'Shortcuts' },
              { id: 'overlay', label: language === 'ru' ? 'Оверлей' : 'Overlay' }
            ].map(tab => {
              const isActive = generalSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setGeneralSubTab(tab.id as GeneralSubTab)}
                  className={`relative flex-1 h-8 rounded-full flex items-center justify-center text-[12.5px] transition-all cursor-pointer select-none font-semibold ${
                    isActive ? 'text-[var(--accent-contrast)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] font-medium'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="subtab-pill-general"
                      className="absolute inset-0 bg-[var(--accent)] rounded-full shadow-sm"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {mainTab === 'interface' && (
          <div className="flex items-center p-1 bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-full w-full gap-0.5">
            {[
              { id: 'view', label: language === 'ru' ? 'Вид' : 'View' },
              { id: 'customization', label: language === 'ru' ? 'Кастомизация' : 'Customization' },
              { id: 'player', label: language === 'ru' ? 'Плеер' : 'Player' }
            ].map(tab => {
              const isActive = interfaceSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setInterfaceSubTab(tab.id as InterfaceSubTab)}
                  className={`relative flex-1 h-8 rounded-full flex items-center justify-center text-[12.5px] transition-all cursor-pointer select-none font-semibold ${
                    isActive ? 'text-[var(--accent-contrast)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] font-medium'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="subtab-pill-interface"
                      className="absolute inset-0 bg-[var(--accent)] rounded-full shadow-sm"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. MAIN SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-8 py-5 space-y-6">

        {/* ===================== TAB 1: ПРОФИЛЬ ===================== */}
        {mainTab === 'profile' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {profileSubTab === 'edit' ? (
              <>
                {/* Hero Preview Card - Compact and Clean */}
                <div 
                  className="relative h-[96px] w-full rounded-2xl p-4 border border-[var(--border-main)] bg-[var(--bg-surface)] overflow-hidden flex items-center justify-between gap-4 shadow-sm transition-all"
                  style={{
                    background: bannerUrl 
                      ? `url(${bannerUrl}) center/cover no-repeat`
                      : profileColor 
                        ? `linear-gradient(135deg, ${profileColor} 0%, rgba(20, 20, 28, 0.95) 100%)`
                        : undefined
                  }}
                >
                  {bannerUrl && (
                    <div 
                      className="absolute inset-0 bg-cover bg-center opacity-40 transition-all duration-300"
                      style={{ backgroundImage: `url(${bannerUrl})` }}
                    />
                  )}

                  <div className="relative z-10 flex items-center gap-3.5 drop-shadow-sm min-w-0">
                    <div className="relative group w-14 h-14 rounded-full bg-[var(--bg-surface-hover)] border-2 border-[var(--border-main)] overflow-hidden flex items-center justify-center font-bold text-xl text-[var(--text-main)] shadow-md shrink-0">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        nickname ? nickname.charAt(0).toUpperCase() : (username ? username.charAt(0).toUpperCase() : 'U')
                      )}
                      <button
                        onClick={() => handleSelectFile(setAvatarUrl, 'avatar')}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity cursor-pointer"
                        title="Выбрать аватар с компьютера"
                      >
                        <Camera size={18} />
                      </button>
                    </div>
                    <div className="min-w-0">
                      <h3 
                        className="text-base font-bold text-[var(--text-main)] tracking-tight leading-snug truncate"
                        style={{
                          fontFamily: getNicknameFontFamily(nicknameFont),
                          ...getNicknameEffectStyle(nicknameEffect)
                        }}
                      >
                        {nickname || 'User'}
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] font-mono truncate">
                        @{username || 'User'}
                      </p>
                    </div>
                  </div>

                  <div className="relative z-10 flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md select-none transition-all">
                      {isAutoSaving ? (
                        <>
                          <Loader2 size={12} className="animate-spin text-[var(--accent)]" />
                          <span className="text-[11px] font-medium text-white/70">Сохранение...</span>
                        </>
                      ) : (
                        <>
                          <Check size={12} className="text-emerald-400" />
                          <span className="text-[11px] font-medium text-emerald-400/90">Синхронизировано</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Form Fields matching Screenshot 1 */}
                <div className="space-y-4">
                  {/* Аватар */}
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-white tracking-tight block">Аватар</label>
                    <div className="relative flex items-center">
                      <input 
                        type="text"
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        onFocus={() => { focusedFieldRef.current = 'avatar'; }}
                        onBlur={() => {
                          focusedFieldRef.current = null;
                          flushSaveProfile({ avatar: avatarUrl.trim() });
                        }}
                        placeholder="Ссылка на аватарку или выберите файл"
                        className="w-full h-11 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 focus:border-white/35 focus:outline-none px-4 pr-12 text-sm text-white placeholder-white/25 transition-all"
                      />
                      <button 
                        onClick={() => handleSelectFile(setAvatarUrl, 'avatar')}
                        className="absolute right-3 p-1.5 text-white/40 hover:text-white transition-colors cursor-pointer"
                        title="Выбрать файл с компьютера"
                      >
                        <ImageIcon size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Баннер */}
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-white tracking-tight block">Баннер</label>
                    <div className="relative flex items-center">
                      <input 
                        type="text"
                        value={bannerUrl}
                        onChange={(e) => setBannerUrl(e.target.value)}
                        onFocus={() => { focusedFieldRef.current = 'banner'; }}
                        onBlur={() => {
                          focusedFieldRef.current = null;
                          flushSaveProfile({ banner: bannerUrl.trim() });
                        }}
                        placeholder="Ссылка на баннер или выберите файл"
                        className="w-full h-11 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 focus:border-white/35 focus:outline-none px-4 pr-12 text-sm text-white placeholder-white/25 transition-all"
                      />
                      <button 
                        onClick={() => handleSelectFile(setBannerUrl, 'banner')}
                        className="absolute right-3 p-1.5 text-white/40 hover:text-white transition-colors cursor-pointer"
                        title="Выбрать файл с компьютера"
                      >
                        <ImageIcon size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Фон */}
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-white tracking-tight block">Фон</label>
                    <div className="relative flex items-center">
                      <input 
                        type="text"
                        value={bgUrl}
                        onChange={(e) => {
                          setBgUrl(e.target.value);
                          if (e.target.value) {
                            setSlotMedia(0, {
                              id: 'bg-' + Date.now(),
                              name: 'Фон',
                              url: e.target.value,
                              type: isVideoUrl(e.target.value) ? 'video' : 'image'
                            });
                          }
                        }}
                        onFocus={() => { focusedFieldRef.current = 'bg'; }}
                        onBlur={() => { focusedFieldRef.current = null; }}
                        placeholder="Ссылка на фон"
                        className="w-full h-11 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 focus:border-white/35 focus:outline-none px-4 pr-12 text-sm text-white placeholder-white/25 transition-all"
                      />
                      <button 
                        onClick={() => handleSelectFile(setBgUrl)}
                        className="absolute right-3 p-1.5 text-white/40 hover:text-white transition-colors cursor-pointer"
                        title="Выбрать файл"
                      >
                        <ImageIcon size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Никнейм */}
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-white tracking-tight block">Никнейм</label>
                    <div className="relative flex items-center">
                      <input 
                        type="text"
                        maxLength={32}
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        onFocus={() => { focusedFieldRef.current = 'nickname'; }}
                        onBlur={() => {
                          focusedFieldRef.current = null;
                          flushSaveProfile({ name: nickname.trim() });
                        }}
                        placeholder="Ваш никнейм"
                        className="w-full h-11 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 focus:border-white/35 focus:outline-none px-4 pr-14 text-sm text-white placeholder-white/25 transition-all"
                      />
                      <span className="absolute right-4 text-xs text-white/40 font-mono select-none">
                        {nickname.length}/32
                      </span>
                    </div>
                  </div>

                  {/* Имя пользователя (Read-only as required) */}
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-white tracking-tight block">Имя пользователя</label>
                    <div className="relative flex items-center">
                      <input 
                        type="text"
                        readOnly
                        value={username}
                        placeholder="User"
                        className="w-full h-11 rounded-xl bg-white/[0.02] border border-white/[0.06] px-4 pr-14 text-sm text-white/80 cursor-not-allowed select-all focus:outline-none font-mono"
                      />
                      <span className="absolute right-4 text-xs text-white/40 font-mono select-none">
                        {username.length}/20
                      </span>
                    </div>
                  </div>

                  {/* Статус */}
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-white tracking-tight block">Статус</label>
                    <div className="relative flex items-center">
                      <input 
                        type="text"
                        maxLength={64}
                        value={statusText}
                        onChange={(e) => setStatusText(e.target.value)}
                        onFocus={() => { focusedFieldRef.current = 'status'; }}
                        onBlur={() => {
                          focusedFieldRef.current = null;
                          flushSaveProfile({ status: statusText.trim() });
                        }}
                        placeholder="Что у вас нового?"
                        className="w-full h-11 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 focus:border-white/35 focus:outline-none px-4 pr-14 text-sm text-white placeholder-white/25 transition-all"
                      />
                      <span className="absolute right-4 text-xs text-white/40 font-mono select-none">
                        {statusText.length}/64
                      </span>
                    </div>
                  </div>

                  {/* О себе */}
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-white tracking-tight block">О себе</label>
                    <div className="relative">
                      <textarea 
                        maxLength={150}
                        rows={3}
                        value={bioText}
                        onChange={(e) => setBioText(e.target.value)}
                        onFocus={() => { focusedFieldRef.current = 'bio'; }}
                        onBlur={() => {
                          focusedFieldRef.current = null;
                          flushSaveProfile({ bio: bioText.trim() });
                        }}
                        placeholder="Расскажите о себе"
                        className="w-full rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 focus:border-white/35 focus:outline-none p-4 pb-8 text-sm text-white placeholder-white/25 resize-none transition-all"
                      />
                      <span className="absolute bottom-3 right-4 text-xs text-white/40 font-mono select-none">
                        {bioText.length}/150
                      </span>
                    </div>
                  </div>

                  {/* Цвет профиля */}
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-white tracking-tight block">Цвет профиля</label>
                    <div className="flex items-center gap-2.5 flex-wrap p-3 rounded-2xl bg-white/[0.02] border border-white/10">
                      {PROFILE_COLORS.map((col) => {
                        const isSelected = (profileColor || '') === col.value;
                        return (
                          <button
                            key={col.id}
                            type="button"
                            onClick={() => {
                              setProfileColor(col.value);
                              flushSaveProfile({ profileColor: col.value });
                            }}
                            className={`w-8 h-8 rounded-full border-2 transition-all cursor-pointer relative flex items-center justify-center ${
                              isSelected ? 'scale-110 border-white ring-2 ring-white/40' : 'border-white/20 hover:scale-105 hover:border-white/50'
                            }`}
                            style={{ backgroundColor: col.value || '#18181f' }}
                            title={col.label}
                          >
                            {!col.value && <span className="text-[10px] text-white/50 font-bold">∅</span>}
                            {isSelected && <Check size={14} className={col.id === 'yellow' ? 'text-black' : 'text-white'} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Шрифт никнейма */}
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-white tracking-tight block">Шрифт никнейма</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {NICKNAME_FONTS.map((f) => {
                        const isSelected = nicknameFont === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => {
                              setNicknameFont(f.id);
                              flushSaveProfile({ nicknameFont: f.id });
                            }}
                            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between h-20 ${
                              isSelected
                                ? 'bg-white/[0.08] border-white/40 shadow-md ring-1 ring-white/30'
                                : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                            }`}
                          >
                            <span className="text-[11px] font-semibold text-white/60">{f.label}</span>
                            <span 
                              className="text-base text-white truncate"
                              style={{ fontFamily: getNicknameFontFamily(f.id) }}
                            >
                              Aa Никнейм
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Эффект никнейма */}
                  <div className="space-y-2">
                    <label className="text-[13px] font-bold text-white tracking-tight block">Эффект никнейма</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {NICKNAME_EFFECTS.map((eff) => {
                        const isSelected = nicknameEffect === eff.id;
                        return (
                          <button
                            key={eff.id}
                            type="button"
                            onClick={() => {
                              setNicknameEffect(eff.id);
                              flushSaveProfile({ nicknameEffect: eff.id });
                            }}
                            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between h-20 ${
                              isSelected
                                ? 'bg-white/[0.08] border-white/40 shadow-md ring-1 ring-white/30'
                                : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                            }`}
                          >
                            <span className="text-[11px] font-semibold text-white/60">{eff.label}</span>
                            <span 
                              className="text-base text-white truncate"
                              style={getNicknameEffectStyle(eff.id)}
                            >
                              Aa Никнейм
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Интеграции */}
                  <div className="space-y-3 pt-2">
                    <label className="text-[13px] font-bold text-white tracking-tight block">Интеграции</label>
                    
                    {/* Discord */}
                    <div className="space-y-1.5">
                      <div className="relative flex items-center">
                        <div className="absolute left-3.5 text-[#5865F2]">
                          <DiscordIcon size={16} />
                        </div>
                        <input
                          type="text"
                          maxLength={64}
                          value={discord}
                          onChange={(e) => setDiscord(e.target.value)}
                          onFocus={() => { focusedFieldRef.current = 'discord'; }}
                          onBlur={() => {
                            focusedFieldRef.current = null;
                            flushSaveProfile({ discord: discord.trim() });
                          }}
                          placeholder="Discord тег или никнейм"
                          className="w-full h-11 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 focus:border-white/35 focus:outline-none pl-10 pr-14 text-sm text-white placeholder-white/25 transition-all font-mono"
                        />
                        <span className="absolute right-4 text-xs text-white/40 font-mono select-none">
                          {discord.length}/64
                        </span>
                      </div>
                    </div>

                    {/* Telegram */}
                    <div className="space-y-1.5">
                      <div className="relative flex items-center">
                        <div className="absolute left-3.5 text-[#229ED9]">
                          <Send size={15} />
                        </div>
                        <input
                          type="text"
                          maxLength={64}
                          value={telegram}
                          onChange={(e) => setTelegram(e.target.value)}
                          onFocus={() => { focusedFieldRef.current = 'telegram'; }}
                          onBlur={() => {
                            focusedFieldRef.current = null;
                            flushSaveProfile({ telegram: telegram.trim() });
                          }}
                          placeholder="Telegram @username"
                          className="w-full h-11 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 focus:border-white/35 focus:outline-none pl-10 pr-14 text-sm text-white placeholder-white/25 transition-all font-mono"
                        />
                        <span className="absolute right-4 text-xs text-white/40 font-mono select-none">
                          {telegram.length}/64
                        </span>
                      </div>
                    </div>

                    {/* Website */}
                    <div className="space-y-1.5">
                      <div className="relative flex items-center">
                        <div className="absolute left-3.5 text-white/50">
                          <Globe size={15} />
                        </div>
                        <input
                          type="text"
                          maxLength={256}
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          onFocus={() => { focusedFieldRef.current = 'website'; }}
                          onBlur={() => {
                            focusedFieldRef.current = null;
                            flushSaveProfile({ website: website.trim() });
                          }}
                          placeholder="Сайт или ссылка (https://...)"
                          className="w-full h-11 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 focus:border-white/35 focus:outline-none pl-10 pr-16 text-sm text-white placeholder-white/25 transition-all"
                        />
                        <span className="absolute right-4 text-xs text-white/40 font-mono select-none">
                          {website.length}/256
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Закреплено */}
                  <div className="space-y-2 pt-2">
                    <label className="text-[13px] font-bold text-white tracking-tight flex items-center gap-1.5">
                      <Pin size={14} className="text-[var(--accent)]" />
                      <span>Закреплено</span>
                    </label>

                    {pinnedTrackTitle ? (
                      <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-xl bg-white/10 overflow-hidden shrink-0">
                            {pinnedTrackCover ? (
                              <img src={pinnedTrackCover} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Music size={18} className="m-auto text-white/40 h-full" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">{pinnedTrackTitle}</div>
                            <div className="text-[11px] text-white/50 truncate">{pinnedTrackArtist}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPinnedTrackId('');
                            setPinnedTrackTitle('');
                            setPinnedTrackArtist('');
                            setPinnedTrackCover('');
                            flushSaveProfile({
                              pinnedTrackId: '',
                              pinnedTrackTitle: '',
                              pinnedTrackArtist: '',
                              pinnedTrackCover: ''
                            });
                          }}
                          className="p-2 rounded-xl bg-white/[0.06] hover:bg-red-500/20 text-white/60 hover:text-red-400 transition-all cursor-pointer"
                          title="Открепить трек"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-white/50">
                          Закрепите любимый трек в профиле. Выберите из недавно прослушанных:
                        </p>
                        {usePlayerStore.getState().history && usePlayerStore.getState().history.length > 0 ? (
                          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {usePlayerStore.getState().history.slice(0, 5).map((tr) => (
                              <button
                                key={tr.id}
                                type="button"
                                onClick={() => {
                                  const cov = tr.customCoverPath || tr.originalCoverUrl || '';
                                  setPinnedTrackId(tr.id);
                                  setPinnedTrackTitle(tr.title);
                                  setPinnedTrackArtist(tr.artist);
                                  setPinnedTrackCover(cov);
                                  flushSaveProfile({
                                    pinnedTrackId: tr.id,
                                    pinnedTrackTitle: tr.title,
                                    pinnedTrackArtist: tr.artist,
                                    pinnedTrackCover: cov
                                  });
                                }}
                                className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 shrink-0 text-left transition-all cursor-pointer max-w-[180px]"
                              >
                                {(tr.customCoverPath || tr.originalCoverUrl) && (
                                  <img src={(tr.customCoverPath || tr.originalCoverUrl)!} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <div className="text-[11px] font-bold text-white truncate">{tr.title}</div>
                                  <div className="text-[10px] text-white/50 truncate">{tr.artist}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center text-xs text-white/40">
                            Включите любой трек, чтобы закрепить его в профиле
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-white/50 text-sm">
                Раздел «{profileSubTab === 'security' ? 'Безопасность' : profileSubTab === 'subscription' ? 'Подписка' : 'Приватность'}» настроен для вашего аккаунта.
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 2: ОБЩИЕ ===================== */}
        {mainTab === 'general' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {generalSubTab === 'general' && (
              <>
                {/* Switch Options */}
                <div className="space-y-4 pt-2">
                  {[
                    {
                      title: t('autolaunch_title'),
                      desc: t('autolaunch_desc'),
                      val: autolaunch,
                      toggle: () => setAutolaunch(!autolaunch)
                    },
                    {
                      title: t('tray_title'),
                      desc: t('tray_desc'),
                      val: minimizeToTray,
                      toggle: () => setMinimizeToTray(!minimizeToTray)
                    },
                    {
                      title: t('auto_similar_title'),
                      desc: t('auto_similar_desc'),
                      val: autoSimilar,
                      toggle: () => setAutoSimilar(!autoSimilar)
                    }
                  ].map((sw, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1">
                      <div className="max-w-[75%]">
                        <h4 className="text-[14px] font-bold text-white">{sw.title}</h4>
                        <p className="text-xs text-white/50 mt-0.5">{sw.desc}</p>
                      </div>
                      <button
                        onClick={sw.toggle}
                        className={`w-12 h-6.5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                          sw.val ? 'bg-white' : 'bg-white/20'
                        }`}
                      >
                        <div className={`w-5.5 h-5.5 rounded-full transition-transform ${
                          sw.val ? 'translate-x-5.5 bg-black' : 'translate-x-0.5 bg-white'
                        }`} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* 3. Восстановление при запуске */}
                <div className="flex items-center justify-between py-2 pt-3 border-t border-white/[0.08]">
                  <div>
                    <h4 className="text-[14px] font-bold text-white">{t('startup_restore')}</h4>
                    <p className="text-xs text-white/50 mt-0.5">{t('startup_restore_desc')}</p>
                  </div>
                  <div className="flex items-center p-1 bg-white/[0.04] border border-white/10 rounded-full gap-1">
                    {[
                      { id: 'disabled', label: t('startup_none') },
                      { id: 'track', label: t('startup_track') },
                      { id: 'queue', label: t('startup_queue') }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setStartupMode(opt.id as any)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                          startupMode === opt.id ? 'bg-white text-black shadow-sm' : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Storage / Cache subtab */}
            {generalSubTab === 'storage' && (
              <div className="space-y-5">
                <div className="p-5 rounded-[22px] bg-[var(--bg-surface)] border border-[var(--border-main)] space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-[var(--text-main)]">{t('storage_title')}</div>
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">{t('storage_desc')}</div>
                    </div>
                    <HardDrive size={22} className="text-[var(--text-secondary)]" />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="p-3.5 rounded-[16px] bg-[var(--bg-surface-hover)] border border-[var(--border-main)]">
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase font-mono">{t('cache_size')}</div>
                      <div className="text-base font-bold text-[var(--text-main)] font-mono mt-0.5">
                        {cacheStats?.formatted_size || '0 МБ'}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-[16px] bg-[var(--bg-surface-hover)] border border-[var(--border-main)]">
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase font-mono">{t('cached_tracks')}</div>
                      <div className="text-base font-bold text-[var(--text-main)] font-mono mt-0.5">
                        {cacheStats?.file_count || 0}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleClearCache}
                    disabled={isClearingCache}
                    className="w-full py-3 rounded-[14px] bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    <span>{isClearingCache ? (language === 'ru' ? 'Очистка...' : 'Clearing...') : t('clear_cache')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 3: ИНТЕРФЕЙС ===================== */}
        {mainTab === 'interface' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {interfaceSubTab === 'view' && (
              <>
                {/* 1. Тема */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <h4 className="text-[14px] font-bold text-white">Тема</h4>
                    <p className="text-xs text-white/50 mt-0.5">Выберите цветовую схему интерфейса</p>
                  </div>
                  <div className="flex items-center p-1 bg-white/[0.04] border border-white/10 rounded-full gap-1">
                    {[
                      { id: 'dark', icon: <Moon size={15} /> },
                      { id: 'light', icon: <Sun size={15} /> },
                      { id: 'system', icon: <Monitor size={15} /> }
                    ].map(m => (
                      <button
                        key={m.id}
                        onClick={() => setThemeMode(m.id as any)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                          themeMode === m.id ? 'bg-white text-black shadow-sm' : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {m.icon}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Готовые темы */}
                <div className="space-y-3 pt-2">
                  <div className="text-xs font-bold text-white/70 uppercase tracking-wider">
                    Готовые темы
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 gap-2.5">
                    {[...PRESET_THEMES, ...customThemes].map(theme => {
                      const effectiveTheme = theme.id === 'track' && trackTheme ? trackTheme : theme;
                      const isActive = currentThemeId === theme.id;
                      const c1 = effectiveTheme.swatch?.c1 || effectiveTheme.colors.accent;
                      const c2 = effectiveTheme.swatch?.c2 || effectiveTheme.colors.bgMain;
                      const isCustom = customThemes.some(ct => ct.id === theme.id);
                      return (
                        <div key={theme.id} className="relative group">
                          <button
                            onClick={() => setTheme(theme.id)}
                            className={`w-full h-24 rounded-2xl p-2.5 border transition-all cursor-pointer flex flex-col items-center justify-between text-center select-none ${
                              isActive
                                ? 'border-white ring-2 ring-white/30 bg-white/10 shadow-lg scale-102'
                                : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]'
                            }`}
                          >
                            {/* Overlapping Circles Swatch */}
                            <div className="relative flex items-center justify-center w-10 h-7 mt-1.5">
                              <div 
                                className="w-5.5 h-5.5 rounded-full shadow-inner z-10"
                                style={{ backgroundColor: c1 }}
                              />
                              <div 
                                className="w-5.5 h-5.5 rounded-full -ml-2.5 shadow-inner"
                                style={{ backgroundColor: c2 }}
                              />
                            </div>

                            <span className="text-[11.5px] font-semibold text-white/90 truncate w-full">
                              {theme.name}
                            </span>
                          </button>
                          {isCustom && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteCustomTheme(theme.id);
                              }}
                              className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-600/80 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-md cursor-pointer"
                              title="Удалить тему"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Plus Card */}
                    <button
                      onClick={() => setIsThemeEditorOpen(prev => !prev)}
                      className={`h-24 rounded-2xl p-2.5 border border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                        isThemeEditorOpen 
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-[var(--accent)]' 
                          : 'border-white/15 hover:border-white/30 bg-white/[0.02] hover:bg-white/[0.05] text-white/50 hover:text-white'
                      }`}
                      title="Редактор собственной темы"
                    >
                      <Plus size={22} />
                      <span className="text-[10px] font-medium tracking-tight">Создать</span>
                    </button>
                  </div>

                  {/* Inline Custom Theme Editor when isThemeEditorOpen is true */}
                  <AnimatePresence>
                    {isThemeEditorOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, y: -10 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -10 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4 shadow-lg backdrop-blur-md mt-2">
                          <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <div>
                              <h4 className="text-sm font-bold text-white">Редактор темы</h4>
                              <p className="text-xs text-white/50 mt-0.5">Создайте и настройте уникальную цветовую гамму</p>
                            </div>
                            <button
                              onClick={() => setIsThemeEditorOpen(false)}
                              className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-white/70">Название темы</label>
                            <input 
                              type="text" 
                              value={newThemeName}
                              onChange={(e) => setNewThemeName(e.target.value)}
                              placeholder="Моя тема" 
                              className="w-full px-3.5 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/40 transition-colors"
                            />
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-semibold text-white/70">Цвет фона</label>
                              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 p-2 rounded-xl">
                                <input 
                                  type="color" 
                                  value={newBgMain} 
                                  onChange={(e) => setNewBgMain(e.target.value)}
                                  className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent" 
                                />
                                <input 
                                  type="text" 
                                  value={newBgMain} 
                                  onChange={(e) => setNewBgMain(e.target.value)}
                                  className="w-full bg-transparent text-xs font-mono text-white/80 outline-none uppercase" 
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[11px] font-semibold text-white/70">Цвет карточек</label>
                              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 p-2 rounded-xl">
                                <input 
                                  type="color" 
                                  value={newBgSurface} 
                                  onChange={(e) => setNewBgSurface(e.target.value)}
                                  className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent" 
                                />
                                <input 
                                  type="text" 
                                  value={newBgSurface} 
                                  onChange={(e) => setNewBgSurface(e.target.value)}
                                  className="w-full bg-transparent text-xs font-mono text-white/80 outline-none uppercase" 
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[11px] font-semibold text-white/70">Акцентный цвет</label>
                              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 p-2 rounded-xl">
                                <input 
                                  type="color" 
                                  value={newAccent} 
                                  onChange={(e) => setNewAccent(e.target.value)}
                                  className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent" 
                                />
                                <input 
                                  type="text" 
                                  value={newAccent} 
                                  onChange={(e) => setNewAccent(e.target.value)}
                                  className="w-full bg-transparent text-xs font-mono text-white/80 outline-none uppercase" 
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[11px] font-semibold text-white/70">Основной текст</label>
                              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 p-2 rounded-xl">
                                <input 
                                  type="color" 
                                  value={newTextMain} 
                                  onChange={(e) => setNewTextMain(e.target.value)}
                                  className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent" 
                                />
                                <input 
                                  type="text" 
                                  value={newTextMain} 
                                  onChange={(e) => setNewTextMain(e.target.value)}
                                  className="w-full bg-transparent text-xs font-mono text-white/80 outline-none uppercase" 
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[11px] font-semibold text-white/70">Вторичный текст</label>
                              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 p-2 rounded-xl">
                                <input 
                                  type="color" 
                                  value={newTextSecondary} 
                                  onChange={(e) => setNewTextSecondary(e.target.value)}
                                  className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent" 
                                />
                                <input 
                                  type="text" 
                                  value={newTextSecondary} 
                                  onChange={(e) => setNewTextSecondary(e.target.value)}
                                  className="w-full bg-transparent text-xs font-mono text-white/80 outline-none uppercase" 
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[11px] font-semibold text-white/70">Цвет границ</label>
                              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 p-2 rounded-xl">
                                <input 
                                  type="color" 
                                  value={newBorderMain} 
                                  onChange={(e) => setNewBorderMain(e.target.value)}
                                  className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent" 
                                />
                                <input 
                                  type="text" 
                                  value={newBorderMain} 
                                  onChange={(e) => setNewBorderMain(e.target.value)}
                                  className="w-full bg-transparent text-xs font-mono text-white/80 outline-none uppercase" 
                                />
                              </div>
                            </div>
                          </div>

                          {/* Mini Live Preview */}
                          <div 
                            className="p-3.5 rounded-xl border flex items-center justify-between"
                            style={{ backgroundColor: newBgSurface, borderColor: newBorderMain }}
                          >
                            <div className="flex items-center gap-2.5">
                              <div 
                                className="w-8 h-8 rounded-lg shadow-sm flex items-center justify-center font-bold text-xs"
                                style={{ backgroundColor: newAccent, color: '#fff' }}
                              >
                                ♪
                              </div>
                              <div>
                                <div className="text-xs font-bold leading-tight" style={{ color: newTextMain }}>Превью темы</div>
                                <div className="text-[10px] leading-tight mt-0.5" style={{ color: newTextSecondary }}>Артист • Альбом</div>
                              </div>
                            </div>
                            <button 
                              className="px-3 py-1 rounded-full text-xs font-bold shadow-sm"
                              style={{ backgroundColor: newAccent, color: '#fff' }}
                            >
                              Кнопка
                            </button>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                              onClick={() => setIsThemeEditorOpen(false)}
                              className="px-4 py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all"
                            >
                              Отмена
                            </button>
                            <button
                              onClick={handleSaveCustomTheme}
                              className="px-5 py-2 rounded-xl bg-white text-black text-xs font-bold hover:bg-white/90 shadow-md transition-all active:scale-95 cursor-pointer"
                            >
                              Сохранить и применить
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 3. Прозрачность и регулировка акрилового стекла (Скриншот 3) */}
                <div className="space-y-4 pt-4 border-t border-white/[0.08]">
                  {/* Главный переключатель */}
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <h4 className="text-[14px] font-bold text-white">Прозрачность</h4>
                      <p className="text-xs text-white/50 mt-0.5">Эффекты прозрачности и размытия окна</p>
                    </div>
                    <button
                      onClick={() => setTransparencyEnabled(!transparencyEnabled)}
                      className={`w-12 h-6.5 rounded-full p-0.5 transition-all cursor-pointer flex items-center shadow-sm ${
                        transparencyEnabled 
                          ? 'bg-[var(--accent)] shadow-[0_0_14px_var(--accent)]/40' 
                          : 'bg-white/20'
                      }`}
                    >
                      <div className={`w-5.5 h-5.5 rounded-full transition-transform shadow-md ${
                        transparencyEnabled ? 'translate-x-5.5 bg-black' : 'translate-x-0.5 bg-white'
                      }`} />
                    </button>
                  </div>

                  {/* Слайдеры регулировки стекла (Скриншот 3) */}
                  <AnimatePresence>
                    {transparencyEnabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="space-y-5 overflow-hidden pt-1"
                      >
                        {/* 1. Непрозрачность */}
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <h5 className="text-[13.5px] font-bold text-white">Непрозрачность</h5>
                            <p className="text-xs text-white/50 mt-0.5">Прозрачность фона окна</p>
                          </div>
                          <div className="flex items-center gap-3.5 w-52 shrink-0">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="1"
                              value={windowOpacity}
                              onChange={(e) => setWindowOpacity(parseInt(e.target.value, 10))}
                              className="w-full h-[3px] bg-white/10 rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white hover:[&::-webkit-slider-thumb]:scale-125 transition-transform"
                              style={{
                                background: `linear-gradient(to right, var(--accent) calc((100% - 10px) * ${Math.max(0, Math.min(100, windowOpacity)) / 100} + 5px), rgba(255,255,255,0.1) calc((100% - 10px) * ${Math.max(0, Math.min(100, windowOpacity)) / 100} + 5px))`
                              }}
                            />
                            <span className="w-10 text-right text-xs font-mono font-bold text-white/80 shrink-0">
                              {windowOpacity}%
                            </span>
                          </div>
                        </div>

                        {/* 2. Сила стекла */}
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <h5 className="text-[13.5px] font-bold text-white">Сила стекла</h5>
                            <p className="text-xs text-white/50 mt-0.5">Интенсивность отражения, насыщенности и эффекта акрила</p>
                          </div>
                          <div className="flex items-center gap-3.5 w-52 shrink-0">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="1"
                              value={glassStrength}
                              onChange={(e) => setGlassStrength(parseInt(e.target.value, 10))}
                              className="w-full h-[3px] bg-white/10 rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white hover:[&::-webkit-slider-thumb]:scale-125 transition-transform"
                              style={{
                                background: `linear-gradient(to right, var(--accent) calc((100% - 10px) * ${Math.max(0, Math.min(100, glassStrength)) / 100} + 5px), rgba(255,255,255,0.1) calc((100% - 10px) * ${Math.max(0, Math.min(100, glassStrength)) / 100} + 5px))`
                              }}
                            />
                            <span className="w-10 text-right text-xs font-mono font-bold text-white/80 shrink-0">
                              {glassStrength}%
                            </span>
                          </div>
                        </div>

                        {/* 3. Размытие стекла */}
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <h5 className="text-[13.5px] font-bold text-white">Размытие стекла</h5>
                            <p className="text-xs text-white/50 mt-0.5">Радиус глубокого акрилового размытия (0–80px)</p>
                          </div>
                          <div className="flex items-center gap-3.5 w-52 shrink-0">
                            <input
                              type="range"
                              min="0"
                              max="80"
                              step="1"
                              value={glassBlur}
                              onChange={(e) => setGlassBlur(parseInt(e.target.value, 10))}
                              className="w-full h-[3px] bg-white/10 rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white hover:[&::-webkit-slider-thumb]:scale-125 transition-transform"
                              style={{
                                background: `linear-gradient(to right, var(--accent) calc((100% - 10px) * ${Math.max(0, Math.min(100, (glassBlur / 80) * 100)) / 100} + 5px), rgba(255,255,255,0.1) calc((100% - 10px) * ${Math.max(0, Math.min(100, (glassBlur / 80) * 100)) / 100} + 5px))`
                              }}
                            />
                            <span className="w-10 text-right text-xs font-mono font-bold text-white/80 shrink-0">
                              {glassBlur}px
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 4. Шрифт */}
                <div className="space-y-3 pt-3 border-t border-white/[0.08]">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <h4 className="text-[14px] font-bold text-white">Шрифт</h4>
                      <p className="text-xs text-white/50 mt-0.5">Семейство шрифта</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center p-1 bg-white/[0.04] border border-white/10 rounded-full gap-1 overflow-x-auto scrollbar-hide">
                        {['System', 'Modern', 'Serif', 'Mono', 'Hand', 'Deco', 'Game'].map(cat => (
                          <button
                            key={cat}
                            onClick={() => setFontCategory(cat.toLowerCase())}
                            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                              fontCategory === cat.toLowerCase() ? 'bg-white text-black shadow-sm' : 'text-white/60 hover:text-white'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            if (fontScrollRef.current) {
                              fontScrollRef.current.scrollBy({ left: -220, behavior: 'smooth' });
                            }
                          }}
                          className="w-7 h-7 rounded-full bg-white/[0.04] hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all cursor-pointer"
                          title="Назад"
                        >
                          <ChevronLeft size={15} />
                        </button>
                        <button
                          onClick={() => {
                            if (fontScrollRef.current) {
                              fontScrollRef.current.scrollBy({ left: 220, behavior: 'smooth' });
                            }
                          }}
                          className="w-7 h-7 rounded-full bg-white/[0.04] hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all cursor-pointer"
                          title="Вперед"
                        >
                          <ChevronRight size={15} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Horizontal Font Cards - Scrollable via mouse wheel & drag & arrows */}
                  <div 
                    ref={fontScrollRef}
                    className="flex gap-2.5 overflow-x-auto scrollbar-hide py-1 scroll-smooth select-none cursor-grab active:cursor-grabbing"
                  >
                    {AVAILABLE_FONTS.filter(f => !fontCategory || f.category === fontCategory).map(f => {
                      const isActive = fontId === f.id;
                      return (
                        <button
                          key={f.id}
                          onClick={() => setFontId(f.id)}
                          className={`w-28 h-20 shrink-0 rounded-2xl border p-2.5 flex flex-col justify-between items-center transition-all cursor-pointer ${
                            isActive 
                              ? 'border-white ring-2 ring-white/30 bg-white/10 shadow-sm'
                              : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]'
                          }`}
                        >
                          <span className="text-xl font-bold text-white" style={{ fontFamily: f.family }}>
                            {f.sample || 'Aa'}
                          </span>
                          <span className="text-[11px] font-medium text-white/80 truncate w-full text-center" style={{ fontFamily: f.family }}>
                            {f.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Размер шрифта */}
                <div className="flex items-center justify-between py-2 pt-3 border-t border-white/[0.08]">
                  <div>
                    <h4 className="text-[14px] font-bold text-white">Размер шрифта</h4>
                    <p className="text-xs text-white/50 mt-0.5">Базовый размер шрифта интерфейса</p>
                  </div>
                  <div className="flex items-center p-1 bg-white/[0.04] border border-white/10 rounded-full gap-1">
                    {[12, 14, 16, 18, 20].map(sz => (
                      <button
                        key={sz}
                        onClick={() => setFontSize(sz)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                          (fontSize || 16) === sz ? 'bg-white text-black shadow-sm' : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {sz === 16 ? '16 Auto' : sz}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 6. Жирность шрифта */}
                <div className="flex items-center justify-between py-2 pt-3 border-t border-white/[0.08]">
                  <div>
                    <h4 className="text-[14px] font-bold text-white">Жирность шрифта</h4>
                  </div>
                  <div className="flex items-center p-1 bg-white/[0.04] border border-white/10 rounded-full gap-1">
                    {['Auto', '400', '500', '600', '700'].map(w => (
                      <button
                        key={w}
                        onClick={() => setFontWeight(w)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                          (fontWeight || 'Auto') === w ? 'bg-white text-black shadow-sm' : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ===================== SUBTAB 2: КАСТОМИЗАЦИЯ ===================== */}
            {interfaceSubTab === 'customization' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* 1. TOP SLOTS */}
                <div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { idx: 0, title: 'Обои', icon: ImageIcon, desc: 'Фон приложения' },
                      { idx: 1, title: 'Обложка', icon: Disc, desc: 'Обложка плеера' },
                      { idx: 3, title: 'Баннер', icon: Sparkles, desc: 'Баннер профиля' }
                    ].map(slot => {
                      const item = customSlots?.[slot.idx];
                      const IconComp = slot.icon;
                      const isHighlighted = dragOverSlot === slot.idx || pointerHoverSlot === slot.idx;
                      const isAnyDragging = !!draggedMediaItem || !!pointerDragItem;

                      return (
                        <div
                          key={slot.idx}
                          data-slot-idx={slot.idx}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'copy';
                            if (dragOverSlot !== slot.idx) {
                              setDragOverSlot(slot.idx);
                            }
                          }}
                          onDragEnter={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragOverSlot(slot.idx);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragOverSlot(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragOverSlot(null);
                            let dropped: MediaLibraryItem | null = pointerDragItem || draggedMediaItem;
                            if (!dropped) {
                              try {
                                const rawData = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/json');
                                if (rawData) dropped = JSON.parse(rawData);
                              } catch (err) {
                                console.error('Drop error:', err);
                              }
                            }
                            if (dropped) {
                              setSlotMedia(slot.idx, dropped);
                            }
                            setDraggedMediaItem(null);
                          }}
                          className={`relative group aspect-[4/3] rounded-2xl border transition-all flex flex-col items-center justify-center overflow-hidden ${
                            isHighlighted 
                              ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/60 bg-[var(--accent)]/25 scale-[1.05] shadow-lg shadow-[var(--accent)]/30' 
                              : isAnyDragging
                                ? 'border-dashed border-white/50 bg-white/[0.08] animate-pulse'
                                : item 
                                  ? 'border-white/30 bg-black/40 ring-1 ring-white/10' 
                                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
                          }`}
                        >
                          {item ? (
                            <>
                              {item.type === 'video' ? (
                                <video 
                                  src={item.url} 
                                  autoPlay 
                                  loop 
                                  muted 
                                  playsInline 
                                  className="absolute inset-0 w-full h-full object-cover" 
                                />
                              ) : (
                                <img 
                                  src={item.url} 
                                  alt={slot.title} 
                                  className="absolute inset-0 w-full h-full object-cover" 
                                />
                              )}

                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                                <div className="flex justify-end">
                                  <button
                                    onClick={() => clearSlot(slot.idx)}
                                    className="p-1 rounded-lg bg-red-500/30 hover:bg-red-500/60 text-white transition-colors cursor-pointer"
                                    title="Очистить слот"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                                <span className="text-[10px] font-bold text-white/90 truncate bg-black/60 px-1.5 py-0.5 rounded text-center">
                                  {slot.title}
                                </span>
                              </div>

                              <span className="group-hover:opacity-0 transition-opacity absolute bottom-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[9px] font-semibold text-white/80 border border-white/10">
                                {slot.title}
                              </span>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-1.5 p-2 text-center pointer-events-none">
                              <IconComp size={24} className="text-white/35 transition-colors group-hover:text-white/60" />
                              <span className="text-[11px] font-medium text-white/40 group-hover:text-white/70">
                                {slot.title}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. SUBBAR: [Библиотека] on left + [Upload] [+] on right */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    {/* Left: Title */}
                    <div className="text-xs font-bold text-white/80 uppercase tracking-wider">
                      Библиотека
                    </div>

                    {/* Right: Upload and Add Link buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePickLocalMedia}
                        className="p-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-white/70 hover:text-white transition-all cursor-pointer"
                        title="Добавить с компьютера (изображение, GIF, видео)"
                      >
                        <Upload size={18} />
                      </button>
                      <button
                        onClick={() => setIsUrlInputOpen(!isUrlInputOpen)}
                        className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
                          isUrlInputOpen
                            ? 'bg-white text-black border-white shadow-md'
                            : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-white/70 hover:text-white'
                        }`}
                        title="Вставить ссылку на видео, GIF или картинку"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Expandable URL Input Dropdown */}
                  <AnimatePresence>
                    {isUrlInputOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Вставьте ссылку на видео, GIF или картинку (https://...)"
                            value={mediaUrlInput}
                            onChange={(e) => setMediaUrlInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddMediaUrl();
                            }}
                            className="flex-1 bg-transparent border-0 text-xs text-white placeholder-white/30 outline-none px-2"
                          />
                          <button
                            onClick={handleAddMediaUrl}
                            className="px-4 py-2 rounded-xl bg-white text-black text-xs font-bold hover:bg-white/90 cursor-pointer shadow-md transition-all active:scale-95 shrink-0"
                          >
                            Добавить
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 3. LIBRARY CONTENT */}
                <div>
                  {mediaLibrary.length === 0 ? (
                    /* Empty State Matching Screenshot 4 */
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-2.5">
                      <Package size={54} strokeWidth={1.2} className="text-white/25 mb-1" />
                      <h3 className="text-base font-bold text-white/80">Библиотека пуста</h3>
                      <p className="text-xs text-white/40 max-w-sm leading-relaxed">
                        Загрузите изображение с компьютера или вставьте прямую ссылку
                      </p>
                    </div>
                  ) : (
                    /* Library Grid with Draggable items */
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 py-1">
                      {mediaLibrary.map(item => (
                        <div
                          key={item.id}
                          onPointerDown={(e) => handleStartPointerDrag(e, item)}
                          className="group relative aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02] hover:border-white/30 cursor-grab active:cursor-grabbing transition-all shadow-sm select-none"
                        >
                          {item.type === 'video' ? (
                            <video 
                              src={item.url} 
                              autoPlay 
                              loop 
                              muted 
                              playsInline 
                              draggable={false}
                              className="w-full h-full object-cover pointer-events-none select-none" 
                            />
                          ) : (
                            <img 
                              src={item.url} 
                              alt={item.name} 
                              draggable={false}
                              className="w-full h-full object-cover pointer-events-none select-none" 
                            />
                          )}

                          {/* Badge */}
                          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[9px] font-mono font-bold text-white/90 uppercase border border-white/10 pointer-events-none">
                            {item.type}
                          </span>

                          {/* Delete from library button in top-right */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeMediaItem(item.id);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-red-500/80 text-white/80 hover:text-white transition-all cursor-pointer opacity-0 group-hover:opacity-100 z-10 shadow-md backdrop-blur-sm border border-white/10"
                            title="Удалить из библиотеки"
                          >
                            <Trash2 size={13} />
                          </button>

                          {/* Item title at bottom on hover */}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="text-[11px] font-bold text-white truncate">
                              {item.name}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Player subtab */}
            {interfaceSubTab === 'player' && (
              <div className="space-y-4">
                <div className="text-xs font-bold text-white/70 uppercase tracking-wider">
                  Стиль мини-плеера
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={() => setMiniPlayerStyle('island')}
                    className={`p-3.5 rounded-[20px] border text-left transition-all cursor-pointer ${
                      miniPlayerStyle === 'island'
                        ? 'border-white bg-white/10 shadow-md ring-1 ring-white/30'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <div className="w-full h-16 rounded-xl bg-black/60 border border-white/10 p-2 flex items-center justify-between gap-2 mb-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/40 shrink-0" />
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="w-3/4 h-2 bg-white/30 rounded" />
                        <div className="w-1/2 h-1.5 bg-white/15 rounded" />
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <div className="w-0.5 h-3 bg-amber-400 rounded-full" />
                        <div className="w-0.5 h-4 bg-emerald-400 rounded-full" />
                        <div className="w-0.5 h-2 bg-emerald-400 rounded-full" />
                      </div>
                    </div>
                    <div className="text-xs font-bold text-white">Dynamic Island</div>
                    <div className="text-[10px] text-white/50 mt-0.5">В стиле iPhone</div>
                  </button>

                  <button
                    onClick={() => setMiniPlayerStyle('rectangle')}
                    className={`p-3.5 rounded-[20px] border text-left transition-all cursor-pointer ${
                      miniPlayerStyle === 'rectangle'
                        ? 'border-white bg-white/10 shadow-md ring-1 ring-white/30'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <div className="w-full h-16 rounded-xl bg-black/40 border border-white/10 p-2.5 flex items-center gap-2.5 mb-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/30 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="w-3/4 h-2 bg-white/25 rounded" />
                        <div className="w-1/2 h-1.5 bg-white/15 rounded" />
                      </div>
                    </div>
                    <div className="text-xs font-bold text-white">Прямоугольный</div>
                    <div className="text-[10px] text-white/50 mt-0.5">Компактная плашка</div>
                  </button>

                  <button
                    onClick={() => setMiniPlayerStyle('square')}
                    className={`p-3.5 rounded-[20px] border text-left transition-all cursor-pointer ${
                      miniPlayerStyle === 'square'
                        ? 'border-white bg-white/10 shadow-md ring-1 ring-white/30'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <div className="w-full h-16 rounded-xl bg-black/40 border border-white/10 p-2 flex flex-col items-center justify-center gap-1.5 mb-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/30" />
                      <div className="w-1/2 h-1.5 bg-white/25 rounded" />
                    </div>
                    <div className="text-xs font-bold text-white">Квадратный</div>
                    <div className="text-[10px] text-white/50 mt-0.5">Только обложка</div>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 4: СЕРВИСЫ ===================== */}
        {mainTab === 'services' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="p-5 rounded-[22px] bg-white/[0.03] border border-white/[0.06] space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-bold text-white">Яндекс Музыка</span>
                  {yandexToken ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                      ПОДКЛЮЧЕНО
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50 text-[10px]">
                      НЕ АВТОРИЗОВАНО
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-white/60 leading-relaxed">
                Авторизация дает доступ к «Моей волне», вашим плейлистам и воспроизведению в высоком качестве.
              </p>
              <div className="flex items-center gap-2 pt-1">
                {yandexToken ? (
                  <button
                    onClick={() => setYandexToken(null)}
                    className="px-4 py-2 rounded-[14px] bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-semibold transition-all cursor-pointer"
                  >
                    Выйти из Яндекс Музыки
                  </button>
                ) : (
                  <div className="flex-1 flex gap-2">
                    <input
                      type="password"
                      placeholder="Вставьте токен Yandex..."
                      value={yaInputToken}
                      onChange={(e) => setYaInputToken(e.target.value)}
                      className="flex-1 px-4 py-2 rounded-[14px] bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-white/40"
                    />
                    <button
                      onClick={() => {
                        if (yaInputToken.trim()) {
                          setYandexToken(yaInputToken.trim());
                          setYaInputToken('');
                        }
                      }}
                      className="px-5 py-2 rounded-[14px] bg-white text-black text-xs font-bold hover:bg-white/90 cursor-pointer shadow-md transition-all active:scale-95"
                    >
                      Сохранить
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===================== TAB 5: ИНТЕГРАЦИИ ===================== */}
        {mainTab === 'integrations' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="p-5 rounded-[22px] bg-white/[0.03] border border-white/[0.06] space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">Discord Rich Presence</span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                  АКТИВНО
                </span>
              </div>
              <p className="text-xs text-white/60">
                Отображение текущего играющего трека и обложки в вашем статусе Discord.
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Floating Pointer-drag preview ghost following cursor */}
      {pointerDragItem && pointerDragPos && (
        <div 
          className="fixed pointer-events-none z-[999999] -translate-x-1/2 -translate-y-1/2 w-32 h-24 rounded-2xl overflow-hidden border-2 border-[var(--accent)] shadow-[0_20px_50px_rgba(0,0,0,0.9)] scale-110 opacity-95 bg-black/80"
          style={{ left: pointerDragPos.x, top: pointerDragPos.y }}
        >
          {pointerDragItem.type === 'video' ? (
            <video src={pointerDragItem.url} autoPlay loop muted playsInline className="w-full h-full object-cover" />
          ) : (
            <img src={pointerDragItem.url} alt="" className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-x-0 bottom-0 bg-black/85 text-[10px] font-bold text-center py-0.5 text-white truncate px-1.5">
            {pointerDragItem.name}
          </div>
        </div>
      )}


    </motion.aside>
  );
};
