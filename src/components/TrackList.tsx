import React, { useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useCollectionStore } from '../store/useCollectionStore';
import { useThemeStore, isVideoUrl } from '../store/useThemeStore';
import { useCacheStore } from '../store/useCacheStore';
import { Play, Image as ImageIcon, Trash2, Heart, AudioLines, GripVertical, Check } from 'lucide-react';
import { Reorder, useDragControls } from 'framer-motion';
import { PlaylistPopover } from './PlaylistPopover';
import { TrackOptionsPopover } from './TrackOptionsPopover';
import { PlayingIndicator } from './PlayingIndicator';
import { ArtistLinks } from './ArtistLinks';
import { Track } from '../types';

interface QueueTrackRowProps {
  track: Track;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  isTrackLiked: boolean;
  isDragging: boolean;
  coverUrl: string;
  isCached: boolean;
  coverSpeed: number;
  totalTracks: number;
  onTrackClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onToggleLike: (e: React.MouseEvent) => void;
  onRemove: (e: React.MouseEvent) => void;
}

const QueueTrackRow: React.FC<QueueTrackRowProps> = ({
  track,
  index,
  isActive,
  isPlaying,
  isTrackLiked,
  isDragging,
  coverUrl,
  isCached,
  coverSpeed,
  totalTracks,
  onTrackClick,
  onDragStart,
  onDragEnd,
  onToggleLike,
  onRemove,
}) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      key={track.id}
      value={track}
      dragListener={false}
      dragControls={dragControls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onTrackClick}
      whileDrag={{
        scale: 0.992,
        zIndex: 999,
        cursor: 'grabbing'
      }}
      transition={{
        layout: { type: 'spring', damping: 26, stiffness: 280 }
      }}
      style={{
        zIndex: isDragging ? 999 : (totalTracks - index + 10),
        position: 'relative'
      }}
      className={`group flex items-center justify-between p-2.5 pr-5 mb-2.5 rounded-2xl border select-none cursor-pointer ${
        isDragging
          ? 'transition-none bg-black/70 backdrop-blur-xl border-[var(--accent)] shadow-2xl shadow-black/90 ring-1 ring-[var(--accent)]/50'
          : isActive 
            ? 'transition-colors duration-150 bg-[var(--bg-surface-hover)]/80 border-[var(--accent)]/60 ring-1 ring-[var(--accent)]/30 backdrop-blur-sm' 
            : 'transition-colors duration-150 bg-transparent border-[var(--border-main)] hover:bg-[var(--bg-surface-hover)]/40'
      }`}
    >
      <div className="flex items-center gap-3.5 flex-1 min-w-0">
        <div 
          onPointerDown={(e) => dragControls.start(e)}
          className="touch-none text-[var(--text-secondary)] opacity-40 group-hover:opacity-100 hover:text-[var(--accent)] cursor-grab active:cursor-grabbing p-2 -ml-1 transition-opacity shrink-0"
          title="Перетащить трек"
        >
          <GripVertical size={18} />
        </div>

        <div 
          className="relative w-12 h-12 overflow-hidden shrink-0 bg-[var(--bg-surface-hover)] rounded-[10px] group/cover"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isVideoUrl(coverUrl) ? (
            <video 
              src={coverUrl} 
              autoPlay 
              loop 
              muted 
              playsInline 
              onLoadedMetadata={(e) => { e.currentTarget.playbackRate = coverSpeed; }}
              className="w-full h-full object-cover" 
            />
          ) : (
            <img src={coverUrl} alt={track.title} className="w-full h-full object-cover" />
          )}
          
          <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${isActive ? 'opacity-100 bg-black/40' : 'opacity-0 group-hover/cover:opacity-100 bg-black/40'}`}>
            {isActive ? (
              <PlayingIndicator isPaused={!isPlaying} />
            ) : (
              <div className="w-8 h-8 bg-[var(--accent)] rounded-full flex items-center justify-center shadow-md">
                <Play size={14} fill="currentColor" className="text-[var(--text-main)] ml-0.5" />
              </div>
            )}
          </div>
        </div>
        
        <div className="flex flex-col truncate min-w-0">
          <div className="flex items-center gap-1.5 truncate">
            <span className={`font-semibold text-[16px] truncate track-title leading-snug ${isActive ? 'text-[var(--accent)]' : 'text-[#e0e0e0] group-hover:text-[var(--text-main)]'}`}>
              {track.title}
            </span>
            {isCached && (
              <span className="flex items-center gap-0.5 text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0" title="Доступен оффлайн (в кэше)">
                <Check size={10} strokeWidth={3} />
                КЭШ
              </span>
            )}
          </div>
          <ArtistLinks 
            artist={track.artist} 
            className="text-[13.5px] text-[var(--text-secondary)] truncate transition-colors mt-0.5"
            linkClassName="hover:text-[var(--text-main)]"
            viewMode="modal"
          />
        </div>
      </div>

      <div 
        className="flex items-center gap-1.5 md:gap-4 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <TrackOptionsPopover track={track} direction={(index >= totalTracks - 2 && totalTracks > 2) ? 'up' : 'down'} />
        <PlaylistPopover track={track} direction={(index >= totalTracks - 2 && totalTracks > 2) ? 'up' : 'down'} />
        <button 
          onClick={onToggleLike}
          className={`p-2 rounded-lg hover:bg-white/5 transition-colors ${isTrackLiked ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'}`}
          title={isTrackLiked ? "Убрать из любимых" : "В любимые"}
        >
          <Heart size={18} fill={isTrackLiked ? "currentColor" : "none"} />
        </button>
        <button 
          onClick={onRemove}
          className="p-2 rounded-lg hover:bg-white/5 text-[var(--text-secondary)] hover:text-red-400 transition-colors"
          title="Удалить из очереди"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </Reorder.Item>
  );
};

const TrackList: React.FC = () => {
  const { queue, currentTrackIndex, isPlaying, playTrack, togglePlayPause, removeTrack } = usePlayerStore();
  const { likedTracks, toggleLike } = useCollectionStore();
  const { coverSpeed } = useThemeStore();
  const cachedTracks = useCacheStore(state => state.cachedTracks);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);

  const handleTrackClick = (index: number) => {
    if (index === currentTrackIndex) {
      togglePlayPause();
    } else {
      playTrack(index);
    }
  };

  const handleReorder = (newQueue: Track[]) => {
    const currentTrack = currentTrackIndex >= 0 && currentTrackIndex < queue.length 
      ? queue[currentTrackIndex] 
      : null;
      
    let newCurrentTrackIndex = currentTrackIndex;
    if (currentTrack) {
      const foundIndex = newQueue.findIndex(t => t.id === currentTrack.id);
      if (foundIndex !== -1) {
        newCurrentTrackIndex = foundIndex;
      }
    }

    usePlayerStore.setState({
      queue: newQueue,
      currentTrackIndex: newCurrentTrackIndex,
    });
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-start mb-4 shrink-0 mt-1 px-1">
        <div className="flex items-center gap-2.5 bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-full px-3.5 py-1.5 shadow-sm">
          <AudioLines size={16} className="text-[var(--text-secondary)]" />
          <h2 className="text-[14px] font-bold text-[var(--text-main)] tracking-wide">Очередь</h2>
          <div className="bg-[var(--accent)] text-[var(--text-main)] text-[12px] font-bold px-2 min-w-[22px] h-5 rounded-full flex items-center justify-center shrink-0">
            {queue.length}
          </div>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--text-secondary)]">
          <ImageIcon size={48} className="mb-4 opacity-30" />
          <p>Очередь пуста</p>
        </div>
      ) : (
        <Reorder.Group 
          axis="y" 
          values={queue} 
          onReorder={handleReorder} 
          className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-1 py-2 pb-28 list-none m-0"
        >
          {queue.map((track, index) => {
            const isActive = index === currentTrackIndex;
            const isTrackLiked = likedTracks.some(t => t.id === track.id);
            const isDragging = draggedTrackId === track.id;
            const coverUrl = track.customCoverPath || track.originalCoverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
            
            return (
              <QueueTrackRow
                key={track.id}
                track={track}
                index={index}
                isActive={isActive}
                isPlaying={isPlaying}
                isTrackLiked={isTrackLiked}
                isDragging={isDragging}
                coverUrl={coverUrl}
                isCached={!!cachedTracks[track.id]}
                coverSpeed={coverSpeed}
                totalTracks={queue.length}
                onTrackClick={() => handleTrackClick(index)}
                onDragStart={() => setDraggedTrackId(track.id)}
                onDragEnd={() => setDraggedTrackId(null)}
                onToggleLike={(e) => {
                  e.stopPropagation();
                  toggleLike(track);
                }}
                onRemove={(e) => {
                  e.stopPropagation();
                  removeTrack(track.id);
                }}
              />
            );
          })}
        </Reorder.Group>
      )}
    </div>
  );
};

export default TrackList;


