import React, { useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../store/usePlayerStore';
import { useCollectionStore } from '../store/useCollectionStore';
import { useThemeStore, isVideoUrl } from '../store/useThemeStore';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, Repeat, Shuffle, 
  Maximize2, SlidersHorizontal, Image as ImageIcon, Heart, 
  ThumbsDown, MoreVertical 
} from 'lucide-react';
import { ArtistLinks } from './ArtistLinks';
import { TrackOptionsPopover } from './TrackOptionsPopover';
import { EqualizerPopover } from './EqualizerPopover';

const TopPlayer: React.FC = () => {
  const { 
    queue, currentTrackIndex, isPlaying, togglePlayPause, 
    nextTrack, prevTrack, volume, progress, setProgress, setVolume,
    isShuffle, repeatMode, toggleShuffle, toggleRepeat
  } = usePlayerStore();
  const { toggleLike, isLiked } = useCollectionStore();
  const customCover = useThemeStore(state => state.customCover);
  const coverSpeed = useThemeStore(state => state.coverSpeed);
  const coverVideoRef = useRef<HTMLVideoElement>(null);
  const eqButtonRef = useRef<HTMLButtonElement>(null);
  const [isEqOpen, setIsEqOpen] = useState(false);
  const [volumeInputText, setVolumeInputText] = useState<string | null>(null);

  const currentTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null;
  const coverUrl = customCover || currentTrack?.customCoverPath || currentTrack?.originalCoverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';

  return (
    <div className="w-full flex flex-col md:flex-row items-center gap-4 sm:gap-6 md:gap-8 lg:gap-12 mt-0 bg-transparent select-none">
      {/* Cover Art - Left (or Top on mobile) */}
      <div className="w-[180px] h-[180px] sm:w-[240px] sm:h-[240px] md:w-[320px] md:h-[320px] lg:w-[370px] lg:h-[370px] shrink-0 rounded-[20px] overflow-hidden bg-transparent shadow-2xl shadow-black/80 border border-[var(--border-main)] relative group transition-all duration-300">
        {currentTrack || customCover ? (
          <>
            {isVideoUrl(coverUrl) ? (
              <video 
                ref={coverVideoRef}
                src={coverUrl} 
                autoPlay 
                loop 
                muted 
                playsInline
                onLoadedMetadata={(e) => { e.currentTarget.playbackRate = coverSpeed; }}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
              />
            ) : (
              <img 
                src={coverUrl} 
                alt="Cover" 
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
              />
            )}

            {/* Hover Fullscreen overlay */}
            <div 
              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer backdrop-blur-sm"
              onClick={() => usePlayerStore.getState().toggleFullscreen()}
              title="Развернуть текст"
            >
              <Maximize2 size={32} className="text-white drop-shadow-lg transition-transform hover:scale-110 lg:w-10 lg:h-10" />
            </div>

            {/* Floating Heart Button at bottom-left corner of cover */}
            {currentTrack && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLike(currentTrack);
                }}
                className="absolute bottom-3 left-3 w-9 h-9 rounded-full bg-black/60 backdrop-blur-md border border-[var(--border-main)] hover:border-white/30 flex items-center justify-center transition-all hover:scale-110 hover:bg-black/80 shadow-lg z-10 text-white"
                title={isLiked(currentTrack.id) ? "Удалить из любимых" : "В любимые"}
              >
                <Heart 
                  size={18} 
                  fill={isLiked(currentTrack.id) ? "var(--accent)" : "none"} 
                  color={isLiked(currentTrack.id) ? "var(--accent)" : "#ffffff"} 
                />
              </button>
            )}
          </>
        ) : (
          <div className="flex-1 h-full flex items-center justify-center text-[var(--text-secondary)] flex-col gap-4">
            <ImageIcon size={48} className="opacity-20" />
            <div className="text-center">
              <p>Очередь пуста</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls & Track Details - Right */}
      <div className="flex-1 w-full flex flex-col justify-center min-w-0 pr-0 lg:pr-4">
        {/* Title and Artist */}
        <div className="flex flex-col items-center justify-center text-center mb-5">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-wide uppercase text-white drop-shadow-md truncate max-w-full px-4">
            {currentTrack ? currentTrack.title : 'Не воспроизводится'}
          </h1>
          <div className="text-sm sm:text-base text-[#888] font-medium tracking-wide mt-1 uppercase truncate max-w-full">
            {currentTrack ? (
              <ArtistLinks artist={currentTrack.artist} viewMode="modal" linkClassName="hover:text-white transition-colors" />
            ) : null}
          </div>
        </div>

        {/* Progress Bar with timestamps below */}
        <div className="w-full flex flex-col gap-1.5 mb-5 px-1">
          <div className="relative w-full flex items-center group">
            <input 
              type="range"
              min="0"
              max={currentTrack?.duration || 100}
              step="0.5"
              value={progress || 0}
              onChange={(e) => setProgress(parseFloat(e.target.value))}
              className="w-full h-[3px] bg-white/10 rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-0 [&::-webkit-slider-thumb]:h-0 [&::-webkit-slider-thumb]:opacity-0 [&::-moz-range-thumb]:w-0 [&::-moz-range-thumb]:h-0 [&::-moz-range-thumb]:opacity-0 [&::-moz-range-thumb]:border-0"
              style={{
                background: `linear-gradient(to right, var(--accent) ${((progress || 0) / (currentTrack?.duration || 100)) * 100}%, rgba(255,255,255,0.1) ${((progress || 0) / (currentTrack?.duration || 100)) * 100}%)`
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#666] font-mono px-0.5">
            <span>
              {Math.floor((progress || 0) / 60)}:{Math.floor((progress || 0) % 60).toString().padStart(2, '0')}
            </span>
            <span>
              {currentTrack ? `${Math.floor(Math.round(currentTrack.duration) / 60)}:${(Math.round(currentTrack.duration) % 60).toString().padStart(2, '0')}` : '0:00'}
            </span>
          </div>
        </div>

        {/* Playback Controls Row (Ultra-thin theme-matching border) */}
        <div className="w-full bg-transparent border border-white/[0.05] rounded-2xl py-2.5 px-4 flex items-center justify-between mb-4 shadow-sm">
          {/* Options MoreVertical on far left */}
          <div className="flex items-center">
            {currentTrack ? (
              <TrackOptionsPopover 
                track={currentTrack} 
                icon={<MoreVertical size={20} className="text-[#777] hover:text-white transition-colors" />} 
                className="p-1 text-[#777] hover:text-white transition-colors"
              />
            ) : (
              <div className="w-5" />
            )}
          </div>

          {/* Center Playback Controls */}
          <div className="flex items-center gap-6 sm:gap-8">
            <button 
              onClick={toggleRepeat} 
              className={`transition-colors relative ${repeatMode !== 'off' ? 'text-[var(--accent)]' : 'text-[#777] hover:text-white'}`}
              title="Повтор"
            >
              <Repeat size={19} strokeWidth={2} />
              {repeatMode === 'one' && (
                <span className="absolute -top-2 -right-2 text-[9px] font-bold text-[var(--accent)]">1</span>
              )}
            </button>

            <button 
              onClick={prevTrack} 
              className="text-[#777] hover:text-white transition-colors p-1"
              title="Предыдущий трек"
            >
              <SkipBack size={22} strokeWidth={1.8} />
            </button>

            <button 
              onClick={togglePlayPause}
              className="text-white hover:scale-105 transition-transform flex items-center justify-center p-1"
              title={isPlaying ? "Пауза" : "Воспроизведение"}
            >
              {isPlaying ? (
                <Pause size={28} strokeWidth={1.8} />
              ) : (
                <Play size={28} strokeWidth={1.8} className="ml-0.5" />
              )}
            </button>

            <button 
              onClick={() => nextTrack(false)} 
              className="text-[#777] hover:text-white transition-colors p-1"
              title="Следующий трек"
            >
              <SkipForward size={22} strokeWidth={1.8} />
            </button>

            <button 
              onClick={toggleShuffle} 
              className={`transition-colors ${isShuffle ? 'text-[var(--accent)]' : 'text-[#777] hover:text-white'}`}
              title="Случайный порядок"
            >
              <Shuffle size={19} strokeWidth={2} />
            </button>
          </div>

          {/* ThumbsDown Dislike on far right */}
          <button 
            onClick={() => nextTrack(false)}
            className="text-[#777] hover:text-[var(--accent)] transition-colors p-1"
            title="Не нравится (следующий трек)"
          >
            <ThumbsDown size={19} strokeWidth={1.8} />
          </button>
        </div>

        {/* Bottom Row: Volume Slider & Equalizer Button */}
        <div className="w-full flex items-center justify-between gap-4">
          {/* Volume on left (responsive full width) */}
          <div className="flex-1 flex items-center gap-3 bg-transparent border border-white/[0.05] rounded-full px-4 py-2 shadow-sm">
            <Volume2 size={16} className="text-[#777] shrink-0" />
            <input 
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                if (volumeInputText !== null) setVolumeInputText(null);
              }}
              className="w-full h-[3px] bg-white/10 rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-0 [&::-webkit-slider-thumb]:h-0 [&::-webkit-slider-thumb]:opacity-0 [&::-moz-range-thumb]:w-0 [&::-moz-range-thumb]:h-0 [&::-moz-range-thumb]:opacity-0 [&::-moz-range-thumb]:border-0"
              style={{
                background: `linear-gradient(to right, var(--accent) ${volume * 100}%, rgba(255,255,255,0.1) ${volume * 100}%)`
              }}
            />
            <div className="flex items-center justify-center shrink-0 select-none">
              <input 
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={volumeInputText !== null ? volumeInputText : Math.round(volume * 100)}
                onFocus={() => setVolumeInputText(Math.round(volume * 100).toString())}
                onBlur={() => {
                  if (volumeInputText !== null) {
                    const val = parseInt(volumeInputText, 10);
                    if (!isNaN(val)) {
                      setVolume(Math.min(100, Math.max(0, val)) / 100);
                    }
                    setVolumeInputText(null);
                  }
                }}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  if (raw === '') {
                    setVolumeInputText('');
                    return;
                  }
                  const val = parseInt(raw, 10);
                  const clamped = Math.min(100, Math.max(0, val));
                  setVolumeInputText(clamped.toString());
                  setVolume(clamped / 100);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                onWheel={(e) => {
                  e.preventDefault();
                  const delta = e.deltaY < 0 ? 0.02 : -0.02;
                  const newVol = Math.min(1, Math.max(0, parseFloat((volume + delta).toFixed(2))));
                  setVolume(newVol);
                  setVolumeInputText(Math.round(newVol * 100).toString());
                }}
                className="w-6 text-center bg-transparent text-xs font-mono font-semibold text-[var(--text-main)] outline-none border-b border-transparent focus:border-[var(--accent)] hover:text-[var(--accent)] transition-colors p-0 leading-none"
                title="Громкость (0-100)"
              />
            </div>
          </div>

          {/* Equalizer button on right with Popover shutter directly above it */}
          <div className="relative shrink-0">
            <button 
              ref={eqButtonRef}
              data-eq-trigger="true"
              onClick={() => setIsEqOpen(prev => !prev)}
              className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all shadow-sm ${
                isEqOpen 
                  ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]' 
                  : 'border-white/[0.05] hover:border-white/20 text-[var(--accent)] hover:scale-105 hover:bg-white/5'
              }`}
              title="Эквалайзер"
            >
              <SlidersHorizontal size={19} strokeWidth={2} />
            </button>
            <AnimatePresence>
              {isEqOpen && (
                <EqualizerPopover triggerRef={eqButtonRef} onClose={() => setIsEqOpen(false)} />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopPlayer;
