import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Radio, DownloadCloud, Check, Trash2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Track } from '../types';

import { usePlayerStore } from '../store/usePlayerStore';
import { useCacheStore } from '../store/useCacheStore';
import { generateSimilarTracks } from '../services/SimilarTracksService';

interface TrackOptionsPopoverProps {
  track: Track;
  direction?: 'up' | 'down';
}

export const TrackOptionsPopover: React.FC<TrackOptionsPopoverProps> = ({ track, direction = 'down' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number; bottom: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  const yaToken = localStorage.getItem('yandex_access_token');
  const { playContext } = usePlayerStore();
  const { isCached: checkIsCached, isCaching: checkIsCaching, cacheTrack, removeCachedTrack } = useCacheStore();

  const isCached = checkIsCached(track.id);
  const isCaching = checkIsCaching(track.id);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top,
        bottom: rect.bottom,
        right: Math.max(8, window.innerWidth - rect.right)
      });
    }
    setIsOpen(!isOpen);
  };

  const handleCache = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await cacheTrack(track, yaToken);
    } catch (err: any) {
      console.error('Ошибка кэширования:', err);
      alert('Ошибка при кэшировании трека: ' + (err?.message || err || 'Неизвестная ошибка'));
    }
  };

  const handleRemoveCache = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeCachedTrack(track.id);
    } catch (err) {
      console.error('Ошибка удаления из кэша:', err);
    }
  };

  const handlePlaySimilar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setIsLoading(true);
      const similarTracks = await generateSimilarTracks(track);
      if (similarTracks.length > 0) {
        playContext(similarTracks, 0);
      } else {
        alert('Не удалось подобрать похожие треки');
      }
    } catch (err: any) {
      console.error('Ошибка подбора похожих треков:', err);
      alert(err?.message || 'Ошибка при подборе похожих треков');
    } finally {
      setIsLoading(false);
      setIsOpen(false);
    }
  };

  const isUp = direction === 'up' || (coords ? (window.innerHeight - coords.bottom < 180) : false);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className="p-1.5 rounded-sm text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors"
        title="Опции"
      >
        <MoreHorizontal size={16} />
      </button>

      {isOpen && coords && createPortal(
        <div 
          className="fixed inset-0 z-[999999]" 
          onPointerDown={(e) => { e.stopPropagation(); setIsOpen(false); }}
          onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
        >
          <AnimatePresence>
            <motion.div
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: isUp ? 10 : -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: isUp ? 10 : -10, scale: 0.95 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="fixed w-52 bg-[var(--bg-surface-hover)] border border-[var(--border-main)] rounded-xl shadow-2xl z-[999999] flex flex-col p-1.5 gap-0.5"
              style={{
                right: coords.right,
                ...(isUp ? { bottom: window.innerHeight - coords.top + 8 } : { top: coords.bottom + 8 })
              }}
            >
              {/* Кэширование */}
              {isCached ? (
                <button 
                  onClick={handleRemoveCache}
                  className="flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-[var(--bg-surface)] transition-colors text-emerald-400 hover:text-red-400 text-sm font-medium group/cache"
                  title="Нажмите, чтобы удалить трек из кэша"
                >
                  <Check size={16} className="group-hover/cache:hidden text-emerald-400" />
                  <Trash2 size={16} className="hidden group-hover/cache:inline text-red-400" />
                  <span className="group-hover/cache:hidden">Кэшировано</span>
                  <span className="hidden group-hover/cache:inline text-red-400">Удалить из кэша</span>
                </button>
              ) : (
                <button 
                  onClick={handleCache}
                  disabled={isCaching}
                  className="flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-[var(--bg-surface)] transition-colors text-[var(--text-main)] text-sm font-medium disabled:opacity-50"
                  title="Сохранить трек в кэш для оффлайн-воспроизведения"
                >
                  {isCaching ? (
                    <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
                  ) : (
                    <DownloadCloud size={16} className="text-[var(--accent)]" />
                  )}
                  {isCaching ? "Кэширование..." : "Кэшировать"}
                </button>
              )}

              {/* Похожие треки */}
              <button 
                onClick={handlePlaySimilar}
                disabled={isLoading}
                className="flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-[var(--bg-surface)] transition-colors text-[var(--text-main)] text-sm font-medium disabled:opacity-50"
                title="Включить подборку похожих треков"
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
                ) : (
                  <Radio size={16} className="text-[var(--accent)]" />
                )}
                <span>{isLoading ? "Подбираем..." : "Похожие треки"}</span>
              </button>
            </motion.div>
          </AnimatePresence>
        </div>,
        document.body
      )}
    </>
  );
};


