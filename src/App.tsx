import { useEffect, useState, useRef } from 'react';
import './services/AudioService';
import { getCurrentWindow } from '@tauri-apps/api/window';
import TopPlayer from './components/TopPlayer';
import TrackList from './components/TrackList';
import { SearchList } from './components/SearchList';
import TitleBar from './components/TitleBar';
import { SettingsModal } from './components/SettingsModal';
import { EqualizerModal } from './components/EqualizerModal';
import BottomPlayer from './components/BottomPlayer';
import { Settings, Library, Search, Heart, Radio, User } from 'lucide-react';
import { useDiscordRPC } from './hooks/useDiscordRPC';
import { useAuthStore } from './store/useAuthStore';

import { Collections } from './components/Collections';
import { GlobalModal } from './components/GlobalModal';
import { GlobalTooltip } from './components/GlobalTooltip';
import { AuthModal } from './components/AuthModal';
import FullscreenPlayer from './components/FullscreenPlayer';
import { MiniPlayer } from './components/MiniPlayer';
import { MiniPlayerRectangle } from './components/MiniPlayerRectangle';
import { MyVibe } from './components/MyVibe';
import { ArtistDrawer } from './components/ArtistDrawer';
import { usePlayerStore } from './store/usePlayerStore';
import { useThemeStore, isVideoUrl } from './store/useThemeStore';

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSettingsStore } from './store/usePlayerStore';

function App() {
  const [activeTab, setActiveTab] = useState<'myvibe' | 'library' | 'search' | 'collections'>('library');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const isMiniPlayer = usePlayerStore(state => state.isMiniPlayer);
  const miniPlayerStyle = usePlayerStore(state => state.miniPlayerStyle);
  const { queue, currentTrackIndex, setQueue } = usePlayerStore();
  const [isFetchingVibe, setIsFetchingVibe] = useState(false);
  const user = useAuthStore(state => state.user);
  const { customWallpaper, wallpaperBlur, wallpaperOpacity, wallpaperSpeed } = useThemeStore();
  const wallpaperVideoRef = useRef<HTMLVideoElement>(null);

  // Global listener for Yandex OAuth token (ensures token is saved even if SettingsModal is closed)
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

  // Endless Vibe Logic
  useEffect(() => {
    const checkVibe = async () => {
      const currentTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null;
      const isVibeMode = queue.length > 0 && currentTrack?.id?.startsWith('vibe_');
      
      if (isVibeMode && queue.length - currentTrackIndex <= 2 && !isFetchingVibe) {
        try {
          setIsFetchingVibe(true);
          const yaToken = localStorage.getItem('yandex_access_token');
          if (!yaToken) return;

          const realTrackId = currentTrack?.id?.split('_')[1] || Date.now();
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
              // Filter out tracks that have the same yandex ID as something already in the queue
              const existingYandexIds = new Set(queue.map(t => t.id.split('_')[1]));
              const uniqueNewTracks = newTracks.filter((t: any) => !existingYandexIds.has(t.id.split('_')[1]));
              
              if (uniqueNewTracks.length > 0) {
                setQueue([...queue, ...uniqueNewTracks]);
              } else {
                // If all are duplicates, maybe fallback to fetching again later, but to avoid loop, just append them anyway but with new IDs (already handled by vibe_ prefix)
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
          document.body.style.backgroundColor = '#121214';
          document.documentElement.style.backgroundColor = '#121214';
          if (await appWindow.isMaximized()) {
            await appWindow.unmaximize();
            // Даем Windows время на завершение анимации unmaximize
            await new Promise(r => setTimeout(r, 100));
          }

          const width = miniPlayerStyle === 'rectangle' ? 400 : 260;
          const height = miniPlayerStyle === 'rectangle' ? 108 : 310;

          // Используем Rust-бэкенд для жесткого ресайза в обход багов JS-апи
          await invoke('resize_window', { width, height, alwaysOnTop: true });
        } else {
          document.body.style.backgroundColor = '#121212';
          document.documentElement.style.backgroundColor = '#121212';
          await invoke('resize_window', { width: 1100, height: 750, alwaysOnTop: false });
        }
      } catch (err) {
        console.error("Window resize error:", err);
      }
    };
    setupWindow();
  }, [isMiniPlayer, miniPlayerStyle]);

  if (isMiniPlayer) {
    return (
      <div className="w-full h-screen overflow-hidden bg-[#121214]">
        {miniPlayerStyle === 'rectangle' ? <MiniPlayerRectangle /> : <MiniPlayer />}
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden flex flex-col bg-[var(--bg-main)]">
      {/* Custom Wallpaper Layer */}
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
              className="absolute inset-0 w-full h-full object-cover transition-all duration-700 ease-out"
              style={{
                filter: `blur(${wallpaperBlur}px)`,
                transform: 'scale(1.08)',
                opacity: Math.max(0.05, Math.min(1, wallpaperOpacity / 100)),
              }}
            />
          ) : (
            <div 
              className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-out"
              style={{
                backgroundImage: `url(${customWallpaper})`,
                filter: `blur(${wallpaperBlur}px)`,
                transform: 'scale(1.08)',
                opacity: Math.max(0.05, Math.min(1, wallpaperOpacity / 100)),
              }}
            />
          )}
          <div className="absolute inset-0 bg-black/40 pointer-events-none" />
        </div>
      )}

      <div className="relative z-10 flex flex-col w-full h-full pt-11 md:pt-0">
        <GlobalModal />
        <div className="hidden md:block">
          <TitleBar />
        </div>
        
        <div className="flex flex-1 overflow-hidden">
          {/* Левая боковая панель навигации (только десктоп) */}
          <aside className={`hidden md:flex w-[72px] shrink-0 flex-col py-6 border-r border-[var(--border-main)] ${customWallpaper ? 'bg-black/40 backdrop-blur-md' : 'bg-[var(--bg-main)]'} z-20 transition-colors`}>
            <div className="flex flex-col gap-6 w-full items-center flex-1 justify-center">
            <button 
              className={`p-3 rounded-xl transition-all duration-200 ${activeTab === 'myvibe' ? 'bg-[var(--accent)] text-[var(--text-main)] shadow-lg shadow-[var(--accent)]/20' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)]'}`}
              onClick={() => setActiveTab('myvibe')}
              data-tooltip="Моя волна"
              data-tooltip-pos="right"
            >
              <Radio size={22} strokeWidth={activeTab === 'myvibe' ? 2 : 1.5} />
            </button>
            <button 
              className={`p-3 rounded-xl transition-all duration-200 ${activeTab === 'search' ? 'bg-[var(--accent)] text-[var(--text-main)] shadow-lg shadow-[var(--accent)]/20' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)]'}`}
              onClick={() => setActiveTab('search')}
              data-tooltip="Поиск"
              data-tooltip-pos="right"
            >
              <Search size={22} strokeWidth={activeTab === 'search' ? 2 : 1.5} />
            </button>
            <button 
              className={`p-3 rounded-xl transition-all duration-200 ${activeTab === 'library' ? 'bg-[var(--accent)] text-[var(--text-main)] shadow-lg shadow-[var(--accent)]/20' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)]'}`}
              onClick={() => setActiveTab('library')}
              data-tooltip="Медиатека"
              data-tooltip-pos="right"
            >
              <Library size={22} strokeWidth={activeTab === 'library' ? 2 : 1.5} />
            </button>
            <button 
              className={`p-3 rounded-xl transition-all duration-200 ${activeTab === 'collections' ? 'bg-[var(--accent)] text-[var(--text-main)] shadow-lg shadow-[var(--accent)]/20' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)]'}`}
              onClick={() => setActiveTab('collections')}
              data-tooltip="Моя коллекция"
              data-tooltip-pos="right"
            >
              <Heart size={22} strokeWidth={activeTab === 'collections' ? 2 : 1.5} />
            </button>
          </div>

          <div className="mt-auto flex flex-col gap-3 w-full items-center shrink-0">
            <button 
              className={`p-2.5 rounded-xl transition-all duration-200 relative ${user ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)]'}`}
              onClick={() => setIsSettingsOpen(true)}
              data-tooltip={user ? (user.name || user.email) : "Войти в аккаунт"}
              data-tooltip-pos="right"
            >
              {user ? (
                <div className="w-6 h-6 rounded-lg bg-[var(--accent)] text-[var(--text-main)] font-black text-xs flex items-center justify-center">
                  {(user.name || user.email).charAt(0).toUpperCase()}
                </div>
              ) : (
                <User size={20} strokeWidth={1.5} />
              )}
              {user && (
                <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[var(--bg-main)]" />
              )}
            </button>
            <button 
              className="p-3 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-all duration-200"
              onClick={() => setIsSettingsOpen(true)}
              data-tooltip="Настройки"
              data-tooltip-pos="right"
            >
              <Settings size={22} strokeWidth={1.5} />
            </button>
          </div>
          </aside>
  
          {/* Основной контент */}
          <main className={`flex-1 flex flex-col overflow-hidden ${customWallpaper ? 'bg-transparent' : 'bg-[var(--bg-main)]'}`}>
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
              <div className="w-full px-3 sm:px-6 md:pl-5 md:pr-8 pt-2 sm:pt-6 flex flex-col gap-0 h-full overflow-hidden">
                <div className="shrink-0 mb-3 sm:mb-4">
                  <TopPlayer />
                </div>
                <div className="w-full flex-1 min-h-0">
                  <TrackList />
                </div>
              </div>
            ) : (
                <div className="w-full flex-1 min-h-0 flex flex-col">
                  <div className="w-full px-3 sm:px-6 md:px-12 pt-3 sm:pt-6 flex-1 min-h-0 overflow-hidden">
                    <SearchList onOpenSettings={() => setIsSettingsOpen(true)} />
                  </div>
                  <BottomPlayer />
                </div>
            )}
          </div>
        </main>
      </div>

      {/* Мобильная нижняя навигационная панель */}
      <nav className={`md:hidden shrink-0 pb-3.5 pt-1.5 border-t border-[var(--border-main)] flex items-center justify-around px-2 z-40 select-none ${customWallpaper ? 'bg-black/70 backdrop-blur-md' : 'bg-[var(--bg-surface)]'}`}>
        <button 
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors ${activeTab === 'myvibe' ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'}`}
          onClick={() => setActiveTab('myvibe')}
        >
          <Radio size={20} strokeWidth={activeTab === 'myvibe' ? 2.5 : 1.75} />
          <span className="text-[10px]">Волна</span>
        </button>
        <button 
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors ${activeTab === 'search' ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'}`}
          onClick={() => setActiveTab('search')}
        >
          <Search size={20} strokeWidth={activeTab === 'search' ? 2.5 : 1.75} />
          <span className="text-[10px]">Поиск</span>
        </button>
        <button 
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors ${activeTab === 'library' ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'}`}
          onClick={() => setActiveTab('library')}
        >
          <Library size={20} strokeWidth={activeTab === 'library' ? 2.5 : 1.75} />
          <span className="text-[10px]">Треки</span>
        </button>
        <button 
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors ${activeTab === 'collections' ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'}`}
          onClick={() => setActiveTab('collections')}
        >
          <Heart size={20} strokeWidth={activeTab === 'collections' ? 2.5 : 1.75} />
          <span className="text-[10px]">Любимое</span>
        </button>
        <button 
          className="flex flex-col items-center justify-center gap-1 flex-1 py-1 text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors relative"
          onClick={() => setIsSettingsOpen(true)}
        >
          {user ? (
            <div className="w-5 h-5 rounded-full bg-[var(--accent)] text-[var(--text-main)] text-[10px] font-bold flex items-center justify-center shadow-sm">
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
          ) : (
            <Settings size={20} strokeWidth={1.75} />
          )}
          <span className="text-[10px]">{user ? 'Аккаунт' : 'Опции'}</span>
        </button>
      </nav>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
      <AuthModal />
      
      <EqualizerModal />
      <FullscreenPlayer />
      <ArtistDrawer />
      <GlobalTooltip />
      </div>
    </div>
  );
}

export default App;
