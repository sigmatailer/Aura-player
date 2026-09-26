import { useEffect, useState, useRef } from 'react';
import './services/AudioService';
import { getCurrentWindow } from '@tauri-apps/api/window';
import TopPlayer from './components/TopPlayer';
import TrackList from './components/TrackList';
import { SearchList } from './components/SearchList';
import TitleBar from './components/TitleBar';
import { SettingsDrawer } from './components/SettingsDrawer';
import { motion, AnimatePresence } from 'framer-motion';
import { EqualizerModal } from './components/EqualizerModal';
import BottomPlayer from './components/BottomPlayer';
import { User } from 'lucide-react';
import { NavHomeIcon, NavWaveIcon, NavSearchIcon, NavCollectionIcon, NavSettingsIcon } from './components/NavIcons';
import { useDiscordRPC } from './hooks/useDiscordRPC';
import { useAuthStore } from './store/useAuthStore';

import { Collections } from './components/Collections';
import { GlobalModal } from './components/GlobalModal';
import { GlobalTooltip } from './components/GlobalTooltip';
import { AuthModal } from './components/AuthModal';
import FullscreenPlayer from './components/FullscreenPlayer';
import { MiniPlayer } from './components/MiniPlayer';
import { MiniPlayerRectangle } from './components/MiniPlayerRectangle';
import { MiniPlayerIsland } from './components/MiniPlayerIsland';
import { MyVibe } from './components/MyVibe';
import { ArtistDrawer } from './components/ArtistDrawer';
import { HistoryDrawer } from './components/HistoryDrawer';
import { usePlayerStore, useSettingsStore } from './store/usePlayerStore';
import { useThemeStore, isVideoUrl } from './store/useThemeStore';
import { useAppSettingsStore } from './store/useAppSettingsStore';

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

function App() {
  const [activeTab, setActiveTab] = useState<'myvibe' | 'library' | 'search' | 'collections'>('myvibe');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'account' | 'services' | 'miniplayer' | 'customization' | 'appearance' | 'cache'>('services');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  const user = useAuthStore(state => state.user);
  const { t, autoSimilar } = useAppSettingsStore();
  const isMiniPlayer = usePlayerStore(state => state.isMiniPlayer);
  const miniPlayerStyle = usePlayerStore(state => state.miniPlayerStyle);
  const { queue, currentTrackIndex, setQueue } = usePlayerStore();
  const [isFetchingVibe, setIsFetchingVibe] = useState(false);
  const { 
    customWallpaper, wallpaperOpacity, wallpaperSpeed,
    transparencyEnabled, windowOpacity, glassBlur, glassStrength
  } = useThemeStore();
  const wallpaperVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Global listener for Yandex OAuth token
  useEffect(() => {
    const unlisten = listen<string>('yandex-token', (event) => {
      if (event.payload) {
        useSettingsStore.getState().setYandexToken(event.payload);
      }
    });
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  useEffect(() => {
    if (wallpaperVideoRef.current) {
      wallpaperVideoRef.current.playbackRate = wallpaperSpeed;
    }
  }, [wallpaperSpeed, customWallpaper]);

  // Endless Vibe & Auto-Similar Tracks Logic
  useEffect(() => {
    const checkVibe = async () => {
      const currentTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null;
      const isVibeMode = queue.length > 0 && currentTrack?.id?.startsWith('vibe_');
      const shouldLoadMore = (isVibeMode || autoSimilar) && queue.length > 0 && (queue.length - currentTrackIndex <= 2) && !isFetchingVibe;
      
      if (shouldLoadMore && currentTrack) {
        try {
          setIsFetchingVibe(true);
          const yaToken = localStorage.getItem('yandex_access_token');
          if (!yaToken) return;

          let realTrackId = currentTrack?.id?.split('_')[1];
          if (!realTrackId && currentTrack.filePath?.startsWith('yandex:')) {
            realTrackId = currentTrack.filePath.replace('yandex:', '');
          }
          if (!realTrackId) realTrackId = String(Date.now());
          const response = await invoke<string>('yandex_api_request', {
            url: `https://api.music.yandex.net/rotor/station/user:onyourwave/tracks?queue=${realTrackId}`,
            token: yaToken
          });
          
          const data = JSON.parse(response);
          if (data.result && data.result.sequence) {
            const newTracks = data.result.sequence.map((item: any) => {
              const t = item.track;
              return {
                id: 'vibe_' + t.id + '_' + Date.now() + Math.random(),
                title: t.title,
                artist: t.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
                album: 'Yandex Music',
                duration: t.durationMs ? t.durationMs / 1000 : 0,
                filePath: `yandex:${t.id}`,
                originalCoverUrl: t.coverUri ? `https://${t.coverUri.replace('%%', '400x400')}` : ''
              };
            });
            if (newTracks.length > 0) {
              const existingYandexIds = new Set(queue.map(t => t.id.split('_')[1]));
              const uniqueNewTracks = newTracks.filter((t: any) => !existingYandexIds.has(t.id.split('_')[1]));
              
              if (uniqueNewTracks.length > 0) {
                setQueue([...queue, ...uniqueNewTracks]);
              } else {
                setQueue([...queue, ...newTracks]);
              }
            }
          }
        } catch (e) {
          console.error("Endless vibe error", e);
        } finally {
          setIsFetchingVibe(false);
        }
      }
    };
    checkVibe();
  }, [currentTrackIndex, queue.length]);

  // Discord RPC
  useDiscordRPC();

  useEffect(() => {
    const setupWindow = async () => {
      try {
        const appWindow = getCurrentWindow();
        if (isMiniPlayer) {
          if (miniPlayerStyle === 'island') {
            document.body.classList.add('island-mode');
            document.documentElement.classList.add('island-mode');
            document.body.style.backgroundColor = 'transparent';
            document.documentElement.style.backgroundColor = 'transparent';
          } else {
            document.body.classList.remove('island-mode');
            document.documentElement.classList.remove('island-mode');
            document.body.style.backgroundColor = '#121214';
            document.documentElement.style.backgroundColor = '#121214';
          }
          if (await appWindow.isMaximized()) {
            await appWindow.unmaximize();
            await new Promise(r => setTimeout(r, 100));
          }

          const width = miniPlayerStyle === 'rectangle' ? 400 : miniPlayerStyle === 'island' ? 370 : 260;
          const height = miniPlayerStyle === 'rectangle' ? 108 : miniPlayerStyle === 'island' ? 156 : 310;

          await invoke('resize_window', { width, height, alwaysOnTop: true });
        } else {
          document.body.classList.remove('island-mode');
          document.documentElement.classList.remove('island-mode');
          if (!transparencyEnabled) {
            document.body.style.backgroundColor = '#121212';
            document.documentElement.style.backgroundColor = '#121212';
          } else {
            document.body.style.backgroundColor = 'transparent';
            document.documentElement.style.backgroundColor = 'transparent';
          }
          await invoke('resize_window', { width: 1100, height: 750, alwaysOnTop: false });
        }
      } catch (err) {
        // resize_window might not apply on mobile OS, gracefully ignore
      }
    };
    setupWindow();
  }, [isMiniPlayer, miniPlayerStyle, transparencyEnabled]);

  if (isMiniPlayer) {
    return (
      <div className={`w-full h-screen overflow-hidden ${miniPlayerStyle === 'island' ? 'bg-transparent' : 'bg-[#121214]'}`}>
        {miniPlayerStyle === 'rectangle' ? (
          <MiniPlayerRectangle />
        ) : miniPlayerStyle === 'island' ? (
          <MiniPlayerIsland />
        ) : (
          <MiniPlayer />
        )}
      </div>
    );
  }

  return (
    <div 
      className="relative w-full h-screen overflow-hidden flex flex-col font-sans"
      style={{ backgroundColor: 'var(--bg-main)' }}
    >
      {/* 1. Custom Wallpaper Layer (z-0) */}
      {customWallpaper && (
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          {isVideoUrl(customWallpaper) ? (
            <video
              ref={wallpaperVideoRef}
              src={customWallpaper}
              autoPlay
              loop
              muted
              playsInline
              onLoadedMetadata={(e) => { e.currentTarget.playbackRate = wallpaperSpeed; }}
              className="absolute inset-0 w-full h-full object-cover transition-all duration-500 ease-out"
              style={{
                filter: glassBlur > 0 ? `blur(${glassBlur}px)` : 'none',
                transform: glassBlur > 0 ? 'scale(1.06)' : 'scale(1.0)',
                opacity: Math.max(0.05, Math.min(1, wallpaperOpacity / 100)),
              }}
            />
          ) : (
            <div 
              className="absolute inset-0 bg-cover bg-center transition-all duration-500 ease-out"
              style={{
                backgroundImage: `url(${customWallpaper})`,
                filter: glassBlur > 0 ? `blur(${glassBlur}px)` : 'none',
                transform: glassBlur > 0 ? 'scale(1.06)' : 'scale(1.0)',
                opacity: Math.max(0.05, Math.min(1, wallpaperOpacity / 100)),
              }}
            />
          )}
          <div 
            className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-300" 
            style={{ opacity: Math.max(0.05, 0.35 - (windowOpacity / 100) * 0.25) }}
          />
        </div>
      )}

      {/* 2. Acrylic Frosted Glass Material Specular Highlight Layer (z-1) */}
      {transparencyEnabled && customWallpaper && (
        <div 
          className="absolute inset-0 pointer-events-none z-[1] transition-all duration-300 overflow-hidden"
        >
          <div 
            className="absolute inset-0 bg-gradient-to-tr from-white/[0.06] via-transparent to-white/[0.08] pointer-events-none" 
            style={{ opacity: Math.max(0.04, (glassStrength / 100) * 0.25) }}
          />
        </div>
      )}

      <div className="relative z-10 flex flex-col w-full h-full">
        <GlobalModal />
        <div className="hidden md:block">
          <TitleBar />
        </div>
        
        <div 
          className="relative flex flex-1 overflow-hidden w-full h-full"
          style={{ perspective: isMobile ? undefined : '1400px', perspectiveOrigin: 'right center' }}
        >
          {/* Settings Drawer */}
          <AnimatePresence>
            {isSettingsOpen && (
              <>
                {/* Backdrop on mobile & desktop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                  onClick={() => setIsSettingsOpen(false)}
                />
                <SettingsDrawer 
                  onClose={() => setIsSettingsOpen(false)} 
                  initialTab={settingsTab} 
                />
              </>
            )}
          </AnimatePresence>

          {/* Main App Workspace (with 3D tilt on desktop, direct fit on mobile) */}
          <motion.div 
            animate={isSettingsOpen && !isMobile ? {
              scale: 0.82,
              x: '46%',
              rotateY: -16,
              rotateX: 1,
              borderRadius: '24px',
              boxShadow: '0 25px 80px -15px rgba(0, 0, 0, 0.9), 0 0 0 1px var(--border-main)',
            } : {
              scale: 1,
              x: '0%',
              rotateY: 0,
              rotateX: 0,
              borderRadius: '0px',
              boxShadow: 'none',
            }}
            transition={{
              type: 'spring',
              stiffness: 240,
              damping: 30,
              mass: 0.85
            }}
            style={{ 
              transformOrigin: 'left center', 
              transformStyle: isMobile ? undefined : 'preserve-3d',
              backfaceVisibility: 'hidden'
            }}
            className="flex flex-1 overflow-hidden w-full h-full relative gap-0 sm:gap-3 p-0 sm:p-3 sm:pt-1"
          >
            {/* Click overlay to close settings when tilted on desktop */}
            {isSettingsOpen && !isMobile && (
              <div 
                className="absolute inset-0 bg-black/35 hover:bg-black/20 transition-colors z-50 cursor-pointer rounded-[28px]"
                onClick={() => setIsSettingsOpen(false)}
                title="Нажмите, чтобы вернуться"
              />
            )}

            {/* Левая боковая панель навигации (только для десктопа/планшета) */}
            <aside 
              className="hidden md:flex w-[66px] shrink-0 flex-col py-5 rounded-[36px] border z-20 shadow-2xl transition-all select-none items-center justify-between"
              style={{
                backgroundColor: transparencyEnabled && customWallpaper
                  ? `rgba(14, 14, 18, ${Math.max(0.06, (windowOpacity / 100) * 0.76)})`
                  : 'var(--bg-surface)',
                backdropFilter: transparencyEnabled && customWallpaper && glassBlur > 0 
                  ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.5}%)` 
                  : undefined,
                WebkitBackdropFilter: transparencyEnabled && customWallpaper && glassBlur > 0 
                  ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.5}%)` 
                  : undefined,
                borderColor: transparencyEnabled && customWallpaper 
                  ? `rgba(255, 255, 255, ${0.06 + (glassStrength / 100) * 0.16})` 
                  : 'var(--border-main)',
                boxShadow: transparencyEnabled && customWallpaper 
                  ? `0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,${(glassStrength / 100) * 0.20})` 
                  : undefined
              }}
            >
              {/* Верхняя иконка (Главная) */}
              <div className="flex flex-col w-full items-center shrink-0">
                <button 
                  className={`p-2.5 rounded-2xl transition-all duration-200 cursor-pointer ${
                    activeTab === 'library' 
                      ? 'text-[var(--accent)]' 
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-white/[0.04]'
                  }`}
                  onClick={() => setActiveTab('library')}
                  data-tooltip={t('nav_queue')}
                  data-tooltip-pos="right"
                >
                  <NavHomeIcon size={25} active={activeTab === 'library'} />
                </button>
              </div>

              {/* Центральный блок: Волна, Поиск, Коллекция */}
              <div className="flex flex-col gap-6 w-full items-center flex-1 justify-center">
                <button 
                  className={`p-2.5 rounded-2xl transition-all duration-200 cursor-pointer ${
                    activeTab === 'myvibe' 
                      ? 'text-[var(--accent)]' 
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-white/[0.04]'
                  }`}
                  onClick={() => setActiveTab('myvibe')}
                  data-tooltip={t('nav_myvibe')}
                  data-tooltip-pos="right"
                >
                  <NavWaveIcon size={25} active={activeTab === 'myvibe'} />
                </button>
                <button 
                  className={`p-2.5 rounded-2xl transition-all duration-200 cursor-pointer ${
                    activeTab === 'search' 
                      ? 'text-[var(--accent)]' 
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-white/[0.04]'
                  }`}
                  onClick={() => setActiveTab('search')}
                  data-tooltip={t('nav_search')}
                  data-tooltip-pos="right"
                >
                  <NavSearchIcon size={25} active={activeTab === 'search'} />
                </button>
                <button 
                  className={`p-2.5 rounded-2xl transition-all duration-200 cursor-pointer ${
                    activeTab === 'collections' 
                      ? 'text-[var(--accent)]' 
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-white/[0.04]'
                  }`}
                  onClick={() => setActiveTab('collections')}
                  data-tooltip={t('nav_collections')}
                  data-tooltip-pos="right"
                >
                  <NavCollectionIcon size={25} active={activeTab === 'collections'} />
                </button>
              </div>

              {/* Нижний блок: Аккаунт и Настройки */}
              <div className="mt-auto flex flex-col gap-3 w-full items-center shrink-0">
                <button 
                  className="p-1 rounded-2xl transition-all duration-200 relative cursor-pointer hover:scale-105 active:scale-95"
                  onClick={() => {
                    setSettingsTab('account');
                    setIsSettingsOpen(true);
                  }}
                  data-tooltip={user ? (user.name || user.email) : t('tab_account')}
                  data-tooltip-pos="right"
                >
                  {user ? (
                    <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--text-main)] font-black text-xs flex items-center justify-center overflow-hidden border border-white/20 shadow-md">
                      {user.avatar ? (
                        <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        (user.name || user.email).charAt(0).toUpperCase()
                      )}
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-white/[0.08] text-[var(--text-secondary)] hover:text-white flex items-center justify-center border border-white/10 transition-colors">
                      <User size={18} strokeWidth={1.5} />
                    </div>
                  )}
                  {user && (
                    <span className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[var(--bg-surface)]" />
                  )}
                </button>
                <button 
                  className={`p-2.5 rounded-2xl transition-all duration-200 cursor-pointer ${
                    isSettingsOpen && settingsTab !== 'account' 
                      ? 'text-[var(--accent)]' 
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-white/[0.04]'
                  }`}
                  onClick={() => {
                    setSettingsTab('services');
                    setIsSettingsOpen(true);
                  }}
                  data-tooltip={t('nav_settings')}
                  data-tooltip-pos="right"
                >
                  <NavSettingsIcon size={25} active={isSettingsOpen && settingsTab !== 'account'} />
                </button>
              </div>
            </aside>
    
            {/* Основной контент */}
            <main 
              className="flex-1 flex flex-col overflow-hidden rounded-none sm:rounded-[28px] border-0 sm:border shadow-2xl relative transition-all"
              style={{
                backgroundColor: transparencyEnabled && customWallpaper
                  ? `rgba(10, 10, 14, ${Math.max(0.04, (windowOpacity / 100) * 0.70)})`
                  : 'var(--bg-main)',
                backdropFilter: transparencyEnabled && customWallpaper && glassBlur > 0 
                  ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.5}%)` 
                  : undefined,
                WebkitBackdropFilter: transparencyEnabled && customWallpaper && glassBlur > 0 
                  ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.5}%)` 
                  : undefined,
                borderColor: transparencyEnabled && customWallpaper 
                  ? `rgba(255, 255, 255, ${0.06 + (glassStrength / 100) * 0.16})` 
                  : 'var(--border-main)',
                boxShadow: transparencyEnabled && customWallpaper 
                  ? `0 25px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,${(glassStrength / 100) * 0.20})` 
                  : undefined
              }}
            >
              <div className="w-full h-full flex flex-col">
                {activeTab === 'myvibe' ? (
                  <div className="w-full flex-1 min-h-0 flex flex-col">
                    <div className="w-full flex-1 min-h-0">
                      <MyVibe />
                    </div>
                    <BottomPlayer />
                  </div>
                ) : activeTab === 'collections' ? (
                  <div className="w-full flex-1 min-h-0 flex flex-col">
                    <div className="w-full flex-1 min-h-0 overflow-hidden">
                      <Collections />
                    </div>
                    <BottomPlayer />
                  </div>
                ) : activeTab === 'library' ? (
                  <div className="w-full px-3 sm:px-6 md:pl-5 md:pr-8 pt-3 sm:pt-6 flex flex-col gap-0 h-full overflow-hidden">
                    <div className="shrink-0 mb-3 sm:mb-4 relative z-30">
                      <TopPlayer />
                    </div>
                    <div className="w-full flex-1 min-h-0">
                      <TrackList />
                    </div>
                  </div>
                ) : (
                  <div className="w-full flex-1 min-h-0 flex flex-col">
                    <div className="w-full px-3 sm:px-6 md:px-12 pt-3 sm:pt-6 flex-1 min-h-0 overflow-hidden">
                      <SearchList onOpenSettings={() => {
                        setSettingsTab('services');
                        setIsSettingsOpen(true);
                      }} />
                    </div>
                    <BottomPlayer />
                  </div>
                )}
              </div>
            </main>
          </motion.div>
        </div>

        {/* Мобильная нижняя навигационная панель */}
        <nav className={`md:hidden shrink-0 pb-3.5 pt-1.5 border-t border-[var(--border-main)] flex items-center justify-around px-2 z-40 select-none ${customWallpaper ? 'bg-black/70 backdrop-blur-md' : 'bg-[var(--bg-surface)]'}`}>
          <button 
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors ${activeTab === 'library' ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'}`}
            onClick={() => setActiveTab('library')}
          >
            <NavHomeIcon size={24} active={activeTab === 'library'} />
            <span className="text-[10px]">Главная</span>
          </button>
          <button 
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors ${activeTab === 'myvibe' ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'}`}
            onClick={() => setActiveTab('myvibe')}
          >
            <NavWaveIcon size={24} active={activeTab === 'myvibe'} />
            <span className="text-[10px]">Волна</span>
          </button>
          <button 
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors ${activeTab === 'search' ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'}`}
            onClick={() => setActiveTab('search')}
          >
            <NavSearchIcon size={24} active={activeTab === 'search'} />
            <span className="text-[10px]">Поиск</span>
          </button>
          <button 
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors ${activeTab === 'collections' ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'}`}
            onClick={() => setActiveTab('collections')}
          >
            <NavCollectionIcon size={24} active={activeTab === 'collections'} />
            <span className="text-[10px]">Коллекция</span>
          </button>
          <button 
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors ${isSettingsOpen ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'} hover:text-[var(--text-main)] relative`}
            onClick={() => {
              setSettingsTab('account');
              setIsSettingsOpen(true);
            }}
          >
            {user ? (
              <div className="w-5 h-5 rounded-full bg-[var(--accent)] text-[var(--text-main)] text-[10px] font-bold flex items-center justify-center shadow-sm">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </div>
            ) : (
              <NavSettingsIcon size={24} active={isSettingsOpen} />
            )}
            <span className="text-[10px]">{user ? 'Аккаунт' : 'Опции'}</span>
          </button>
        </nav>

        <AuthModal />
        <EqualizerModal />
        <FullscreenPlayer />
        <ArtistDrawer />
        <HistoryDrawer />
        <GlobalTooltip />
      </div>
    </div>
  );
}

export default App;
