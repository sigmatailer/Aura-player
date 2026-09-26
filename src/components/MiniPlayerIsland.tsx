import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useCollectionStore } from '../store/useCollectionStore';
import { useThemeStore, isVideoUrl } from '../store/useThemeStore';
import { Play, SkipBack, SkipForward, Maximize2, Heart, Minimize2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

const EXPANDED_WIDTH = 370;
const EXPANDED_HEIGHT = 156;
const COLLAPSED_WIDTH = 290;
const COLLAPSED_HEIGHT = 44;

interface WaveGradient {
  from: string;
  to: string;
}

const defaultGradient: WaveGradient = {
  from: '#e6983b',
  to: '#48bb78'
};

const gradientCache = new Map<string, WaveGradient>();

function extractCoverGradient(imageUrl: string): Promise<WaveGradient> {
  if (!imageUrl) return Promise.resolve(defaultGradient);
  if (gradientCache.has(imageUrl)) {
    return Promise.resolve(gradientCache.get(imageUrl)!);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timeout = setTimeout(() => {
      resolve(defaultGradient);
    }, 2000);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(defaultGradient);
          return;
        }

        const size = 32;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const data = ctx.getImageData(0, 0, size, size).data;
        const candidates: Array<{ h: number; s: number; l: number; score: number }> = [];

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          if (a < 128) continue;

          // RGB to HSL
          const rN = r / 255, gN = g / 255, bN = b / 255;
          const max = Math.max(rN, gN, bN), min = Math.min(rN, gN, bN);
          let h = 0, s = 0, l = (max + min) / 2;

          if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
              case rN: h = ((gN - bN) / d + (gN < bN ? 6 : 0)) / 6; break;
              case gN: h = ((bN - rN) / d + 2) / 6; break;
              case bN: h = ((rN - gN) / d + 4) / 6; break;
            }
          }

          const hDeg = Math.round(h * 360);
          const sPct = Math.round(s * 100);
          const lPct = Math.round(l * 100);

          if (lPct < 15 || lPct > 88 || sPct < 18) continue;

          const score = (sPct / 100) * 1.6 + (1 - Math.abs(lPct - 55) / 55);
          candidates.push({ h: hDeg, s: sPct, l: lPct, score });
        }

        if (candidates.length === 0) {
          gradientCache.set(imageUrl, defaultGradient);
          resolve(defaultGradient);
          return;
        }

        candidates.sort((a, b) => b.score - a.score);

        const c1 = candidates[0];
        const c2Candidate = candidates.find(c => {
          const diff = Math.abs(c.h - c1.h);
          return diff > 30 && diff < 330;
        });

        const c2 = c2Candidate || {
          h: (c1.h + 45) % 360,
          s: Math.max(50, c1.s),
          l: Math.min(65, Math.max(40, c1.l + 8))
        };

        const from = `hsl(${c1.h}, ${Math.max(65, Math.min(95, c1.s))}%, ${Math.max(48, Math.min(68, c1.l))}%)`;
        const to = `hsl(${c2.h}, ${Math.max(65, Math.min(95, c2.s))}%, ${Math.max(45, Math.min(65, c2.l))}%)`;

        const result: WaveGradient = { from, to };
        gradientCache.set(imageUrl, result);
        resolve(result);
      } catch (err) {
        console.error('Failed to extract wave gradient:', err);
        resolve(defaultGradient);
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      resolve(defaultGradient);
    };

    img.src = imageUrl;
  });
}

export const MiniPlayerIsland: React.FC = () => {
  const { 
    queue, currentTrackIndex, isPlaying, progress,
    toggleMiniPlayer, togglePlayPause, nextTrack, prevTrack, setProgress
  } = usePlayerStore();
  const { toggleLike, isLiked } = useCollectionStore();
  const { customCover, coverSpeed } = useThemeStore();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [waveGradient, setWaveGradient] = useState<WaveGradient>(defaultGradient);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  const currentTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null;
  const baseCoverUrl = currentTrack?.customCoverPath || currentTrack?.originalCoverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
  const coverUrl = customCover ? customCover : baseCoverUrl.replace('400x400', '200x200').replace('50x50', '200x200');

  const duration = currentTrack?.duration || 0;
  const progressPercent = duration ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 0;
  const remainingTime = Math.max(0, duration - progress);

  const isCurrentLiked = currentTrack ? isLiked(currentTrack.id) : false;

  useEffect(() => {
    let isMounted = true;
    if (coverUrl) {
      extractCoverGradient(coverUrl).then((grad) => {
        if (isMounted) setWaveGradient(grad);
      });
    } else {
      setWaveGradient(defaultGradient);
    }
    return () => { isMounted = false; };
  }, [coverUrl]);

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds <= 0) return '0:00';
    const m = Math.floor(timeInSeconds / 60);
    const s = Math.floor(timeInSeconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    togglePlayPause();
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    nextTrack(false);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    prevTrack();
  };

  const handleToggleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentTrack) {
      toggleLike(currentTrack);
    }
  };

  // Universal mouse down to drag window on ANY surface except interactive controls
  const handleUniversalMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, [data-no-drag], input')) {
      return;
    }
    getCurrentWindow().startDragging().catch(() => {});
  };

  // Drag vs Click logic for collapsed pill (so clicking ALWAYS uncollapses instantly)
  const handlePillMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, [data-no-drag]')) return;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePillMouseMove = (e: React.MouseEvent) => {
    if (!dragStartPos.current) return;
    const dx = Math.abs(e.clientX - dragStartPos.current.x);
    const dy = Math.abs(e.clientY - dragStartPos.current.y);
    if (dx > 4 || dy > 4) {
      dragStartPos.current = null;
      getCurrentWindow().startDragging().catch(() => {});
    }
  };

  const handlePillMouseUp = () => {
    if (dragStartPos.current) {
      dragStartPos.current = null;
      toggleCollapse();
    }
  };

  // Progress bar dragging
  const handleDrag = useCallback((clientX: number) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    setProgress(percentage * duration);
  }, [duration, setProgress]);

  useEffect(() => {
    const handleMouseUp = () => setIsDraggingProgress(false);
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingProgress) handleDrag(e.clientX);
    };

    if (isDraggingProgress) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingProgress, handleDrag]);

  const handleMouseDownProgress = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsDraggingProgress(true);
    handleDrag(e.clientX);
  };

  // Switch between collapsed pill & expanded card
  const toggleCollapse = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      if (next) {
        await invoke('resize_window', { width: COLLAPSED_WIDTH, height: COLLAPSED_HEIGHT, alwaysOnTop: true });
      } else {
        await invoke('resize_window', { width: EXPANDED_WIDTH, height: EXPANDED_HEIGHT, alwaysOnTop: true });
      }
    } catch (err) {
      console.error('Failed to resize island:', err);
    }
  };

  const waveBarStyle = {
    background: `linear-gradient(180deg, ${waveGradient.from} 0%, ${waveGradient.to} 100%)`
  };

  return (
    <>
      <style>{`
        @keyframes iosWaveBar1 {
          0%, 100% { height: 5px; }
          50% { height: 18px; }
        }
        @keyframes iosWaveBar2 {
          0%, 100% { height: 16px; }
          50% { height: 7px; }
        }
        @keyframes iosWaveBar3 {
          0%, 100% { height: 8px; }
          50% { height: 22px; }
        }
        @keyframes iosWaveBar4 {
          0%, 100% { height: 19px; }
          50% { height: 10px; }
        }
        @keyframes iosWaveBar5 {
          0%, 100% { height: 6px; }
          50% { height: 15px; }
        }
        .ios-wave-active-1 { animation: iosWaveBar1 0.85s ease-in-out infinite; }
        .ios-wave-active-2 { animation: iosWaveBar2 0.72s ease-in-out infinite 0.12s; }
        .ios-wave-active-3 { animation: iosWaveBar3 0.95s ease-in-out infinite 0.22s; }
        .ios-wave-active-4 { animation: iosWaveBar4 0.78s ease-in-out infinite 0.15s; }
        .ios-wave-active-5 { animation: iosWaveBar5 0.88s ease-in-out infinite 0.05s; }
      `}</style>

      {isCollapsed ? (
        /* ================= COLLAPSED PILL (SCREENSHOT 1) ================= */
        <div 
          data-tauri-drag-region="true"
          onMouseDown={handlePillMouseDown}
          onMouseMove={handlePillMouseMove}
          onMouseUp={handlePillMouseUp}
          onDoubleClick={toggleMiniPlayer}
          title="Нажмите в любом месте, чтобы развернуть"
          className="w-full h-full bg-black text-white rounded-full px-2.5 py-1 flex items-center justify-between border border-white/[0.18] select-none cursor-move hover:border-white/30 transition-colors group"
        >
          {/* Left: Tiny Cover */}
          <div data-tauri-drag-region="true" className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-neutral-900 border border-white/10 shadow-sm relative pointer-events-none">
            {isVideoUrl(coverUrl) ? (
              <video 
                src={coverUrl} 
                autoPlay loop muted playsInline 
                className="w-full h-full object-cover" 
                onLoadedMetadata={(e) => { e.currentTarget.playbackRate = coverSpeed; }}
              />
            ) : (
              <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
            )}
          </div>

          {/* Middle: Track & Artist */}
          <div data-tauri-drag-region="true" className="flex-1 min-w-0 mx-2.5 flex items-center gap-1.5 truncate pointer-events-none">
            <span className="text-[12px] font-bold text-white truncate">
              {currentTrack?.title || 'Нет трека'}
            </span>
            <span className="text-[11px] text-[#8e8e93] truncate">
              • {currentTrack?.artist || 'Aura Player'}
            </span>
          </div>

          {/* Right: Adaptive Sound Wave Visualizer + Direct Expand Button */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div data-tauri-drag-region="true" className="flex items-center gap-[2.5px] h-6 px-1 pointer-events-none">
              <div 
                style={waveBarStyle}
                className={`w-[3px] rounded-full transition-all duration-300 ${
                  isPlaying ? 'ios-wave-active-1' : 'h-[5px] opacity-40'
                }`} 
              />
              <div 
                style={waveBarStyle}
                className={`w-[3px] rounded-full transition-all duration-300 ${
                  isPlaying ? 'ios-wave-active-2' : 'h-[8px] opacity-40'
                }`} 
              />
              <div 
                style={waveBarStyle}
                className={`w-[3px] rounded-full transition-all duration-300 ${
                  isPlaying ? 'ios-wave-active-3' : 'h-[12px] opacity-40'
                }`} 
              />
              <div 
                style={waveBarStyle}
                className={`w-[3px] rounded-full transition-all duration-300 ${
                  isPlaying ? 'ios-wave-active-4' : 'h-[7px] opacity-40'
                }`} 
              />
              <div 
                style={waveBarStyle}
                className={`w-[3px] rounded-full transition-all duration-300 ${
                  isPlaying ? 'ios-wave-active-5' : 'h-[4px] opacity-40'
                }`} 
              />
            </div>

            <button
              data-no-drag
              onClick={(e) => { e.stopPropagation(); toggleCollapse(); }}
              className="w-5 h-5 rounded-full bg-white/[0.08] hover:bg-white/[0.22] flex items-center justify-center text-white/60 hover:text-white transition-all cursor-pointer"
              title="Развернуть"
            >
              <Maximize2 size={10} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      ) : (
        /* ================= EXPANDED DYNAMIC ISLAND (SCREENSHOT 2) ================= */
        <div 
          data-tauri-drag-region="true"
          onMouseDown={handleUniversalMouseDown}
          onDoubleClick={toggleMiniPlayer}
          className="w-full h-full bg-black text-white rounded-[28px] p-3.5 px-4 flex flex-col justify-between border border-white/[0.18] select-none cursor-move relative overflow-hidden"
        >
          {/* Top Row: Cover, Info, Sound Wave */}
          <div data-tauri-drag-region="true" className="flex items-center justify-between gap-3 min-w-0">
            {/* Cover */}
            <div data-tauri-drag-region="true" className="w-[46px] h-[46px] rounded-[13px] overflow-hidden bg-neutral-900 border border-white/10 shrink-0 shadow-md relative pointer-events-none">
              {isVideoUrl(coverUrl) ? (
                <video 
                  src={coverUrl} 
                  autoPlay loop muted playsInline 
                  className="w-full h-full object-cover" 
                  onLoadedMetadata={(e) => { e.currentTarget.playbackRate = coverSpeed; }}
                />
              ) : (
                <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
              )}
            </div>

            {/* Title & Artist */}
            <div data-tauri-drag-region="true" className="flex-1 min-w-0 flex flex-col justify-center pointer-events-none">
              <span className="text-[14px] font-bold text-white tracking-tight truncate leading-tight">
                {currentTrack?.title || 'Нет трека'}
              </span>
              <span className="text-[12px] font-medium text-[#8e8e93] truncate leading-tight mt-0.5">
                {currentTrack?.artist || 'Неизвестный исполнитель'}
              </span>
            </div>

            {/* Top Right: Adaptive Sound Wave & Collapse Button */}
            <div data-tauri-drag-region="true" className="flex items-center gap-2 shrink-0">
              {/* 5-bar Adaptive iOS Equalizer */}
              <div data-tauri-drag-region="true" className="flex items-center gap-[2.5px] h-6 px-1 pointer-events-none">
                <div 
                  style={waveBarStyle}
                  className={`w-[3px] rounded-full transition-all duration-300 ${
                    isPlaying ? 'ios-wave-active-1' : 'h-[5px] opacity-40'
                  }`} 
                />
                <div 
                  style={waveBarStyle}
                  className={`w-[3px] rounded-full transition-all duration-300 ${
                    isPlaying ? 'ios-wave-active-2' : 'h-[8px] opacity-40'
                  }`} 
                />
                <div 
                  style={waveBarStyle}
                  className={`w-[3px] rounded-full transition-all duration-300 ${
                    isPlaying ? 'ios-wave-active-3' : 'h-[12px] opacity-40'
                  }`} 
                />
                <div 
                  style={waveBarStyle}
                  className={`w-[3px] rounded-full transition-all duration-300 ${
                    isPlaying ? 'ios-wave-active-4' : 'h-[7px] opacity-40'
                  }`} 
                />
                <div 
                  style={waveBarStyle}
                  className={`w-[3px] rounded-full transition-all duration-300 ${
                    isPlaying ? 'ios-wave-active-5' : 'h-[4px] opacity-40'
                  }`} 
                />
              </div>

              {/* Collapse button into pill */}
              <button
                data-no-drag
                onClick={toggleCollapse}
                className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.18] flex items-center justify-center text-white/50 hover:text-white transition-all cursor-pointer shrink-0"
                title="Свернуть в полоску Dynamic Island"
              >
                <Minimize2 size={11} strokeWidth={2.2} />
              </button>
            </div>
          </div>

          {/* Middle Row: Scrubber & Timestamps */}
          <div data-tauri-drag-region="true" className="flex items-center gap-2 my-0.5 py-1">
            <span data-tauri-drag-region="true" className="text-[10px] font-mono font-medium text-[#8e8e93] w-7 text-left tabular-nums shrink-0 pointer-events-none">
              {formatTime(progress)}
            </span>

            <div 
              ref={progressBarRef}
              data-no-drag
              onMouseDown={handleMouseDownProgress}
              className="flex-1 h-3 flex items-center cursor-pointer group/bar relative"
            >
              <div className="w-full h-[4px] bg-white/[0.18] rounded-full relative overflow-hidden group-hover/bar:h-[5px] transition-all">
                <div 
                  className="h-full bg-white rounded-full transition-all duration-100"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div 
                className="w-2.5 h-2.5 bg-white rounded-full absolute top-1/2 -translate-y-1/2 -translate-x-1/2 shadow-sm opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none"
                style={{ left: `${progressPercent}%` }}
              />
            </div>

            <span data-tauri-drag-region="true" className="text-[10px] font-mono font-medium text-[#8e8e93] w-9 text-right tabular-nums shrink-0 pointer-events-none">
              {duration > 0 ? `-${formatTime(remainingTime)}` : '0:00'}
            </span>
          </div>

          {/* Bottom Row: Controls */}
          <div data-tauri-drag-region="true" className="flex items-center justify-between px-1">
            {/* Left: Like Button */}
            <button 
              data-no-drag
              onClick={handleToggleLike}
              className={`p-1.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${
                isCurrentLiked ? 'text-[var(--accent)]' : 'text-white/40 hover:text-white'
              }`}
              title={isCurrentLiked ? 'Убрать из любимых' : 'В любимые'}
            >
              <Heart size={16} strokeWidth={2} fill={isCurrentLiked ? 'currentColor' : 'none'} />
            </button>

            {/* Center Controls: Previous, Play/Pause, Next */}
            <div data-tauri-drag-region="true" className="flex items-center gap-5">
              {/* Previous Track */}
              <button 
                data-no-drag
                onClick={handlePrev}
                className="text-white hover:text-white/80 active:scale-90 transition-transform cursor-pointer p-1"
                title="Предыдущий трек"
              >
                <SkipBack size={21} fill="currentColor" strokeWidth={0} />
              </button>

              {/* Play / Pause */}
              <button 
                data-no-drag
                onClick={handlePlayPause}
                className="text-white hover:scale-105 active:scale-95 transition-transform cursor-pointer flex items-center justify-center p-1"
                title={isPlaying ? 'Пауза' : 'Воспроизведение'}
              >
                {isPlaying ? (
                  <div className="flex items-center gap-[5px] h-6 px-1">
                    <div className="w-[5px] h-5 bg-white rounded-full" />
                    <div className="w-[5px] h-5 bg-white rounded-full" />
                  </div>
                ) : (
                  <Play size={24} fill="currentColor" strokeWidth={0} className="ml-0.5" />
                )}
              </button>

              {/* Next Track */}
              <button 
                data-no-drag
                onClick={handleNext}
                className="text-white hover:text-white/80 active:scale-90 transition-transform cursor-pointer p-1"
                title="Следующий трек"
              >
                <SkipForward size={21} fill="currentColor" strokeWidth={0} />
              </button>
            </div>

            {/* Right: Maximize / Return to Full App */}
            <button 
              data-no-drag
              onClick={toggleMiniPlayer}
              className="p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Развернуть полный плеер"
            >
              <Maximize2 size={15} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
