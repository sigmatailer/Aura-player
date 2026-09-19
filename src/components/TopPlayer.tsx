import React, { useState, useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useCollectionStore } from '../store/useCollectionStore';
import { useThemeStore, isVideoUrl } from '../store/useThemeStore';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Shuffle, Maximize2, SlidersHorizontal, Image as ImageIcon, Heart, AlignLeft } from 'lucide-react';
import { ArtistLinks } from './ArtistLinks';

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

  const currentTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null;
  const coverUrl = customCover || currentTrack?.customCoverPath || currentTrack?.originalCoverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';

  useEffect(() => {
    if (coverVideoRef.current) {
      coverVideoRef.current.playbackRate = coverSpeed;
    }
  }, [coverSpeed, coverUrl]);

  const [volInput, setVolInput] = useState(Math.round(volume * 100).toString());
  const [scrubbingProgress, setScrubbingProgress] = useState<number | null>(null);
  const [isOverlayVisible, setIsOverlayVisible] = useState(false);
  const [lastNonZeroVol, setLastNonZeroVol] = useState(volume > 0 ? volume : 0.8);
  const overlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };
  }, []);

  const handleCoverClick = () => {
    setIsOverlayVisible(prev => {
      const next = !prev;
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      if (next) {
        overlayTimerRef.current = setTimeout(() => {
          setIsOverlayVisible(false);
        }, 5000);
      }
      return next;
    });
  };

  const resetOverlayTimer = () => {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = setTimeout(() => {
      setIsOverlayVisible(false);
    }, 5000);
  };

  const toggleMute = () => {
    if (volume > 0) {
      setLastNonZeroVol(volume);
      setVolume(0);
    } else {
      setVolume(lastNonZeroVol || 0.8);
    }
  };

  useEffect(() => {
    if (document.activeElement?.id !== 'vol-input') {
      setVolInput(Math.round(volume * 100).toString());
    }
  }, [volume]);

  const handleVolInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (val.length > 3) return; // Max 100
    setVolInput(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      setVolume(num / 100);
    }
  };

  const activeProgress = scrubbingProgress !== null ? scrubbingProgress : (progress || 0);

  return (
    <div className="w-full flex flex-col md:flex-row items-center gap-4 sm:gap-6 lg:gap-10 mt-0 bg-transparent">
      {/* Cover Art */}
      <div 
        onClick={handleCoverClick}
        className="w-[88vw] max-w-[340px] xs:max-w-[370px] aspect-square md:w-[340px] md:h-[340px] lg:w-[400px] lg:h-[400px] shrink-0 rounded-[24px] md:rounded-[28px] overflow-hidden bg-[var(--bg-surface-hover)] shadow-2xl shadow-black/80 ring-1 ring-white/10 relative group transition-all duration-300 cursor-pointer select-none"
      >
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
              <img src={coverUrl} alt="Cover" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            )}
            
            {/* Interactive Overlay: Shows on click and auto-hides after 5 seconds; hover on desktop */}
            <div 
              className={`absolute inset-0 bg-black/25 backdrop-blur-[1px] transition-all duration-300 flex flex-col justify-between p-3 ${
                isOverlayVisible 
                  ? 'opacity-100 pointer-events-auto' 
                  : 'opacity-0 pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto'
              }`}
            >
              {/* Top Row: Fullscreen Button */}
              <div className="flex justify-end">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    usePlayerStore.getState().toggleFullscreen();
                  }}
                  className="p-2 sm:p-2.5 rounded-full bg-black/60 backdrop-blur-md hover:bg-black/80 text-white hover:scale-110 active:scale-95 transition-all shadow-lg cursor-pointer"
                  title="На весь экран"
                >
                  <Maximize2 size={16} className="drop-shadow-md" />
                </button>
              </div>

              {/* Bottom Row: Like & Lyrics Button (Left) */}
              <div className="flex items-center gap-2">
                {currentTrack && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLike(currentTrack);
                      resetOverlayTimer();
                    }}
                    className="p-2 sm:p-2.5 rounded-full bg-black/60 backdrop-blur-md hover:bg-black/80 text-white hover:scale-110 active:scale-95 transition-all shadow-lg cursor-pointer"
                    title={isLiked(currentTrack.id) ? "Удалить из любимых" : "В любимые"}
                  >
                    <Heart size={18} fill={isLiked(currentTrack.id) ? "var(--accent)" : "none"} color={isLiked(currentTrack.id) ? "var(--accent)" : "white"} />
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('open-fullscreen-lyrics'));
                  }}
                  className="p-2 sm:p-2.5 rounded-full bg-black/60 backdrop-blur-md hover:bg-black/80 text-white hover:scale-110 active:scale-95 transition-all shadow-lg cursor-pointer flex items-center justify-center"
                  title="Текст песни"
                >
                  <AlignLeft size={18} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 h-full flex items-center justify-center text-[var(--text-secondary)] flex-col gap-3">
            <ImageIcon size={40} className="opacity-25" />
            <div className="text-center">
              <p className="text-xs font-medium">Очередь пуста</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-1 w-full flex flex-col justify-center min-w-0 pr-0 md:pr-4 lg:pr-6">
        {/* Title and Artist */}
        <div className="flex flex-col gap-0.5 mb-2 sm:mb-4 lg:mb-5 text-center">
          <h1 className="text-[var(--text-main)] text-base sm:text-xl md:text-2xl lg:text-3xl font-bold truncate tracking-tight px-2 pb-0.5 leading-snug transition-all duration-300 drop-shadow-md track-title">
            {currentTrack ? currentTrack.title : 'Не воспроизводится'}
          </h1>
          <div className="text-[var(--text-secondary)] text-xs sm:text-sm md:text-base font-medium truncate transition-all duration-300 drop-shadow-sm flex items-center justify-center">
            {currentTrack ? (
              <ArtistLinks artist={currentTrack.artist} viewMode="modal" />
            ) : null}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full flex flex-col gap-1 sm:gap-1.5 mb-2.5 sm:mb-4 lg:mb-5">
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-[var(--text-secondary)] font-medium px-1">
            <span>
              {Math.floor((activeProgress || 0) / 60)}:{Math.floor((activeProgress || 0) % 60).toString().padStart(2, '0')}
            </span>
            <span>
              {currentTrack ? `${Math.floor(Math.round(currentTrack.duration) / 60)}:${(Math.round(currentTrack.duration) % 60).toString().padStart(2, '0')}` : '0:00'}
            </span>
          </div>
          <input 
            type="range"
            min="0"
            max={currentTrack?.duration || 100}
            step="1"
            value={activeProgress || 0}
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
            className="w-full h-[4px] lg:h-[5px] bg-[var(--bg-surface-hover)] rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 lg:[&::-webkit-slider-thumb]:w-4 lg:[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-125 transition-transform"
            style={{
              background: `linear-gradient(to right, white ${((activeProgress || 0) / (currentTrack?.duration || 100)) * 100}%, #2a2a2a ${((activeProgress || 0) / (currentTrack?.duration || 100)) * 100}%)`
            }}
          />
        </div>

        {/* Playback Controls Row */}
        <div className="w-full flex items-center justify-center mb-2.5 sm:mb-4 lg:mb-5">
          <div className="flex items-center justify-center gap-5 sm:gap-7 lg:gap-8">
            <button 
              onClick={toggleRepeat}
              className={`p-1.5 transition-colors relative cursor-pointer ${repeatMode !== 'off' ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'}`}
              title="Режим повтора"
            >
              <Repeat size={18} strokeWidth={2} />
              {repeatMode === 'one' && (
                <span className="absolute -top-1 -right-1 text-[9px] font-bold bg-[var(--accent)] text-white w-3.5 h-3.5 rounded-full flex items-center justify-center">1</span>
              )}
            </button>
            <button 
              onClick={prevTrack}
              className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-main)] active:scale-95 transition-all cursor-pointer"
              title="Предыдущий трек"
            >
              <SkipBack size={22} strokeWidth={1.75} />
            </button>
            
            <button 
              onClick={togglePlayPause}
              className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-[var(--text-main)] text-[var(--bg-main)] hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-black/40 cursor-pointer shrink-0"
              title={isPlaying ? "Пауза" : "Воспроизведение"}
            >
              {isPlaying ? (
                <Pause size={24} strokeWidth={2.5} />
              ) : (
                <Play size={24} strokeWidth={2.5} className="ml-0.5" />
              )}
            </button>
            
            <button 
              onClick={() => nextTrack(false)}
              className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-main)] active:scale-95 transition-all cursor-pointer"
              title="Следующий трек"
            >
              <SkipForward size={22} strokeWidth={1.75} />
            </button>
            <button 
              onClick={toggleShuffle}
              className={`p-1.5 transition-colors cursor-pointer ${isShuffle ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'}`}
              title="Случайный порядок"
            >
              <Shuffle size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Volume Mixer & Equalizer */}
        <div className="flex items-center gap-2.5 sm:gap-3 w-full max-w-sm sm:max-w-md mx-auto md:mx-0 mt-0.5 md:mt-2">
          {/* Volume Control */}
          <div className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-full flex items-center px-3 sm:px-3.5 py-1.5 sm:py-2 gap-2 sm:gap-2.5 shadow-sm transition-all duration-300">
            <button
              onClick={toggleMute}
              className="text-[var(--text-secondary)] hover:text-[var(--text-main)] active:scale-90 transition-transform shrink-0 cursor-pointer p-0.5"
              title={volume === 0 ? "Включить звук" : "Выключить звук"}
            >
              {volume === 0 ? (
                <VolumeX size={17} strokeWidth={1.75} className="text-red-400" />
              ) : (
                <Volume2 size={17} strokeWidth={1.75} />
              )}
            </button>
            <input 
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="flex-1 h-[5px] bg-[var(--bg-surface-hover)] rounded-full appearance-none outline-none cursor-pointer touch-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4.5 [&::-webkit-slider-thumb]:h-4.5 md:[&::-webkit-slider-thumb]:w-3.5 md:[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-125 transition-transform"
              style={{
                background: `linear-gradient(to right, white ${volume * 100}%, #2a2a2a ${volume * 100}%)`
              }}
            />
            <input 
              id="vol-input"
              type="text"
              value={volInput}
              onChange={handleVolInputChange}
              onBlur={() => setVolInput(Math.round(volume * 100).toString())}
              className="w-8 h-6 rounded-md bg-transparent border-0 flex items-center justify-center text-[11px] text-[var(--text-secondary)] font-bold shrink-0 text-center outline-none focus:text-[var(--text-main)] transition-colors"
            />
          </div>

          {/* Equalizer Button */}
          <button
            onClick={() => document.dispatchEvent(new CustomEvent('toggle-eq'))}
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center shrink-0 rounded-full border border-[var(--border-main)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] active:scale-95 transition-all shadow-sm cursor-pointer"
            data-tooltip="Эквалайзер"
            data-tooltip-pos="bottom"
            title="Эквалайзер"
          >
            <SlidersHorizontal size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TopPlayer;
