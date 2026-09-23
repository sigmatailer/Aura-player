import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useThemeStore, isVideoUrl } from '../store/useThemeStore';
import { Play, Pause, SkipBack, SkipForward, Repeat, Shuffle, ChevronDown } from 'lucide-react';
import { ArtistLinks } from './ArtistLinks';
import { MediaCover } from './MediaCover';
import { invoke } from '@tauri-apps/api/core';

// Extract dominant color from image
const getAverageColor = (src: string): Promise<string> => {
  if (isVideoUrl(src)) {
    return Promise.resolve('rgb(30,30,30)');
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve('rgb(30,30,30)');
      canvas.width = 64;
      canvas.height = 64;
      ctx.drawImage(img, 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64).data;
      let r = 0, g = 0, b = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        // skip transparent or too dark/light pixels
        if (data[i+3] > 0 && (data[i] > 20 || data[i+1] > 20 || data[i+2] > 20)) {
          r += data[i];
          g += data[i+1];
          b += data[i+2];
          count++;
        }
      }
      if (count === 0) return resolve('rgb(30,30,30)');
      resolve(`rgb(${Math.floor(r/count)}, ${Math.floor(g/count)}, ${Math.floor(b/count)})`);
    };
    img.onerror = () => resolve('rgb(30,30,30)');
    img.src = src;
  });
};

interface LyricLine {
  time: number;
  text: string;
}

const FullscreenPlayer: React.FC = () => {
  const { 
    isFullscreen, toggleFullscreen, queue, currentTrackIndex, 
    isPlaying, togglePlayPause, nextTrack, prevTrack, 
    progress, setProgress, isShuffle, toggleShuffle, repeatMode, toggleRepeat 
  } = usePlayerStore();
  const { customCover, coverSpeed } = useThemeStore();

  const currentTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null;
  const baseCoverUrl = currentTrack?.customCoverPath || currentTrack?.originalCoverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
  const coverUrl = customCover || baseCoverUrl;

  const [bgColor, setBgColor] = useState('rgb(30,30,30)');
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [scrubbingProgress, setScrubbingProgress] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<'player' | 'lyrics'>('player');

  // Animation states
  const [shouldRender, setShouldRender] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isFullscreen) {
      setShouldRender(true);
      setIsClosing(false);
      setMobileView('player');
    } else if (shouldRender) {
      setIsClosing(true);
      setTimeout(() => {
        setShouldRender(false);
        setMobileView('player');
      }, 500); // 500ms slide down animation
    }
  }, [isFullscreen, shouldRender]);

  // Always reset to track player view when track changes
  useEffect(() => {
    setMobileView('player');
  }, [currentTrack?.id]);

  useEffect(() => {
    if (isFullscreen && currentTrack) {
      getAverageColor(coverUrl).then(setBgColor);
      
      setLoadingLyrics(true);
      setLyrics([]);

      const fetchLyrics = async () => {
        let parsed: LyricLine[] = [];
        let trackId = currentTrack.id;
        if (trackId.startsWith('ya_')) trackId = trackId.substring(3);
        else if (currentTrack.filePath.startsWith('yandex:')) trackId = currentTrack.filePath.substring(7);
        
        const yaToken = localStorage.getItem('yandex_access_token');

        try {
          if (yaToken && trackId) {
            const res = await invoke<string>('yandex_api_request', {
                url: `https://api.music.yandex.net/tracks/${trackId}/supplement`,
                token: yaToken
            });
            const data = JSON.parse(res);
            
            if (data.result && data.result.lyrics) {
               if (data.result.lyrics.syncLyrics) {
                   const syncLrc = data.result.lyrics.syncLyrics;
                   const lines = syncLrc.split('\n');
                   for (const line of lines) {
                       const match = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
                       if (match) {
                           const minutes = parseInt(match[1]);
                           const seconds = parseFloat(match[2]);
                           const text = match[3].trim();
                           if (text) parsed.push({ time: minutes * 60 + seconds, text });
                       }
                   }
               } else if (data.result.lyrics.fullLyrics) {
                   const plainLines = data.result.lyrics.fullLyrics.split('\n').filter((l: string) => l.trim().length > 0);
                   parsed = plainLines.map((text: string) => ({ time: 999999, text }));
               }
            }
          }
        } catch (err) {
            console.error("Yandex lyrics error", err);
        }

        if (parsed.length === 0 || parsed[0]?.time === 999999) {
            const cleanTitle = currentTrack.title.replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
            const cleanArtist = currentTrack.artist.split(/[,&/]/)[0].trim();
            const q = encodeURIComponent(`${cleanTitle} ${cleanArtist}`);
            try {
              const lrclibRes = await fetch(`https://lrclib.net/api/search?q=${q}`);
              const data = await lrclibRes.json();
              if (data && data.length > 0) {
                const trackData = data[0];
                if (trackData.syncedLyrics) {
                  const lines = trackData.syncedLyrics.split('\n');
                  const synced: LyricLine[] = [];
                  for (const line of lines) {
                    const match = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
                    if (match) {
                      const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
                      const text = match[3].trim();
                      if (text) synced.push({ time, text });
                    }
                  }
                  if (synced.length > 0) parsed = synced;
                } else if (trackData.plainLyrics && parsed.length === 0) {
                  const lines = trackData.plainLyrics.split('\n').filter((l: string) => l.trim().length > 0);
                  parsed = lines.map((text: string) => ({ time: 999999, text }));
                }
              }
            } catch (err) {
              console.error(err);
            }
        }
        
        setLyrics(parsed);
        setLoadingLyrics(false);
      };
      
      fetchLyrics();
    }
  }, [currentTrack, isFullscreen, coverUrl]);

  // Find active line
  const isPlain = lyrics.length > 0 && lyrics[0].time === 999999;
  let activeIndex = -1;
  for (let i = 0; i < lyrics.length; i++) {
    // Add 0.5s offset for smoother transition before the word is sung
    if (progress + 0.5 >= lyrics[i].time) {
      activeIndex = i;
    } else {
      break;
    }
  }

  const lyricsRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll to active line with layout-aware container scrolling
  const scrollToActiveLine = useCallback((smooth: boolean = true) => {
    if (!lyricsRef.current || activeIndex < 0) return;
    if (isUserScrollingRef.current) return;

    const container = lyricsRef.current;
    const activeEl = container.children[activeIndex] as HTMLElement;
    if (!activeEl) return;

    const targetTop = activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: smooth ? 'smooth' : 'auto'
    });
  }, [activeIndex]);

  // Synchronize on active index change, view toggle, lyrics load, or fullscreen open
  useEffect(() => {
    if (mobileView === 'lyrics' || (typeof window !== 'undefined' && window.innerWidth >= 768)) {
      const timer = setTimeout(() => {
        scrollToActiveLine(true);
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [activeIndex, mobileView, lyrics, isFullscreen, scrollToActiveLine]);

  if (!shouldRender || !currentTrack) return null;

  return (
    <div 
      data-tauri-drag-region
      className={`fixed inset-0 z-[9999] flex transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] select-none ${isClosing ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
      style={{
        background: `linear-gradient(135deg, ${bgColor} 0%, #050505 100%)`
      }}
    >
      <div data-tauri-drag-region className="absolute inset-0 bg-black/50 backdrop-blur-[80px] pointer-events-none" />

      {/* Close button with explicit high z-index and safe area padding for Dynamic Island */}
      <button 
        onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="absolute top-[max(3.25rem,calc(env(safe-area-inset-top,0px)+10px))] left-4 md:top-6 md:left-6 z-[10000] w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-[var(--text-main)]/70 hover:text-[var(--text-main)] hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
      >
        <ChevronDown size={20} />
      </button>

      {/* Mobile view switcher if lyrics available */}
      {lyrics.length > 0 && (
        <div className="md:hidden absolute top-[max(3.25rem,calc(env(safe-area-inset-top,0px)+10px))] right-4 z-[10000] flex items-center gap-1 bg-white/10 backdrop-blur-md rounded-full p-0.5 border border-white/10 text-xs">
          <button
            onClick={() => setMobileView('player')}
            className={`px-3 py-1 rounded-full font-medium transition-all ${mobileView === 'player' ? 'bg-white text-black shadow' : 'text-white/70'}`}
          >
            Трек
          </button>
          <button
            onClick={() => setMobileView('lyrics')}
            className={`px-3 py-1 rounded-full font-medium transition-all ${mobileView === 'lyrics' ? 'bg-white text-black shadow' : 'text-white/70'}`}
          >
            Текст
          </button>
        </div>
      )}

      <div data-tauri-drag-region className="relative z-10 w-full h-full flex flex-col md:flex-row max-w-[1600px] mx-auto px-5 py-6 md:px-10 md:py-10 gap-6 md:gap-16 overflow-hidden">
        
        {/* Left Side: Cover & Controls */}
        <div className={`w-full md:w-[50%] max-w-[800px] min-w-0 md:min-w-[300px] flex flex-col justify-center items-center shrink-0 h-full pt-1 md:pt-2 pb-3 md:pb-2 gap-2 sm:gap-3 md:gap-6 ${mobileView === 'lyrics' ? 'hidden md:flex' : 'flex'}`}>
          
          {/* Responsive Cover Art Container */}
            <MediaCover 
              src={coverUrl} 
              speed={coverSpeed}
              alt="Cover" 
              className="w-[88vw] max-w-[370px] xs:max-w-[400px] md:w-auto md:max-w-full md:max-h-full aspect-square object-cover rounded-[24px] md:rounded-[20px] shadow-2xl bg-[var(--bg-surface-hover)]"
            />

          <div className="w-full shrink-0 flex flex-col items-center gap-1">
            <div className="flex flex-col gap-0.5 mb-1 text-center w-full px-4">
              <h1 className="text-2xl font-bold text-[var(--text-main)] truncate drop-shadow-md pb-0.5">{currentTrack.title}</h1>
              <div className="flex items-center justify-center">
                <ArtistLinks 
                  artist={currentTrack.artist} 
                  className="text-base text-[var(--text-main)]/70 transition-colors truncate drop-shadow-md pb-0.5"
                  linkClassName="hover:text-[var(--text-main)]"
                  viewMode="modal"
                />
              </div>
            </div>

            {(() => {
              const activeProgress = scrubbingProgress !== null ? scrubbingProgress : (progress || 0);
              return (
                <div className="w-full flex flex-col gap-2 mb-2 px-4">
                  <div className="flex items-center justify-between text-xs text-[var(--text-main)]/50 font-medium">
                    <span>{Math.floor(activeProgress / 60)}:{Math.floor(activeProgress % 60).toString().padStart(2, '0')}</span>
                    <span>{Math.floor((currentTrack.duration||0) / 60)}:{Math.floor((currentTrack.duration||0) % 60).toString().padStart(2, '0')}</span>
                  </div>
                  <input 
                    type="range" min="0" max={currentTrack.duration || 100} step="1"
                    value={activeProgress} 
                    onChange={(e) => setScrubbingProgress(parseFloat(e.target.value))}
                    onPointerUp={(e) => {
                      const val = parseFloat((e.target as HTMLInputElement).value);
                      setProgress(val);
                      setScrubbingProgress(null);
                    }}
                    onTouchEnd={(e) => {
                      const val = parseFloat((e.target as HTMLInputElement).value);
                      setProgress(val);
                      setScrubbingProgress(null);
                    }}
                    onMouseUp={(e) => {
                      const val = parseFloat((e.target as HTMLInputElement).value);
                      setProgress(val);
                      setScrubbingProgress(null);
                    }}
                    className="w-full h-[4px] bg-white/20 rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-transform"
                    style={{ background: `linear-gradient(to right, white ${(activeProgress / (currentTrack.duration || 100)) * 100}%, rgba(255,255,255,0.2) ${(activeProgress / (currentTrack.duration || 100)) * 100}%)` }}
                  />
                </div>
              );
            })()}

            <div className="flex items-center justify-center gap-8 px-4 w-full">
              <button onClick={toggleShuffle} className={`transition-colors ${isShuffle ? 'text-[var(--text-main)]' : 'text-[var(--text-main)]/40 hover:text-[var(--text-main)]/80'}`}><Shuffle size={20} /></button>
              <button onClick={prevTrack} className="text-[var(--text-main)]/60 hover:text-[var(--text-main)] transition-colors"><SkipBack size={24} fill="currentColor" /></button>
              <button onClick={togglePlayPause} className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shadow-xl">
                {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
              </button>
              <button onClick={() => nextTrack(false)} className="text-[var(--text-main)]/60 hover:text-[var(--text-main)] transition-colors"><SkipForward size={24} fill="currentColor" /></button>
              <button onClick={toggleRepeat} className={`transition-colors relative ${repeatMode !== 'off' ? 'text-[var(--text-main)]' : 'text-[var(--text-main)]/40 hover:text-[var(--text-main)]/80'}`}>
                <Repeat size={20} />
                {repeatMode === 'one' && <span className="absolute -top-1 -right-1 text-[9px] font-bold">1</span>}
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Lyrics */}
        <div data-tauri-drag-region className={`flex-1 md:flex-[1.5] flex-col h-full overflow-hidden relative pt-14 md:pt-0 ${mobileView === 'lyrics' ? 'flex' : 'hidden md:flex'}`}>
          {loadingLyrics ? (
            <div className="w-full h-full flex items-center justify-center text-[var(--text-main)]/50 animate-pulse text-2xl font-bold">Загружаем текст...</div>
          ) : lyrics.length > 0 ? (
            <div 
              ref={lyricsRef} 
              onTouchStart={() => {
                isUserScrollingRef.current = true;
                if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
              }}
              onTouchEnd={() => {
                if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
                userScrollTimeoutRef.current = setTimeout(() => {
                  isUserScrollingRef.current = false;
                  scrollToActiveLine(true);
                }, 3500);
              }}
              onWheel={() => {
                isUserScrollingRef.current = true;
                if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
                userScrollTimeoutRef.current = setTimeout(() => {
                  isUserScrollingRef.current = false;
                  scrollToActiveLine(true);
                }, 3500);
              }}
              className="h-full overflow-y-auto scrollbar-hide flex flex-col gap-8 py-[40vh]"
              style={{
                maskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)'
              }}
            >
              {lyrics.map((line, i) => (
                <div 
                  key={i}
                  className={`font-bold cursor-pointer transition-all duration-700 ease-out py-3 break-words whitespace-pre-wrap origin-left text-3xl lg:text-4xl xl:text-5xl ${i === activeIndex || (isPlain) ? 'scale-100 text-[var(--text-main)] drop-shadow-xl opacity-100' : 'scale-[0.85] text-[var(--text-main)]/40 hover:text-[var(--text-main)]/60 opacity-60'}`}
                  onClick={() => {
                    setProgress(line.time);
                    isUserScrollingRef.current = false;
                    if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
                  }}
                >
                  {line.text || '\u00A0'}
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--text-main)]/30 text-2xl font-bold">Текст не найден</div>
          )}
        </div>

      </div>
    </div>
  );
};

export default FullscreenPlayer;







