import React, { useRef, useEffect } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useThemeStore, isVideoUrl } from '../store/useThemeStore';
import { Play, Pause, SkipBack, SkipForward, Maximize2, Shuffle, Repeat, Repeat1 } from 'lucide-react';

export const MiniPlayer: React.FC = () => {
  const { 
    queue, currentTrackIndex, isPlaying, progress,
    isShuffle, repeatMode, toggleShuffle, toggleRepeat,
    toggleMiniPlayer, togglePlayPause, nextTrack, prevTrack, setProgress
  } = usePlayerStore();
  const { customCover, coverSpeed, getActiveFont, getActiveTrackFont } = useThemeStore();
  
  const coverVideoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isSeeking, setIsSeeking] = React.useState(false);

  const activeFont = getActiveFont();
  const activeTrackFont = getActiveTrackFont();

  const currentTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null;
  const baseCoverUrl = currentTrack?.customCoverPath || currentTrack?.originalCoverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
  const coverUrl = customCover ? customCover : baseCoverUrl;

  const duration = currentTrack?.duration || 0;
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  useEffect(() => {
    if (coverVideoRef.current) {
      coverVideoRef.current.playbackRate = coverSpeed;
    }
  }, [coverSpeed]);

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

  const handleShuffle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleShuffle();
  };

  const handleRepeat = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleRepeat();
  };

  const handleSeek = React.useCallback((clientX: number) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    setProgress(percentage * duration);
  }, [duration, setProgress]);

  React.useEffect(() => {
    const handleMouseUp = () => setIsSeeking(false);
    const handleMouseMove = (e: MouseEvent) => {
      if (isSeeking) handleSeek(e.clientX);
    };

    if (isSeeking) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSeeking, handleSeek]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsSeeking(true);
    handleSeek(e.clientX);
  };

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds <= 0) return '0:00';
    const m = Math.floor(timeInSeconds / 60);
    const s = Math.floor(timeInSeconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      data-tauri-drag-region 
      onDoubleClick={toggleMiniPlayer}
      className="w-full h-full relative overflow-hidden flex flex-col justify-between p-3 pb-2.5 select-none bg-[#121214] text-white cursor-move border border-white/15 shadow-2xl"
      style={{ fontFamily: activeFont?.family }}
    >
      {/* Full-bleed Cover Media (Image, GIF, or Video with speed sync) */}
      <div data-tauri-drag-region className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {isVideoUrl(coverUrl) ? (
          <video 
            ref={coverVideoRef}
            src={coverUrl} 
            autoPlay 
            loop 
            muted 
            playsInline 
            onLoadedMetadata={(e) => { e.currentTarget.playbackRate = coverSpeed; }}
            className="w-full h-full object-cover select-none" 
          />
        ) : (
          <img 
            src={coverUrl} 
            alt={currentTrack?.title || "Cover"} 
            className="w-full h-full object-cover select-none" 
          />
        )}
        {/* Sleek Gradient Overlay for Controls Readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/25 pointer-events-none" />
      </div>

      {/* Top Bar: Return/Maximize Icon */}
      <div data-tauri-drag-region className="relative z-10 flex items-center justify-end w-full">
        <button 
          onClick={toggleMiniPlayer} 
          className="text-white/60 hover:text-white bg-black/40 hover:bg-black/65 border border-white/10 rounded-full p-1.5 transition-all hover:scale-105 cursor-pointer shadow-md backdrop-blur-sm"
        >
          <Maximize2 size={12} />
        </button>
      </div>

      {/* Bottom Overlaid Section: Info, Controls Pill, Progress Bar */}
      <div data-tauri-drag-region className="relative z-10 flex flex-col w-full gap-2">
        {/* Track Title and Artist */}
        <div data-tauri-drag-region className="flex flex-col items-center justify-center text-center w-full px-1">
          <div 
            data-tauri-drag-region 
            className="text-white text-[15px] font-bold truncate max-w-full tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] track-title leading-snug"
            style={{ fontFamily: activeTrackFont?.family }}
          >
            {currentTrack?.title || 'Нет трека'}
          </div>
          <div 
            data-tauri-drag-region 
            className="text-white/70 text-[12px] font-medium truncate max-w-full mt-0.5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
            style={{ fontFamily: activeFont?.family }}
          >
            {currentTrack?.artist || 'Неизвестный исполнитель'}
          </div>
        </div>

        {/* Controls Container (Overlaid Glass Pill) */}
        <div data-tauri-drag-region className="w-full flex items-center justify-center">
          <div 
            className="w-full bg-black/60 backdrop-blur-xl border border-white/[0.12] rounded-2xl py-1.5 px-3 flex items-center justify-between shadow-2xl"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button 
              onClick={handleShuffle} 
              className={`p-1.5 rounded-full transition-all hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center ${
                isShuffle 
                  ? 'text-[var(--accent)] drop-shadow-[0_0_8px_var(--accent)]' 
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <Shuffle size={15} strokeWidth={isShuffle ? 2.5 : 2} />
            </button>

            <button 
              onClick={handlePrev} 
              className="p-1.5 rounded-full text-white/80 hover:text-white transition-all hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center"
            >
              <SkipBack size={17} fill="currentColor" />
            </button>
            
            <button 
              onClick={handlePlayPause}
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer shrink-0"
            >
              {isPlaying ? (
                <Pause size={17} fill="currentColor" />
              ) : (
                <Play size={17} fill="currentColor" className="ml-0.5" />
              )}
            </button>
            
            <button 
              onClick={handleNext} 
              className="p-1.5 rounded-full text-white/80 hover:text-white transition-all hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center"
            >
              <SkipForward size={17} fill="currentColor" />
            </button>

            <button 
              onClick={handleRepeat}
              className={`p-1.5 rounded-full transition-all hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center relative ${
                repeatMode !== 'off' 
                  ? 'text-[var(--accent)] drop-shadow-[0_0_8px_var(--accent)]' 
                  : 'text-white/50 hover:text-white'
              }`}
            >
              {repeatMode === 'one' ? (
                <Repeat1 size={15} strokeWidth={2.5} />
              ) : (
                <Repeat size={15} strokeWidth={repeatMode !== 'off' ? 2.5 : 2} />
              )}
            </button>
          </div>
        </div>

        {/* Bottom: Progress Bar with Timestamps & Accent Color Fill */}
        <div data-tauri-drag-region className="w-full flex items-center gap-2.5 px-0.5 pt-0.5">
          <span className="text-[11px] font-mono font-medium text-white/60 min-w-[28px] text-left select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {formatTime(progress)}
          </span>
          
          <div 
            ref={progressBarRef}
            onMouseDown={handleMouseDown}
            className="flex-1 h-3 flex items-center cursor-pointer group py-1"
          >
            <div className="w-full h-[5px] bg-white/20 rounded-full overflow-hidden relative group-hover:h-[6px] transition-all backdrop-blur-sm">
              <div 
                className="h-full bg-[var(--accent)] rounded-full transition-all duration-100 ease-linear shadow-[0_0_8px_var(--accent)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          
          <span className="text-[11px] font-mono font-medium text-white/60 min-w-[28px] text-right select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
};
