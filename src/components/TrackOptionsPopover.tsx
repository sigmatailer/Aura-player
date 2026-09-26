import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, DownloadCloud, Check, Trash2, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Track } from '../types';

import { usePlayerStore } from '../store/usePlayerStore';
import { useCacheStore } from '../store/useCacheStore';
import { getSimilarTracksOnly } from '../services/SimilarTracksService';

interface TrackOptionsPopoverProps {
  track: Track;
  direction?: 'up' | 'down';
  icon?: React.ReactNode;
  className?: string;
}

export const TrackOptionsPopover: React.FC<TrackOptionsPopoverProps> = ({ track, direction = 'down', icon, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverContentRef = useRef<HTMLDivElement>(null);
  
  const yaToken = localStorage.getItem('yandex_access_token');
  const { playContext } = usePlayerStore();
  const { isCached: checkIsCached, isCaching: checkIsCaching, cacheTrack, removeCachedTrack } = useCacheStore();

  const isCached = checkIsCached(track.id);
  const isCaching = checkIsCaching(track.id);

  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 240;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Determine vertical direction: prefer requested direction unless boundary limits space
    let openUp = direction === 'up';
    if (openUp && rect.top < 210 && (viewportHeight - rect.bottom) > rect.top) {
      openUp = false;
    } else if (!openUp && (viewportHeight - rect.bottom) < 210 && rect.top > (viewportHeight - rect.bottom)) {
      openUp = true;
    }

    const style: React.CSSProperties = {
      position: 'fixed',
      zIndex: 999999,
    };

    if (openUp) {
      style.bottom = `${viewportHeight - rect.top + 6}px`;
    } else {
      style.top = `${rect.bottom + 6}px`;
    }

    // Horizontal placement: align right edge with button's right edge, clamped within viewport
    const rightOffset = viewportWidth - rect.right;
    if (rightOffset < 12) {
      style.right = '12px';
    } else if (rect.right - menuWidth < 12) {
      style.left = '12px';
    } else {
      style.right = `${rightOffset}px`;
    }

    setMenuStyle(style);
  }, [direction]);

  useEffect(() => {
    if (!isOpen) return;

    calculatePosition();

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverContentRef.current && 
        !popoverContentRef.current.contains(target) &&
        buttonRef.current && 
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleScroll = (e: Event) => {
      if (popoverContentRef.current && popoverContentRef.current.contains(e.target as Node)) {
        return;
      }
      setIsOpen(false);
    };

    const handleResize = () => setIsOpen(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, calculatePosition]);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStatusMessage(null);
    if (!isOpen) {
      calculatePosition();
    }
    setIsOpen(!isOpen);
  };

  const handleCache = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await cacheTrack(track, yaToken);
      setStatusMessage('Трек закэширован');
      setTimeout(() => setStatusMessage(null), 2500);
    } catch (err: any) {
      console.error('Ошибка кэширования:', err);
      alert('Ошибка при кэшировании трека: ' + (err?.message || err || 'Неизвестная ошибка'));
    }
  };

  const handleRemoveCache = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeCachedTrack(track.id);
      setStatusMessage('Удалено из кэша');
      setTimeout(() => setStatusMessage(null), 2500);
    } catch (err) {
      console.error('Ошибка удаления из кэша:', err);
    }
  };

  const handlePlaySimilar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setIsLoadingSimilar(true);
      setStatusMessage('Анализ трека и жанра...');
      const similarTracks = await getSimilarTracksOnly(track, 20);
      if (similarTracks.length > 0) {
        const filtered = similarTracks.filter(t => t.id !== track.id);
        const newQueue = [track, ...filtered];
        playContext(newQueue, 0);
        setStatusMessage('Очередь похожих запущена!');
        setTimeout(() => {
          setStatusMessage(null);
          setIsOpen(false);
        }, 1200);
      } else {
        setStatusMessage('Похожие не найдены');
      }
    } catch (err: any) {
      console.error('Ошибка подбора похожих:', err);
      setStatusMessage('Ошибка подбора');
    } finally {
      setIsLoadingSimilar(false);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className={className || "p-1.5 rounded-lg text-[#777] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"}
        title="Опции трека"
      >
        {icon || <MoreHorizontal size={16} />}
      </button>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={popoverContentRef}
              data-no-tooltip="true"
              initial={{ opacity: 0, y: menuStyle.bottom ? 6 : -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: menuStyle.bottom ? 6 : -6, scale: 0.96 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={menuStyle}
              className="w-60 bg-[var(--bg-surface-hover)] border border-[var(--border-main)] rounded-2xl shadow-2xl flex flex-col p-1.5 backdrop-blur-2xl select-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Status notification banner if active */}
              {statusMessage && (
                <div className="px-3 py-1.5 mb-1 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] text-xs font-semibold text-center truncate">
                  {statusMessage}
                </div>
              )}

              <div className="flex flex-col gap-0.5">
                {/* 1. Кэширование конкретного трека */}
                {isCached ? (
                  <button 
                    onClick={handleRemoveCache}
                    className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-[var(--bg-surface)] transition-colors text-emerald-400 hover:text-red-400 text-[13px] font-medium group/cache cursor-pointer"
                  >
                    <Check size={16} className="group-hover/cache:hidden text-emerald-400 shrink-0" />
                    <Trash2 size={16} className="hidden group-hover/cache:inline text-red-400 shrink-0" />
                    <span className="group-hover/cache:hidden truncate">Кэшировано</span>
                    <span className="hidden group-hover/cache:inline text-red-400 truncate">Удалить из кэша</span>
                  </button>
                ) : (
                  <button 
                    onClick={handleCache}
                    disabled={isCaching}
                    className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-[var(--bg-surface)] transition-colors text-[var(--text-main)] text-[13px] font-medium disabled:opacity-50 cursor-pointer"
                  >
                    {isCaching ? (
                      <Loader2 size={16} className="animate-spin text-[var(--accent)] shrink-0" />
                    ) : (
                      <DownloadCloud size={16} className="text-[var(--accent)] shrink-0" />
                    )}
                    <span className="truncate">{isCaching ? "Кэширование..." : "Кэшировать трек"}</span>
                  </button>
                )}

                {/* 2. Похожие треки: полностью меняют очередь и запускают с выбранного трека */}
                <button 
                  onClick={handlePlaySimilar}
                  disabled={isLoadingSimilar}
                  className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-[var(--bg-surface)] transition-colors text-[var(--text-main)] text-[13px] font-medium disabled:opacity-50 cursor-pointer"
                >
                  {isLoadingSimilar ? (
                    <Loader2 size={16} className="animate-spin text-[var(--accent)] shrink-0" />
                  ) : (
                    <Sparkles size={16} className="text-[var(--accent)] shrink-0" />
                  )}
                  <span className="truncate">{isLoadingSimilar ? "Анализируем..." : "Похожие"}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
