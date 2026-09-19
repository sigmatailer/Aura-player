import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCollectionStore } from '../store/useCollectionStore';
import { Plus, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Track } from '../types';

interface PlaylistPopoverProps {
  track: Track;
  icon?: React.ReactNode;
  direction?: 'up' | 'down';
}

export const PlaylistPopover: React.FC<PlaylistPopoverProps> = ({ track, icon, direction = 'down' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number; bottom: number } | null>(null);
  const { playlists, addTrackToPlaylist } = useCollectionStore();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleAdd = (e: React.MouseEvent) => {
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

  const isUp = direction === 'up' || (coords ? (window.innerHeight - coords.bottom < 200) : false);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleAdd}
        className="p-1.5 rounded-sm text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors"
        title="Добавить в плейлист"
      >
        {icon || <Plus size={16} />}
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
              className="fixed w-64 bg-[var(--bg-surface-hover)] border border-[var(--border-main)] rounded-xl shadow-2xl z-[999999] flex flex-col"
              style={{
                right: coords.right,
                ...(isUp ? { bottom: window.innerHeight - coords.top + 8 } : { top: coords.bottom + 8 })
              }}
            >
              <div className="p-3 text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.1em] border-b border-[var(--border-main)]">
                Добавить в плейлист
              </div>
              <div 
                className="max-h-[160px] overflow-y-auto scrollbar-hide py-1 overscroll-contain"
                onWheel={(e) => e.stopPropagation()}
              >
                {playlists.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[var(--text-secondary)]">Нет плейлистов</div>
                ) : (
                  playlists.map(pl => (
                    <div
                      key={pl.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        addTrackToPlaylist(pl.id, track);
                        setIsOpen(false);
                      }}
                      className="flex items-center gap-3 p-2 mx-1 rounded-lg hover:bg-[var(--bg-surface-hover)] cursor-pointer transition-colors"
                    >
                      <div className="w-10 h-10 rounded-md bg-[var(--bg-surface-hover)] shrink-0 overflow-hidden border border-[var(--border-main)] flex items-center justify-center">
                        {pl.coverUrl ? (
                          <img src={pl.coverUrl} className="w-full h-full object-cover" />
                        ) : (
                          <Play size={14} className="text-[var(--text-secondary)]" />
                        )}
                      </div>
                      <div className="flex flex-col truncate">
                        <span className="text-[var(--text-main)] text-sm font-medium truncate">{pl.name}</span>
                        <span className="text-[var(--text-secondary)] text-xs">{pl.tracks.length} треков</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>,
        document.body
      )}
    </>
  );
};
