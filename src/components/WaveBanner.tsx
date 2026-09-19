import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SlidersHorizontal, Sparkles, RefreshCw } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useCollectionStore } from '../store/useCollectionStore';
import { generateWaveTracks, WaveTuningOptions, PlaybackProfile } from '../services/WaveRecommendationService';
import { Track } from '../types';

interface WaveBannerProps {
  onArtistsUpdate?: (artists: Array<{ id?: string; name: string; coverUrl?: string }>) => void;
  className?: string;
}

export const WaveBanner: React.FC<WaveBannerProps> = ({ onArtistsUpdate, className = '' }) => {
  const { queue, currentTrackIndex, isPlaying, togglePlayPause, playContext, history } = usePlayerStore();
  const { likedTracks } = useCollectionStore();

  const [loading, setLoading] = useState(false);
  const [isTunerOpen, setIsTunerOpen] = useState(false);
  const [tuning, setTuning] = useState<WaveTuningOptions>({
    mood: 'all',
    character: 'discovery',
    language: 'auto'
  });
  const [activeProfile, setActiveProfile] = useState<PlaybackProfile | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const burstRef = useRef<{ active: boolean; progress: number }>({ active: false, progress: 0 });
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const currentTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null;
  const isVibeMode = queue.length > 0 && currentTrack?.id?.startsWith('vibe_');

  // Gather top 5 covers from history, liked, or queue
  const recentCovers: Track[] = (() => {
    const list: Track[] = [];
    const seen = new Set<string>();

    const addTrack = (t?: Track) => {
      if (!t || !t.id || seen.has(t.id)) return;
      seen.add(t.id);
      list.push(t);
    };

    (history || []).forEach(addTrack);
    (likedTracks || []).forEach(addTrack);
    (queue || []).forEach(addTrack);

    return list.slice(0, 5);
  })();

  // Close tuner on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsTunerOpen(false);
      }
    };
    if (isTunerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isTunerOpen]);

  // Start wave generation
  const handleLaunchWave = async (overrideTuning?: WaveTuningOptions) => {
    try {
      setLoading(true);
      // Trigger energetic wave surge animation
      burstRef.current = { active: true, progress: 0 };

      const opts = overrideTuning || tuning;
      const { tracks, profile, artists } = await generateWaveTracks(opts);
      setActiveProfile(profile);

      if (onArtistsUpdate && artists.length > 0) {
        onArtistsUpdate(artists);
      }

      if (tracks.length > 0) {
        playContext(tracks, 0);
      }
    } catch (err) {
      console.error('Failed to launch wave:', err);
    } finally {
      setLoading(false);
    }
  };

  // Wave Line Canvas Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;

    const render = () => {
      const width = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      const height = canvas.height = canvas.offsetHeight * window.devicePixelRatio;

      ctx.clearRect(0, 0, width, height);

      // Resolve theme accent color dynamically
      const style = getComputedStyle(document.documentElement);
      const rawAccent = style.getPropertyValue('--accent').trim() || '#3b82f6';

      const isWaveActive = isVibeMode && isPlaying;
      const speed = isWaveActive ? 0.045 : 0.012;
      phase += speed;

      // Handle burst ripple on click
      if (burstRef.current.active) {
        burstRef.current.progress += 0.02;
        if (burstRef.current.progress >= 1.5) {
          burstRef.current.active = false;
        }
      }

      // Draw flowing wave curve
      ctx.beginPath();
      const points = 140;
      for (let i = 0; i <= points; i++) {
        const normX = i / points;
        const x = normX * width;

        // Base curve: starts lower under covers on left, arches smoothly towards tuner on right
        const baseY = height * (0.65 - 0.22 * normX + 0.04 * Math.sin(normX * Math.PI));

        // Sine wave oscillations
        let oscillation = 0;
        if (isWaveActive) {
          oscillation = Math.sin(normX * 8 - phase) * (height * 0.14)
                      + Math.sin(normX * 15 + phase * 1.4) * (height * 0.07);
        } else {
          oscillation = Math.sin(normX * 5 - phase) * (height * 0.04);
        }

        // Surge impulse traveling across from left to right
        if (burstRef.current.active) {
          const dist = Math.abs(normX - burstRef.current.progress);
          const surgeFactor = Math.max(0, 1 - dist * 3.2);
          oscillation += Math.sin(normX * 22 - phase * 3) * (height * 0.32) * surgeFactor;
        }

        const y = baseY + oscillation;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      // Stroke styles with accent color
      if (isWaveActive) {
        ctx.lineWidth = 3.0 * window.devicePixelRatio;
        ctx.strokeStyle = rawAccent;
        ctx.shadowColor = rawAccent;
        ctx.shadowBlur = 14 * window.devicePixelRatio;
      } else {
        ctx.lineWidth = 2.0 * window.devicePixelRatio;
        ctx.strokeStyle = rawAccent;
        ctx.globalAlpha = 0.45;
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      ctx.stroke();
      ctx.globalAlpha = 1.0;

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [isVibeMode, isPlaying]);

  return (
    <div className={`relative w-full h-[76px] sm:h-[86px] flex items-center justify-between px-4 sm:px-8 rounded-3xl bg-[var(--bg-surface)]/80 backdrop-blur-xl border border-[var(--border-main)] select-none shadow-md transition-all duration-300 group ${isTunerOpen ? 'z-50' : 'z-20'} ${className}`}>
      
      {/* Background Animated Accent Wave Canvas */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full pointer-events-none rounded-3xl z-0" 
      />

      {/* Left side: Play/Pause, Title, Divider, 5 Covers */}
      <div className="relative z-10 flex items-center gap-3 sm:gap-4 shrink-0">
        
        {/* Play/Pause Button */}
        <button
          onClick={() => {
            if (isVibeMode) {
              togglePlayPause();
            } else {
              handleLaunchWave();
            }
          }}
          disabled={loading}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-white hover:scale-108 active:scale-95 transition-all cursor-pointer bg-white/10 hover:bg-white/20 shadow-lg shadow-black/20"
          title={isVibeMode && isPlaying ? "Пауза" : "Запустить Мою волну"}
        >
          {loading ? (
            <div className="w-6 h-6 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          ) : isVibeMode && isPlaying ? (
            <Pause size={24} fill="currentColor" />
          ) : (
            <Play size={24} fill="currentColor" className="ml-0.5" />
          )}
        </button>

        {/* Title */}
        <span 
          onClick={() => {
            if (!isVibeMode || !isPlaying) handleLaunchWave();
          }}
          className="font-bold text-[18px] sm:text-[22px] text-white tracking-tight cursor-pointer hover:opacity-90 transition-opacity whitespace-nowrap drop-shadow-sm"
        >
          Моя волна
        </span>

        {/* Divider */}
        {recentCovers.length > 0 && <div className="w-[1px] h-7 bg-white/20 mx-1 sm:mx-2 shrink-0" />}

        {/* Recent Track Covers - up to 2 on small screens, 5 on larger screens */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {recentCovers.map((track, idx) => {
            const cover = track.customCoverPath || track.originalCoverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
            return (
              <div
                key={track.id + '_' + idx}
                onClick={() => {
                  const idxInQueue = queue.findIndex(t => t.id === track.id);
                  if (idxInQueue !== -1) {
                    usePlayerStore.getState().playTrack(idxInQueue);
                  } else {
                    usePlayerStore.getState().playContext([track, ...queue], 0);
                  }
                }}
                className={`${idx >= 2 ? 'hidden sm:block' : ''} w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden shrink-0 border border-white/20 shadow-md relative group/cover cursor-pointer transition-transform duration-200 hover:scale-115 hover:z-20 bg-[var(--bg-surface-hover)]`}
                data-tooltip={`${track.title} • ${track.artist}`}
                data-tooltip-pos="bottom"
              >
                <img 
                  src={cover} 
                  alt={track.title} 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
                  }}
                />
              </div>
            );
          })}

          {recentCovers.length === 0 && (
            <div className="text-xs text-white/40 italic px-1 hidden sm:inline">
              Нет недавних треков
            </div>
          )}
        </div>
      </div>

      {/* Right side: Tuner Button & Popover */}
      <div className="relative z-10 flex items-center gap-2" ref={popoverRef}>
        <button
          onClick={() => setIsTunerOpen(!isTunerOpen)}
          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer ${
            isTunerOpen 
              ? 'bg-white/20 text-white shadow-md ring-1 ring-white/30' 
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
          title="Настройка Моей волны"
        >
          <SlidersHorizontal size={22} strokeWidth={2} />
        </button>

        {/* Tuner Popover Menu - Positioned with high z-index and solid opaque background */}
        {isTunerOpen && (
          <div className="absolute right-0 top-full mt-3 w-[360px] bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-2xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.9)] z-[100] flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150 text-[var(--text-main)]">
            
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-main)]">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles size={16} className="text-[var(--accent)] shrink-0" />
                <h3 className="text-sm font-bold tracking-tight text-[var(--text-main)] whitespace-nowrap">
                  Настройка волны
                </h3>
              </div>
              <span className="text-[11px] text-[var(--text-secondary)] font-medium whitespace-nowrap pl-2">
                {activeProfile 
                  ? `${activeProfile.totalAnalyzed} треков • ${activeProfile.dominantLanguage === 'russian' ? 'Русский' : activeProfile.dominantLanguage === 'foreign' ? 'Иностранный' : 'Микс'}`
                  : 'Анализ 15 треков'}
              </span>
            </div>

            {/* Language filter */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Язык треков
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'auto', label: 'Авто' },
                  { id: 'russian', label: 'Русский' },
                  { id: 'foreign', label: 'Иностранный' }
                ].map(opt => {
                  const active = tuning.language === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setTuning(prev => ({ ...prev, language: opt.id as any }))}
                      className={`h-9 px-1.5 flex items-center justify-center text-[12px] font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap text-center ${
                        active 
                          ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/25' 
                          : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mood filter */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Настроение
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'all', label: 'Любое' },
                  { id: 'energetic', label: 'Бодрое' },
                  { id: 'calm', label: 'Спокойное' }
                ].map(opt => {
                  const active = tuning.mood === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setTuning(prev => ({ ...prev, mood: opt.id as any }))}
                      className={`h-9 px-1.5 flex items-center justify-center text-[12px] font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap text-center ${
                        active 
                          ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/25' 
                          : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Character filter */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Характер
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'discovery', label: 'Незнакомое' },
                  { id: 'favorite', label: 'Любимое' },
                  { id: 'popular', label: 'Популярное' }
                ].map(opt => {
                  const active = tuning.character === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setTuning(prev => ({ ...prev, character: opt.id as any }))}
                      className={`h-9 px-1.5 flex items-center justify-center text-[12px] font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap text-center ${
                        active 
                          ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/25' 
                          : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Apply & Regenerate button */}
            <button
              onClick={() => {
                setIsTunerOpen(false);
                handleLaunchWave(tuning);
              }}
              disabled={loading}
              className="mt-1.5 w-full py-2.5 px-3 rounded-xl bg-[var(--accent)] hover:opacity-90 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[var(--accent)]/30 transition-all cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <RefreshCw size={14} />
                  <span>Обновить волну</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
