import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useCollectionStore } from '../store/useCollectionStore';
import { useModalStore } from '../store/useModalStore';
import { PlusCircle, Play, Check, FolderPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Track } from '../types';

interface PlaylistPopoverProps {
  track: Track;
  icon?: React.ReactNode;
  direction?: 'up' | 'down';
  className?: string;
}

export const PlaylistPopover: React.FC<PlaylistPopoverProps> = ({ 
  track, 
  icon, 
  direction = 'down',
  className 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverContentRef = useRef<HTMLDivElement>(null);

  const { playlists, addTrackToPlaylist, createPlaylist } = useCollectionStore();
  const { openCreatePlaylist } = useModalStore();

  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 270;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let openUp = direction === 'up';
    if (openUp && rect.top < 230 && (viewportHeight - rect.bottom) > rect.top) {
      openUp = false;
    } else if (!openUp && (viewportHeight - rect.bottom) < 230 && rect.top > (viewportHeight - rect.bottom)) {
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

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      calculatePosition();
    }
    setIsOpen(!isOpen);
  };

  const handleSelectPlaylist = (e: React.MouseEvent, playlistId: string) => {
    e.stopPropagation();
    addTrackToPlaylist(playlistId, track);
    setAddedId(playlistId);
    setTimeout(() => {
      setIsOpen(false);
      setAddedId(null);
    }, 450);
  };

  const handleCreateNew = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    openCreatePlaylist('Новый плейлист', '', (name) => {
      createPlaylist(name, [track]);
    });
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={className || "p-1.5 rounded-lg text-[#777] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"}
        title="Добавить в плейлист"
      >
        {icon || <PlusCircle size={16} strokeWidth={1.7} />}
      </button>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={popoverContentRef}
              initial={{ opacity: 0, y: menuStyle.bottom ? 6 : -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: menuStyle.bottom ? 6 : -6, scale: 0.96 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={menuStyle}
              className="w-68 bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-2xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl select-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-3.5 py-2.5 text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.1em] border-b border-[var(--border-main)] flex items-center justify-between">
                <span>Добавить в плейлист</span>
              </div>

              {/* Playlists List */}
              <div 
                className="max-h-[190px] overflow-y-auto scrollbar-hide p-1.5 space-y-0.5 overscroll-contain"
                onWheel={(e) => e.stopPropagation()}
              >
                {playlists.length === 0 ? (
                  <div className="py-4 text-center text-xs text-[var(--text-secondary)]">
                    У вас пока нет плейлистов
                  </div>
                ) : (
                  playlists.map(pl => {
                    const isTrackInPlaylist = pl.tracks.some(t => t.id === track.id);
                    const isJustAdded = addedId === pl.id;

                    return (
                      <div
                        key={pl.id}
                        onClick={(e) => handleSelectPlaylist(e, pl.id)}
                        className={`flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--bg-surface-hover)] cursor-pointer transition-all ${
                          isJustAdded ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/40' : ''
                        }`}
                      >
                        <div className="w-9 h-9 rounded-lg bg-[var(--bg-surface-hover)] shrink-0 overflow-hidden border border-[var(--border-main)] flex items-center justify-center">
                          {pl.coverUrl ? (
                            <img src={pl.coverUrl} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <Play size={12} className="text-[var(--text-secondary)] ml-0.5" />
                          )}
                        </div>

                        <div className="flex flex-col truncate flex-1 min-w-0">
                          <span className="text-[var(--text-main)] text-[13px] font-medium truncate">
                            {pl.name}
                          </span>
                          <span className="text-[var(--text-secondary)] text-[11px]">
                            {pl.tracks.length} треков
                          </span>
                        </div>

                        {isJustAdded || isTrackInPlaylist ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                            <Check size={13} strokeWidth={2.5} />
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer Action: Create New Playlist */}
              <div className="p-1.5 border-t border-[var(--border-main)] bg-[var(--bg-surface-hover)]/40">
                <button
                  onClick={handleCreateNew}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[var(--bg-surface-hover)] hover:bg-[var(--border-main)]/60 text-[var(--text-main)] text-xs font-semibold transition-all cursor-pointer border border-[var(--border-main)] active:scale-98"
                >
                  <FolderPlus size={14} className="text-[var(--accent)]" />
                  <span>Создать плейлист</span>
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
