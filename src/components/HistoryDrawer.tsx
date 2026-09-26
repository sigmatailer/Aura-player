import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Clock, Play, Sparkles
} from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useThemeStore } from '../store/useThemeStore';
import { PlayingIndicator } from './PlayingIndicator';
import { Track } from '../types';

export const HistoryDrawer: React.FC = () => {
  const { 
    isHistoryDrawerOpen, 
    setHistoryDrawerOpen, 
    history, 
    playContext, 
    currentTrackIndex, 
    queue, 
    isPlaying 
  } = usePlayerStore();

  const { customWallpaper, transparencyEnabled, glassStrength, glassBlur, windowOpacity, getActiveTheme } = useThemeStore();
  const theme = getActiveTheme();

  if (!isHistoryDrawerOpen) return null;

  const currentTrack = queue[currentTrackIndex];

  // Helper to parse hex color to RGB
  const hexToRgb = (hexColor: string) => {
    let hex = (hexColor || '#141416').trim().replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16) || 20;
    const g = parseInt(hex.substring(2, 4), 16) || 20;
    const b = parseInt(hex.substring(4, 6), 16) || 24;
    return { r, g, b };
  };

  const bgRgb = hexToRgb(theme.colors.bgMain);

  const formatDuration = (timeInSeconds?: number) => {
    if (!timeInSeconds || isNaN(timeInSeconds) || timeInSeconds < 0) return '0:00';
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleTrackClick = (track: Track) => {
    // Put track at the 1st place in the queue and start playing immediately
    const currentQueue = usePlayerStore.getState().queue || [];
    const filtered = currentQueue.filter(t => t.id !== track.id && (t.filePath !== track.filePath || !track.filePath));
    playContext([track, ...filtered], 0);
  };

  return (
    <AnimatePresence>
      {isHistoryDrawerOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setHistoryDrawerOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 transition-opacity"
          />

          {/* Drawer Container (dynamically styled to match current theme background) */}
          <motion.aside
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            style={{
              backgroundColor: transparencyEnabled && customWallpaper
                ? `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${Math.max(0.35, (windowOpacity / 100) * 0.88)})`
                : (theme.colors.bgMain || 'var(--bg-main)'),
              backdropFilter: transparencyEnabled && customWallpaper && glassBlur > 0
                ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.5}%)`
                : 'blur(24px)',
              WebkitBackdropFilter: transparencyEnabled && customWallpaper && glassBlur > 0
                ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.5}%)`
                : 'blur(24px)',
              borderColor: transparencyEnabled && customWallpaper
                ? `rgba(255, 255, 255, ${0.06 + (glassStrength / 100) * 0.16})`
                : 'var(--border-main)',
              boxShadow: transparencyEnabled && customWallpaper
                ? `0 25px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,${(glassStrength / 100) * 0.20})`
                : '0 25px 60px rgba(0,0,0,0.7)'
            }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[370px] border-l shadow-2xl flex flex-col select-none overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 pb-3 flex items-center justify-between border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                  <Clock size={16} />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-white leading-tight">История</h3>
                  <p className="text-[11px] text-white/50 leading-tight mt-0.5">
                    {history.length > 0 ? `${history.length} треков` : 'Нет прослушанных треков'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <button
                    onClick={() => playContext(history, 0)}
                    className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Воспроизвести всю историю"
                  >
                    <Play size={12} fill="currentColor" />
                    <span className="text-[11px]">Включить</span>
                  </button>
                )}
                <button
                  onClick={() => setHistoryDrawerOpen(false)}
                  className="p-1.5 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Закрыть"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Track List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/40 gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/30">
                    <Clock size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white/60">История пуста</p>
                    <p className="text-xs text-white/40 mt-1">Слушайте треки, и они появятся здесь</p>
                  </div>
                </div>
              ) : (
                history.map((t, idx) => {
                  const isCurrent = currentTrack && (currentTrack.id === t.id || currentTrack.filePath === t.filePath);
                  const isThisPlaying = isCurrent && isPlaying;
                  const coverUrl = t.customCoverPath || t.originalCoverUrl;

                  return (
                    <div
                      key={`${t.id}-${idx}`}
                      onClick={() => handleTrackClick(t)}
                      className="group flex items-center justify-between p-2 rounded-[14px] hover:bg-white/[0.06] active:bg-white/[0.09] transition-all cursor-pointer relative"
                    >
                      {/* Left: Cover art + only actual playing wave indicator */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative w-11 h-11 rounded-[11px] overflow-hidden shrink-0 bg-neutral-900 border border-white/[0.08] shadow-sm">
                          {coverUrl ? (
                            <img
                              src={coverUrl}
                              alt={t.title}
                              className="w-full h-full object-cover select-none"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/30">
                              <Sparkles size={16} />
                            </div>
                          )}

                          {/* Playing State: Animated wave equalizer bars (only when playing) */}
                          {isThisPlaying && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                              <PlayingIndicator size="xs" barColor="bg-white" />
                            </div>
                          )}
                        </div>

                        {/* Title & Artist (accent color on playing and hover) */}
                        <div className="flex flex-col min-w-0">
                          <span
                            className={`text-[13.5px] font-bold leading-tight truncate transition-colors ${
                              isThisPlaying 
                                ? 'text-[var(--accent)]' 
                                : 'text-white group-hover:text-[var(--accent)]'
                            }`}
                          >
                            {t.title}
                          </span>
                          <span className="text-[11.5px] text-white/50 leading-tight truncate mt-1">
                            {t.artist || 'Неизвестный исполнитель'}
                          </span>
                        </div>
                      </div>

                      {/* Right: Duration */}
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-[12px] text-white/45 font-mono">
                          {formatDuration(t.duration)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
