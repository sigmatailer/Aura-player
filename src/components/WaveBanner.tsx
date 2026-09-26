import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SlidersHorizontal } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useCollectionStore } from '../store/useCollectionStore';
import { useThemeStore } from '../store/useThemeStore';
import { generateWaveTracks, WaveTuningOptions } from '../services/WaveRecommendationService';
import { Track } from '../types';

interface WaveBannerProps {
  onArtistsUpdate?: (artists: Array<{ id?: string; name: string; coverUrl?: string }>) => void;
  className?: string;
}

interface MoodItem {
  id: string;
  label: string;
  tuningMood: WaveTuningOptions['mood'];
}

const MOOD_OPTIONS: MoodItem[] = [
  { id: 'all', label: 'Обычная', tuningMood: 'all' },
  { id: 'energetic', label: 'Энергия', tuningMood: 'energetic' },
  { id: 'calm', label: 'Чилл', tuningMood: 'calm' },
  { id: 'happy', label: 'Весёлая', tuningMood: 'happy' },
  { id: 'sad', label: 'Грустная', tuningMood: 'sad' },
];

export const WaveBanner: React.FC<WaveBannerProps> = ({ onArtistsUpdate, className = '' }) => {
  const { queue, currentTrackIndex, isPlaying, togglePlayPause, playContext, history } = usePlayerStore();
  const { likedTracks } = useCollectionStore();
  const { getActiveTheme, transparencyEnabled, windowOpacity, glassBlur, glassStrength } = useThemeStore();
  const activeTheme = getActiveTheme();
  const accent = activeTheme?.colors?.accent || '#ff5500';

  const [loading, setLoading] = useState(false);
  const [selectedMoodId, setSelectedMoodId] = useState<string>('all');

  const currentTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null;
  const isVibeMode = queue.length > 0 && currentTrack?.id?.startsWith('vibe_');

  // Preview tracks (upcoming in wave or from recent/liked)
  const previewTracks: Track[] = (() => {
    if (isVibeMode && queue.length > currentTrackIndex + 1) {
      return queue.slice(currentTrackIndex + 1, currentTrackIndex + 4);
    }
    const pool = [...(likedTracks || []), ...(history || [])];
    const unique: Track[] = [];
    const seen = new Set<string>();
    for (const t of pool) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        unique.push(t);
        if (unique.length >= 3) break;
      }
    }
    return unique;
  })();

  // Start wave generation
  const handleLaunchWave = async (moodId?: string) => {
    try {
      setLoading(true);
      const targetMoodId = moodId || selectedMoodId;
      const moodObj = MOOD_OPTIONS.find(m => m.id === targetMoodId) || MOOD_OPTIONS[0];
      const opts: WaveTuningOptions = {
        mood: moodObj.tuningMood,
        character: 'discovery',
        language: 'auto'
      };
      const { tracks, artists } = await generateWaveTracks(opts);

      if (artists && artists.length > 0 && onArtistsUpdate) {
        onArtistsUpdate(artists);
      }

      if (tracks.length > 0) {
        playContext(tracks, 0);
      }
    } catch (err) {
      console.error('Failed to launch Wave:', err);
    } finally {
      setLoading(false);
    }
  };

  // Cycle through moods
  const cycleMood = (direction: number = 1) => {
    const currentIdx = MOOD_OPTIONS.findIndex(m => m.id === selectedMoodId);
    const nextIdx = (currentIdx + direction + MOOD_OPTIONS.length) % MOOD_OPTIONS.length;
    const newMood = MOOD_OPTIONS[nextIdx];
    setSelectedMoodId(newMood.id);
    handleLaunchWave(newMood.id);
  };

  const currentMoodObj = MOOD_OPTIONS.find(m => m.id === selectedMoodId) || MOOD_OPTIONS[0];

  return (
    <div 
      className={`relative w-full h-[340px] sm:h-[370px] rounded-[28px] overflow-hidden select-none border transition-all duration-500 ${className}`}
      style={{
        background: transparencyEnabled 
          ? `linear-gradient(180deg, ${accent}33 0%, rgba(14, 14, 19, ${Math.max(0.12, (windowOpacity / 100) * 0.45)}) 45%, rgba(8, 8, 10, ${Math.max(0.18, (windowOpacity / 100) * 0.65)}) 100%)`
          : `linear-gradient(180deg, ${accent}26 0%, #0e0e13 45%, #08080a 100%)`,
        backdropFilter: transparencyEnabled && glassBlur > 0 ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.2}%)` : undefined,
        WebkitBackdropFilter: transparencyEnabled && glassBlur > 0 ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.2}%)` : undefined,
        borderColor: transparencyEnabled 
          ? `rgba(255, 255, 255, ${0.08 + (glassStrength / 100) * 0.14})` 
          : 'rgba(255, 255, 255, 0.08)',
        boxShadow: transparencyEnabled 
          ? `0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,${(glassStrength / 100) * 0.15})` 
          : '0 20px 50px rgba(0,0,0,0.4)'
      }}
    >
      {/* Specular sheen when transparency is active */}
      {transparencyEnabled && (
        <div 
          className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/[0.04] via-transparent to-white/[0.07] z-10" 
          style={{ opacity: Math.max(0.1, glassStrength / 100) }}
        />
      )}
      
      {/* 1. Dotify Radial Ambient Bloom Glow */}
      <div 
        className="absolute inset-0 pointer-events-none transition-all duration-700"
        style={{
          background: `radial-gradient(ellipse 75% 60% at 50% 25%, ${accent}55 0%, ${accent}18 50%, transparent 80%)`
        }}
      />

      {/* 2. Abstract Dotify Wave Squiggle on the right */}
      <div className="absolute right-4 md:right-10 top-0 bottom-0 w-[280px] sm:w-[340px] pointer-events-none z-10 overflow-visible">
        <svg 
          viewBox="0 0 340 449" 
          preserveAspectRatio="none" 
          className="w-full h-full overflow-visible pointer-events-none"
        >
          <defs>
            <linearGradient id="dotify-wave-grad" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.85" />
              <stop offset="35%" stopColor={accent} stopOpacity="0.45" />
              <stop offset="70%" stopColor="#ffffff" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <motion.path
            d="M 334.447 52 C 270 54, 150 96, 55 162 L 305.418 120.361 L 5.44727 302.361 L 319.947 218.861 C 319.947 218.861, 52.9473 293.361, 133.947 449.0"
            fill="none"
            stroke="url(#dotify-wave-grad)"
            strokeWidth="18"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
      </div>

      {/* 3. Left Section: Giant Typography + Mood Switcher Pill */}
      <div className="absolute left-6 sm:left-10 md:left-12 top-10 sm:top-12 flex flex-col items-start gap-4 z-20">
        <div className="text-[52px] sm:text-[64px] md:text-[72px] font-black leading-[0.88] tracking-[-2px] text-white drop-shadow-md select-none">
          Моя<br />волна
        </div>

        {/* Mood switcher capsule */}
        <button
          onClick={() => cycleMood(1)}
          onContextMenu={(e) => {
            e.preventDefault();
            cycleMood(-1);
          }}
          className="flex items-center gap-2 h-[32px] px-3.5 rounded-full bg-white/10 hover:bg-white/18 active:scale-95 border border-white/15 backdrop-blur-md transition-all cursor-pointer shadow-sm group"
          title="Нажмите, чтобы переключить настроение (ПКМ - назад)"
        >
          <SlidersHorizontal size={13} className="text-white/80 group-hover:text-white transition-colors" />
          <AnimatePresence mode="wait">
            <motion.span 
              key={currentMoodObj.id}
              initial={{ opacity: 0, y: 3, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -3, scale: 0.95 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="text-[13px] font-semibold text-white/90 group-hover:text-white tracking-tight"
            >
              {currentMoodObj.label}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>

      {/* 4. Right Section: Floating Upcoming Covers + Big Circular Play Button */}
      <div className="absolute right-6 sm:right-10 bottom-6 sm:bottom-8 flex items-end gap-5 z-20 pointer-events-auto">
        
        {/* Floating preview covers */}
        <div className="hidden sm:flex items-center gap-3">
          {previewTracks.map((track, idx) => {
            const cover = track.customCoverPath || track.originalCoverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
            return (
              <motion.div
                key={track.id + '_' + idx}
                whileHover={{ scale: 1.08, y: -4 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  const idxInQueue = queue.findIndex(t => t.id === track.id);
                  if (idxInQueue !== -1) {
                    usePlayerStore.getState().playTrack(idxInQueue);
                  } else {
                    usePlayerStore.getState().playContext([track, ...queue], 0);
                  }
                }}
                className="w-[72px] h-[72px] md:w-[80px] md:h-[80px] rounded-[20px] overflow-hidden border border-white/20 shadow-xl bg-black/40 cursor-pointer transition-shadow hover:shadow-2xl hover:border-white/40"
                title={`${track.title} • ${track.artist}`}
              >
                <img 
                  src={cover} 
                  alt={track.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
                  }}
                />
              </motion.div>
            );
          })}
        </div>

        {/* Big White Circular Play Button (Dotify Me button) */}
        <motion.button
          onClick={() => {
            if (isVibeMode) {
              togglePlayPause();
            } else {
              handleLaunchWave();
            }
          }}
          disabled={loading}
          whileHover={{ scale: 1.06, boxShadow: `0 16px 44px ${accent}77` }}
          whileTap={{ scale: 0.93 }}
          style={{
            boxShadow: isVibeMode && isPlaying ? `0 12px 36px ${accent}66` : '0 12px 36px rgba(0,0,0,0.5)'
          }}
          className="w-[80px] h-[80px] sm:w-[86px] sm:h-[86px] rounded-full bg-white text-black flex items-center justify-center cursor-pointer transition-all shrink-0"
          title={isVibeMode && isPlaying ? "Пауза" : "Запустить Мою волну"}
        >
          {loading ? (
            <div className="w-7 h-7 border-3 border-black border-t-transparent rounded-full animate-spin" />
          ) : isVibeMode && isPlaying ? (
            <Pause size={34} fill="currentColor" className="text-black" />
          ) : (
            <Play size={34} fill="currentColor" className="ml-1 text-black" />
          )}
        </motion.button>
      </div>
    </div>
  );
};
