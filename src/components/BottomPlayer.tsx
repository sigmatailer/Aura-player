import React, { useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useCollectionStore } from '../store/useCollectionStore';
import { useThemeStore, isVideoUrl } from '../store/useThemeStore';
import { Play, Pause, SkipBack, SkipForward, Volume2, Repeat, Shuffle, Maximize2, Heart } from 'lucide-react';
import { TrackOptionsPopover } from './TrackOptionsPopover';
import { ArtistLinks } from './ArtistLinks';

const BottomPlayer: React.FC = () => {
  const { 
    queue, currentTrackIndex, isPlaying, togglePlayPause, 
    nextTrack, prevTrack, volume, progress, setProgress, setVolume,
    isShuffle, repeatMode, toggleShuffle, toggleRepeat, toggleFullscreen
  } = usePlayerStore();
  const { toggleLike, isLiked } = useCollectionStore();
  const { customCover, coverSpeed } = useThemeStore();

  const progressBarRef = useRef<HTMLDivElement>(null);

  const currentTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null;
  const coverUrl = customCover || currentTrack?.customCoverPath || currentTrack?.originalCoverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
  
  const duration = currentTrack?.duration || 0;
  
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    setProgress(percentage * duration);
  };



  if (!currentTrack) return null;

  return (
    <div className="w-full h-16 md:h-[80px] bg-[var(--bg-surface)] border-t border-[var(--border-main)] flex items-center px-3 md:px-4 justify-between shrink-0 relative z-40 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] select-none">
      
      {/* Absolute Progress Bar at the very top of the bottom player */}
      <div 
        ref={progressBarRef}
        className="absolute top-0 left-0 right-0 h-1 bg-[var(--bg-surface-hover)] cursor-pointer group"
        onClick={handleProgressClick}
      >
        <div 
          className="h-full bg-[var(--accent)] relative group-hover:bg-[var(--accent-hover)] transition-colors"
          style={{ width: `${duration > 0 ? (progress / duration) * 100 : 0}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transform translate-x-1/2 shadow-md transition-opacity" />
        </div>
      </div>

      {/* Left: Track Info - Tap anywhere here on mobile to open Fullscreen */}
      <div 
        className="flex items-center gap-2.5 md:gap-3 flex-1 md:w-[30%] md:flex-initial min-w-0 cursor-pointer"
        onClick={toggleFullscreen}
      >
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-md overflow-hidden bg-[var(--bg-surface-hover)] shrink-0 shadow-md relative group">
          {isVideoUrl(coverUrl) ? (
            <video 
              src={coverUrl} 
              autoPlay 
              loop 
              muted 
              playsInline 
              onLoadedMetadata={(e) => { e.currentTarget.playbackRate = coverSpeed; }}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
            />
          ) : (
            <img src={coverUrl} alt="Cover" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          )}
          <div 
            className="absolute inset-0 bg-black/40 opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer backdrop-blur-sm"
          >
            <Maximize2 size={18} className="text-[var(--text-main)] drop-shadow-lg transition-transform hover:scale-110" />
          </div>
        </div>
        <div className="flex flex-col min-w-0 pr-2">
          <span className="text-[var(--text-main)] text-xs md:text-sm font-medium truncate hover:underline track-title">{currentTrack.title}</span>
          <div onClick={(e) => e.stopPropagation()}>
            <ArtistLinks 
              artist={currentTrack.artist} 
              className="text-[var(--text-secondary)] text-[11px] md:text-xs truncate transition-colors"
              linkClassName="hover:text-[var(--text-main)]"
              viewMode="modal"
            />
          </div>
        </div>
      </div>

      {/* Center: Controls for desktop */}
      <div className="hidden md:flex flex-col items-center justify-center flex-1 max-w-[400px]">
        <div className="flex items-center gap-6">
          <button 
            onClick={toggleShuffle}
            className={`transition-colors ${isShuffle ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'}`}
          >
            <Shuffle size={18} />
          </button>
          
          <button 
            onClick={prevTrack}
            className="text-[#cccccc] hover:text-[var(--text-main)] transition-colors"
          >
            <SkipBack size={22} fill="currentColor" />
          </button>
          
          <button 
            onClick={togglePlayPause}
            className="w-10 h-10 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform"
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
          </button>
          
          <button 
            onClick={() => nextTrack()}
            className="text-[#cccccc] hover:text-[var(--text-main)] transition-colors"
          >
            <SkipForward size={22} fill="currentColor" />
          </button>
          
          <button 
            onClick={toggleRepeat}
            className={`transition-colors relative ${repeatMode !== 'off' ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'}`}
          >
            <Repeat size={18} />
            {repeatMode === 'one' && (
              <span className="absolute -top-1 -right-1 text-[8px] font-bold bg-[var(--bg-surface)] rounded-full w-3 h-3 flex items-center justify-center">1</span>
            )}
          </button>
        </div>
      </div>

      {/* Right: Controls for Mobile & Desktop */}
      <div className="flex items-center justify-end gap-2 md:gap-3 shrink-0 md:w-[30%] md:min-w-[150px]">
        {currentTrack && (
          <>
            <button 
              onClick={() => toggleLike(currentTrack)}
              className="text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors p-1.5"
            >
              <Heart size={18} fill={isLiked(currentTrack.id) ? "var(--accent)" : "none"} color={isLiked(currentTrack.id) ? "var(--accent)" : "currentColor"} />
            </button>
            <div className="hidden md:block">
              <TrackOptionsPopover track={currentTrack} direction="up" />
            </div>
          </>
        )}

        {/* Mobile quick controls: Play/Pause and Next */}
        <div className="flex md:hidden items-center gap-1">
          <button 
            onClick={togglePlayPause}
            className="w-9 h-9 flex items-center justify-center bg-white text-black rounded-full active:scale-95 transition-transform shadow-md"
          >
            {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
          </button>
          <button 
            onClick={() => nextTrack()}
            className="p-1.5 text-[var(--text-secondary)] active:text-[var(--text-main)] transition-colors"
          >
            <SkipForward size={20} fill="currentColor" />
          </button>
        </div>

        {/* Desktop Volume */}
        <div className="hidden md:flex items-center gap-2">
          <Volume2 size={18} className="text-[var(--text-secondary)]" />
          <div className="w-24 h-1 bg-[var(--border-main)] rounded-full overflow-hidden cursor-pointer flex items-center group relative">
            <input 
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="absolute inset-0 opacity-0 cursor-pointer w-full"
            />
            <div 
              className="h-full bg-[var(--text-main)] group-hover:bg-[var(--accent)] pointer-events-none transition-colors"
              style={{ width: `${volume * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BottomPlayer;
