import React from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useThemeStore, isVideoUrl } from '../store/useThemeStore';
import { Play, Pause, SkipBack, SkipForward, Maximize2, Shuffle, Repeat, Repeat1 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

const COMPACT_HEIGHT = 108;
const EXPANDED_HEIGHT = 148;

export const MiniPlayerRectangle: React.FC = () => {
  const { 
    queue, currentTrackIndex, isPlaying, progress, isShuffle, repeatMode,
    toggleMiniPlayer, togglePlayPause, nextTrack, prevTrack, toggleShuffle, toggleRepeat
  } = usePlayerStore();
  const { customCover, coverSpeed } = useThemeStore();
  const currentTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null;

  const [isHovered, setIsHovered] = React.useState(false);
  const currentHeightRef = React.useRef(COMPACT_HEIGHT);
  const animFrameRef = React.useRef<number | null>(null);
  const leaveTimeoutRef = React.useRef<number | null>(null);

  const baseCoverUrl = currentTrack?.customCoverPath || currentTrack?.originalCoverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
  const coverUrl = customCover ? customCover : baseCoverUrl.replace('400x400', '200x200').replace('50x50', '200x200');

  const handlePlayPause = () => togglePlayPause();
  const handleNext = () => nextTrack(false);
  const handlePrev = () => prevTrack();

  const duration = currentTrack?.duration || 0;
  const progressPercent = duration ? (progress / duration) * 100 : 0;
  
  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds === 0) return '0:00';
    const m = Math.floor(timeInSeconds / 60);
    const s = Math.floor(timeInSeconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressBarRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const handleDrag = React.useCallback((clientX: number) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    usePlayerStore.getState().setProgress(percentage * duration);
  }, [duration]);

  React.useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) handleDrag(e.clientX);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleDrag]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleDrag(e.clientX);
  };

  // Smooth window height animation
  const animateToHeight = React.useCallback((targetHeight: number) => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    const startHeight = currentHeightRef.current;
    const startTime = performance.now();
    const durationMs = 200;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - t, 3);
      const newH = startHeight + (targetHeight - startHeight) * ease;
      currentHeightRef.current = newH;
      invoke('set_mini_height', { height: Math.round(newH) }).catch(() => {});
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        currentHeightRef.current = targetHeight;
        invoke('set_mini_height', { height: targetHeight }).catch(() => {});
        animFrameRef.current = null;
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  const handleMouseEnter = React.useCallback(() => {
    if (leaveTimeoutRef.current !== null) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    setIsHovered(true);
    animateToHeight(EXPANDED_HEIGHT);
  }, [animateToHeight]);

  const handleMouseLeave = React.useCallback(() => {
    if (isDragging) return;
    leaveTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(false);
      animateToHeight(COMPACT_HEIGHT);
    }, 160);
  }, [isDragging, animateToHeight]);

  React.useEffect(() => {
    if (!isDragging && !isHovered && currentHeightRef.current !== COMPACT_HEIGHT) {
      animateToHeight(COMPACT_HEIGHT);
    }
  }, [isDragging, isHovered, animateToHeight]);

  React.useEffect(() => {
    // Initial size check
    invoke('set_mini_height', { height: COMPACT_HEIGHT }).catch(() => {});
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      if (leaveTimeoutRef.current !== null) clearTimeout(leaveTimeoutRef.current);
    };
  }, []);

  return (
    <div 
      data-tauri-drag-region 
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={toggleMiniPlayer}
      className="w-full h-full relative overflow-hidden group cursor-move select-none"
    >
      {/* Blurred Background from Cover */}
      {isVideoUrl(coverUrl) ? (
        <video 
          src={coverUrl} 
          autoPlay 
          loop 
          muted 
          playsInline 
          onLoadedMetadata={(e) => { e.currentTarget.playbackRate = coverSpeed; }}
          className="absolute inset-0 w-full h-full object-cover scale-150 blur-3xl saturate-150 opacity-80 pointer-events-none" 
        />
      ) : (
        <img src={coverUrl} alt="bg" className="absolute inset-0 w-full h-full object-cover scale-150 blur-3xl saturate-150 opacity-80 pointer-events-none" />
      )}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* UI Content */}
      <div data-tauri-drag-region className="absolute inset-0 z-30 flex flex-col px-4 pt-3.5 pb-2">
        
        {/* Top: Cover + Info */}
        <div data-tauri-drag-region className="flex items-center gap-3">
          {isVideoUrl(coverUrl) ? (
            <video 
              src={coverUrl} 
              autoPlay 
              loop 
              muted 
              playsInline 
              onLoadedMetadata={(e) => { e.currentTarget.playbackRate = coverSpeed; }}
              className="w-14 h-14 rounded-lg shadow-md object-cover pointer-events-none flex-shrink-0" 
            />
          ) : (
            <img src={coverUrl} alt="cover" className="w-14 h-14 rounded-lg shadow-md object-cover pointer-events-none flex-shrink-0" />
          )}
          <div data-tauri-drag-region className="flex-1 min-w-0">
            <div data-tauri-drag-region className="text-[var(--text-main)] text-sm font-bold truncate drop-shadow-md">
              {currentTrack?.title || 'Нет трека'}
            </div>
            <div data-tauri-drag-region className="text-[var(--text-main)]/60 text-xs truncate drop-shadow-md mt-0.5">
              {currentTrack?.artist || 'Неизвестный исполнитель'}
            </div>
          </div>
        </div>

        {/* Middle: Progress Bar */}
        <div data-tauri-drag-region className="mt-2.5 flex flex-col gap-1">
          <div 
            ref={progressBarRef}
            onMouseDown={handleMouseDown}
            className="w-full h-2 flex items-center group/progress cursor-pointer py-0.5"
          >
            <div className="w-full h-1.5 group-hover/progress:h-2 bg-white/20 rounded-full overflow-hidden transition-all duration-200">
              <div 
                className="h-full bg-white transition-all duration-100 ease-linear rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-[var(--text-main)]/60 font-medium leading-none">
            <span>{formatTime(progress)}</span>
            <span>-{formatTime(duration - progress)}</span>
          </div>
        </div>

        {/* Bottom: Controls (Sliding down smoothly on hover) */}
        <div 
          data-tauri-drag-region
          className={`overflow-hidden transition-all duration-250 ease-out ${
            isHovered 
              ? 'max-h-12 opacity-100 mt-2 pointer-events-auto' 
              : 'max-h-0 opacity-0 mt-0 pointer-events-none'
          }`}
        >
          <div 
            data-tauri-drag-region 
            className={`flex items-center justify-between text-[var(--text-main)]/70 transition-all duration-250 ease-out transform ${
              isHovered ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
            }`}
          >
            <button 
              onClick={toggleMiniPlayer} 
              className="p-1 text-white/50 hover:text-white transition-colors cursor-pointer rounded-md hover:bg-white/10"
            >
              <Maximize2 size={14} />
            </button>
            
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleShuffle} 
                className={`p-1 rounded-md transition-all cursor-pointer ${
                  isShuffle 
                    ? 'text-[var(--accent)] drop-shadow-[0_0_8px_var(--accent)]' 
                    : 'text-white/50 hover:text-white hover:bg-white/10'
                }`}
              >
                <Shuffle size={14} />
              </button>
              
              <button 
                onClick={handlePrev} 
                className="p-1 rounded-md text-white/70 hover:text-white hover:scale-110 active:scale-95 transition-all cursor-pointer"
              >
                <SkipBack size={18} fill="currentColor" />
              </button>
              
              <button 
                onClick={handlePlayPause} 
                className="p-1 rounded-md text-white hover:scale-115 active:scale-95 transition-all cursor-pointer"
              >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
              </button>
              
              <button 
                onClick={handleNext} 
                className="p-1 rounded-md text-white/70 hover:text-white hover:scale-110 active:scale-95 transition-all cursor-pointer"
              >
                <SkipForward size={18} fill="currentColor" />
              </button>
              
              <button 
                onClick={toggleRepeat} 
                className={`p-1 rounded-md transition-all cursor-pointer ${
                  repeatMode !== 'off' 
                    ? 'text-[var(--accent)] drop-shadow-[0_0_8px_var(--accent)]' 
                    : 'text-white/50 hover:text-white hover:bg-white/10'
                }`}
              >
                {repeatMode === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />}
              </button>
            </div>

            <div className="w-6" />
          </div>
        </div>

      </div>
    </div>
  );
};
