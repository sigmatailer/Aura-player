import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, DownloadCloud, Check, Trash2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Track } from '../types';
import { useCacheStore } from '../store/useCacheStore';

interface CollectionOptionsPopoverProps {
  tracks: Track[];
}

export const CollectionOptionsPopover: React.FC<CollectionOptionsPopoverProps> = ({ tracks }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const yaToken = localStorage.getItem('yandex_access_token');
  const { cachedTracks, cacheTrack, removeCachedTrack } = useCacheStore();

  const uncachedTracks = tracks.filter(t => !cachedTracks[t.id]);
  const cachedCount = tracks.filter(t => !!cachedTracks[t.id]).length;
  const isAllCached = tracks.length > 0 && uncachedTracks.length === 0;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleCacheAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (uncachedTracks.length === 0) return;

    setProgress({ current: 0, total: uncachedTracks.length });
    let count = 0;

    for (const track of uncachedTracks) {
      try {
        await cacheTrack(track, yaToken);
      } catch (err) {
        console.error('Ошибка кэширования трека', track.title, err);
      }
      count++;
      setProgress({ current: count, total: uncachedTracks.length });
    }

    setTimeout(() => {
      setProgress(null);
    }, 800);
  };

  const handleRemoveAllCache = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Удалить из кэша ${cachedCount} трек(ов)?`)) return;

    for (const track of tracks) {
      if (cachedTracks[track.id]) {
        try {
          await removeCachedTrack(track.id);
        } catch (err) {
          console.error('Ошибка удаления трека из кэша', track.title, err);
        }
      }
    }
    setIsOpen(false);
  };

  return (
    <div className="relative inline-flex items-center" ref={popoverRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-2 bg-[var(--bg-surface-hover)] hover:bg-[var(--border-main)] text-[var(--text-main)] rounded-full transition-colors flex items-center justify-center shadow-sm"
        title="Действия с коллекцией"
      >
        <MoreHorizontal size={20} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 top-full mt-2 w-56 bg-[var(--bg-surface-hover)] border border-[var(--border-main)] rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden"
            style={{ pointerEvents: 'auto' }}
          >
            <div className="p-1.5 flex flex-col gap-0.5">
              {progress !== null ? (
                <div className="flex items-center gap-3 w-full p-2.5 rounded-lg text-sm font-medium text-[var(--text-main)] bg-[var(--bg-surface)]">
                  <Loader2 size={16} className="animate-spin text-[var(--accent)] shrink-0" />
                  <span className="truncate">Кэширование ({progress.current}/{progress.total})...</span>
                </div>
              ) : isAllCached ? (
                <div className="flex items-center gap-3 w-full p-2.5 rounded-lg text-sm font-medium text-emerald-400 bg-[var(--bg-surface)]">
                  <Check size={16} className="text-emerald-400 shrink-0" />
                  <span className="truncate">Все треки закэшированы</span>
                </div>
              ) : (
                <button
                  onClick={handleCacheAll}
                  disabled={tracks.length === 0}
                  className="flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-[var(--bg-surface)] transition-colors text-[var(--text-main)] text-sm font-medium disabled:opacity-40 text-left"
                  title="Сохранить все треки в кэш для оффлайн-воспроизведения"
                >
                  <DownloadCloud size={16} className="text-[var(--accent)] shrink-0" />
                  <span className="truncate">Кэшировать все</span>
                </button>
              )}

              {cachedCount > 0 && progress === null && (
                <button
                  onClick={handleRemoveAllCache}
                  className="flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors text-sm font-medium text-left"
                  title="Удалить кэш для всех треков в этом списке"
                >
                  <Trash2 size={16} className="shrink-0" />
                  <span className="truncate">Удалить из кэша ({cachedCount})</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
