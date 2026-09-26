import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { usePlayerStore } from '../store/usePlayerStore';
import { useCollectionStore } from '../store/useCollectionStore';
import { useThemeStore } from '../store/useThemeStore';
import { useAppSettingsStore } from '../store/useAppSettingsStore';
import { MediaCover } from './MediaCover';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, 
  Shuffle, Heart, PlusCircle, PanelRight, Maximize2 
} from 'lucide-react';
import { ArtistLinks } from './ArtistLinks';
import { PlaylistPopover } from './PlaylistPopover';

const BottomPlayer: React.FC = () => {
  const { 
    queue, currentTrackIndex, isPlaying, togglePlayPause, 
    nextTrack, prevTrack, volume, progress, setProgress, setVolume,
    isShuffle, repeatMode, toggleShuffle, toggleRepeat, toggleFullscreen
  } = usePlayerStore();
  const { toggleLike, isLiked } = useCollectionStore();
  const { 
    customCover, coverSpeed,
    transparencyEnabled, windowOpacity, glassStrength, glassBlur, customWallpaper
  } = useThemeStore();
  const language = useAppSettingsStore(state => state.language);

  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const volumeContainerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const currentTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null;
  const coverUrl = customCover || currentTrack?.customCoverPath || currentTrack?.originalCoverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
  const duration = currentTrack?.duration || 0;

  // Close volume mixer when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (volumeContainerRef.current && !volumeContainerRef.current.contains(e.target as Node)) {
        setIsVolumeOpen(false);
      }
    };
    if (isVolumeOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isVolumeOpen]);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    setProgress(percentage * duration);
  };

  const handleVolumeWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    setVolume(Math.max(0, Math.min(1, volume + delta)));
  };

  if (!currentTrack) return null;

  return (
    <div className="w-full px-4 pb-3 pt-1 shrink-0 select-none z-50 bg-transparent relative">
      {/* Floating Player Card */}
      <div 
        className="w-full h-[68px] rounded-[20px] relative flex items-center px-3.5 sm:px-4 justify-between shadow-2xl shadow-black/60 transition-all duration-300 border"
        style={{ 
          backgroundColor: transparencyEnabled && customWallpaper
            ? `rgba(16, 16, 22, ${Math.max(0.10, (windowOpacity / 100) * 0.78)})`
            : 'var(--bg-surface)',
          backdropFilter: transparencyEnabled && customWallpaper && glassBlur > 0
            ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.5}%)`
            : undefined,
          WebkitBackdropFilter: transparencyEnabled && customWallpaper && glassBlur > 0
            ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.5}%)`
            : undefined,
          borderColor: transparencyEnabled && customWallpaper
            ? `rgba(255, 255, 255, ${0.08 + (glassStrength / 100) * 0.16})`
            : 'var(--border-main)',
          boxShadow: transparencyEnabled && customWallpaper
            ? `0 20px 50px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,${(glassStrength / 100) * 0.18})`
            : undefined
        }}
      >
        
        {/* Left: Cover Art, Track Info & Heart */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 max-w-[42%] sm:max-w-[calc(50%-120px)] z-10">
          {/* Cover Art */}
          <div className="w-11 h-11 rounded-xl overflow-hidden bg-[var(--bg-surface-hover)] shrink-0 border border-[var(--border-main)] shadow-sm relative group cursor-pointer"
            onClick={toggleFullscreen}
            title="Развернуть полноэкранный плеер"
          >
            <MediaCover
              src={coverUrl}
              speed={coverSpeed}
              alt="Cover"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
              <Maximize2 size={16} className="text-white drop-shadow-md" />
            </div>
          </div>

          {/* Title & Artist */}
          <div className="flex flex-col min-w-0 justify-center">
            <span 
              className="text-[var(--text-main)] text-[13px] font-semibold truncate hover:underline cursor-pointer track-title uppercase tracking-wide leading-tight"
              onClick={toggleFullscreen}
              title={currentTrack.title}
            >
              {currentTrack.title}
            </span>
            <ArtistLinks 
              artist={currentTrack.artist} 
              className="text-[var(--text-secondary)] text-[11px] truncate transition-colors uppercase tracking-wider leading-tight mt-0.5"
              linkClassName="hover:text-[var(--text-main)]"
              viewMode="modal"
            />
          </div>

          {/* Like Heart Button */}
          <button 
            onClick={() => toggleLike(currentTrack)}
            className="text-[var(--text-secondary)] hover:text-[var(--accent)] hover:scale-110 active:scale-95 transition-all p-1 shrink-0"
            title={isLiked(currentTrack.id) ? (language === 'ru' ? "Удалить из любимых" : "Remove from favorites") : (language === 'ru' ? "В любимые" : "Add to favorites")}
          >
            <Heart 
              size={18} 
              strokeWidth={1.8}
              fill={isLiked(currentTrack.id) ? "var(--accent)" : "none"} 
              color={isLiked(currentTrack.id) ? "var(--accent)" : "currentColor"} 
            />
          </button>
        </div>

        {/* Center: Delicate Hollow Playback Controls (Mathematically centered & tightened) */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-4 sm:gap-4.5 z-10">
          <button 
            onClick={toggleRepeat}
            className={`transition-colors p-1 relative ${repeatMode !== 'off' ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'}`}
            title={language === 'ru' ? "Повтор" : "Repeat"}
          >
            <Repeat size={18} strokeWidth={1.8} />
            {repeatMode === 'one' && (
              <span className="absolute -top-1 -right-1 text-[8px] font-bold text-[var(--accent)]">1</span>
            )}
          </button>
          
          <button 
            onClick={prevTrack}
            className="text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:scale-105 active:scale-95 transition-all p-1"
            title={language === 'ru' ? "Предыдущий" : "Previous"}
          >
            <SkipBack size={21} strokeWidth={1.8} />
          </button>
          
          <button 
            onClick={togglePlayPause}
            className="text-[var(--text-main)] hover:text-[var(--accent)] hover:scale-110 active:scale-95 transition-all p-1 flex items-center justify-center"
            title={isPlaying ? (language === 'ru' ? "Пауза" : "Pause") : (language === 'ru' ? "Воспроизведение" : "Play")}
          >
            {isPlaying ? (
              <Pause size={25} strokeWidth={1.6} />
            ) : (
              <Play size={25} strokeWidth={1.6} className="ml-0.5" />
            )}
          </button>
          
          <button 
            onClick={() => nextTrack(false)}
            className="text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:scale-105 active:scale-95 transition-all p-1"
            title={language === 'ru' ? "Следующий" : "Next"}
          >
            <SkipForward size={21} strokeWidth={1.8} />
          </button>
          
          <button 
            onClick={toggleShuffle}
            className={`transition-colors p-1 ${isShuffle ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'}`}
            title={language === 'ru' ? "Случайный порядок" : "Shuffle"}
          >
            <Shuffle size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* Right: Pill Capsule with Expandable Volume Mixer */}
        <div className="flex items-center justify-end shrink-0 z-10">
          <div 
            ref={volumeContainerRef}
            className="h-8.5 px-2.5 rounded-full bg-[var(--bg-main)]/60 border border-white/[0.05] flex items-center gap-2 transition-all shadow-inner"
          >
            {/* Volume Speaker + Expandable Slider */}
            <div className="flex items-center">
              <button
                onClick={() => setIsVolumeOpen(prev => !prev)}
                onWheel={handleVolumeWheel}
                className={`p-0.5 transition-colors cursor-pointer flex items-center justify-center ${
                  isVolumeOpen || volume > 0 ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                }`}
                title={isVolumeOpen ? (language === 'ru' ? "Свернуть громкость" : "Hide volume") : (language === 'ru' ? "Настроить громкость" : "Adjust volume")}
              >
                {volume === 0 ? (
                  <VolumeX size={17} strokeWidth={1.8} />
                ) : (
                  <Volume2 size={17} strokeWidth={1.8} />
                )}
              </button>

              <motion.div
                initial={false}
                animate={{ 
                  width: isVolumeOpen ? 84 : 0,
                  opacity: isVolumeOpen ? 1 : 0,
                  marginLeft: isVolumeOpen ? 6 : 0,
                  marginRight: isVolumeOpen ? 4 : 0
                }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden flex items-center shrink-0"
                onWheel={handleVolumeWheel}
              >
                <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  onWheel={handleVolumeWheel}
                  className="w-[84px] min-w-[84px] max-w-[84px] h-[3px] bg-white/10 rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-0 [&::-webkit-slider-thumb]:h-0 [&::-webkit-slider-thumb]:opacity-0 [&::-moz-range-thumb]:w-0 [&::-moz-range-thumb]:h-0 [&::-moz-range-thumb]:opacity-0 [&::-moz-range-thumb]:border-0"
                  style={{
                    background: `linear-gradient(to right, var(--accent) ${volume * 100}%, rgba(255,255,255,0.15) ${volume * 100}%)`
                  }}
                />
              </motion.div>
            </div>

            {/* Middle Action Button: Plus in Circle -> Add to Playlist */}
            <PlaylistPopover
              track={currentTrack}
              direction="up"
              className="text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors p-0.5 cursor-pointer hover:scale-105 flex items-center justify-center"
              icon={<PlusCircle size={17} strokeWidth={1.8} />}
            />

            {/* Right Action Button: Sidebar / Panel Toggle */}
            <button
              onClick={toggleFullscreen}
              className="text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors p-0.5 cursor-pointer hover:scale-105 flex items-center justify-center"
              title={language === 'ru' ? "Развернуть" : "Expand"}
            >
              <PanelRight size={17} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* Integrated Red Progress Bar running along the very bottom edge */}
        <div 
          ref={progressBarRef}
          className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-white/5 cursor-pointer group hover:h-[3.5px] transition-all"
          onClick={handleProgressClick}
          title="Перемотка"
        >
          <div 
            className="h-full bg-[var(--accent)] transition-all duration-75 relative"
            style={{ width: `${duration > 0 ? (progress / duration) * 100 : 0}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default BottomPlayer;
