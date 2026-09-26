import React, { useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useCollectionStore } from '../store/useCollectionStore';
import { useThemeStore, isVideoUrl } from '../store/useThemeStore';
import { useCacheStore } from '../store/useCacheStore';
import { Image as ImageIcon, Heart, GripVertical, Check, PlusCircle, Minus, Trash2 } from 'lucide-react';
import { Reorder } from 'framer-motion';
import { PlaylistPopover } from './PlaylistPopover';
import { TrackOptionsPopover } from './TrackOptionsPopover';
import { ArtistLinks } from './ArtistLinks';
import { PlayingIndicator } from './PlayingIndicator';
import { Track } from '../types';

const TrackList: React.FC = () => {
  const { queue, currentTrackIndex, isPlaying, playTrack, togglePlayPause, removeTrack, clearQueue } = usePlayerStore();
  const { likedTracks, toggleLike } = useCollectionStore();
  const { coverSpeed } = useThemeStore();
  const cachedTracks = useCacheStore(state => state.cachedTracks);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);

  const currentTrack = currentTrackIndex >= 0 && currentTrackIndex < queue.length 
    ? queue[currentTrackIndex] 
    : null;

  const handleTrackClick = (index: number) => {
    if (index === currentTrackIndex) {
      togglePlayPause();
    } else {
      playTrack(index);
    }
  };

  const handleReorder = (newQueue: Track[]) => {
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
      {/* Artist & Queue Header Pill matching Theme */}
      <div className="flex items-center justify-start mb-3 shrink-0 px-1">
        <div className="flex items-center gap-2.5 bg-transparent border border-white/[0.08] rounded-full px-3.5 py-1.5 shadow-sm select-none">
          {/* Cover button: on hover becomes trash icon to clear queue */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              clearQueue();
            }}
            data-tooltip="Очистить очередь"
            className="group/cover relative w-5 h-5 rounded-full overflow-hidden shrink-0 ring-1 ring-white/10 hover:ring-red-500/50 cursor-pointer transition-all flex items-center justify-center"
          >
            {(currentTrack?.customCoverPath || currentTrack?.originalCoverUrl) ? (
              <img 
                src={(currentTrack.customCoverPath || currentTrack.originalCoverUrl) || ''} 
                className="w-full h-full object-cover transition-opacity duration-150 group-hover/cover:opacity-0" 
                alt="Track" 
              />
            ) : (
              <div className="w-full h-full bg-white/10 flex items-center justify-center text-[10px] transition-opacity duration-150 group-hover/cover:opacity-0">
                🎵
              </div>
            )}
            
            <div className="absolute inset-0 bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/cover:opacity-100 transition-opacity duration-150 shadow-inner">
              <Trash2 size={11} strokeWidth={2.5} />
            </div>
          </button>
          
          {/* Animated wave bars */}
          <div className="flex items-center justify-center px-0.5">
            <PlayingIndicator size="xs" isPaused={!isPlaying} barColor="bg-[var(--accent)]" />
          </div>

          <span className="text-[13px] font-medium text-[var(--text-main)] truncate max-w-[220px]">
            {currentTrack?.artist || 'Очередь'}
          </span>

          <span className="min-w-5 h-5 px-1.5 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] text-[10px] font-bold flex items-center justify-center shrink-0 leading-none">
            {queue.length}
          </span>
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
          className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-1 py-1 pb-24 list-none m-0"
        >
          {queue.map((track, index) => {
            const isActive = index === currentTrackIndex;
            const isTrackLiked = likedTracks.some(t => t.id === track.id);
            const isDragging = draggedTrackId === track.id;
            const coverUrl = track.customCoverPath || track.originalCoverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
            
            return (
              <Reorder.Item
                key={track.id}
                value={track}
                onDragStart={() => setDraggedTrackId(track.id)}
                onDragEnd={() => setDraggedTrackId(null)}
                onClick={() => handleTrackClick(index)}
                whileDrag={{
                  scale: 0.995,
                  zIndex: 50,
                  cursor: 'grabbing'
                }}
                transition={{
                  layout: { type: 'spring', damping: 26, stiffness: 280 }
                }}
                className={`group flex items-center justify-between py-2 px-3 mb-1.5 rounded-xl select-none cursor-pointer transition-all ${
                  isDragging
                    ? 'transition-none bg-black/70 backdrop-blur-xl border border-[var(--accent)] shadow-2xl ring-1 ring-[var(--accent)]/50'
                    : isActive 
                      ? 'bg-white/[0.04] border border-[var(--accent)]/60 shadow-sm' 
                      : 'bg-transparent border border-white/[0.04] hover:border-white/15 hover:bg-white/[0.02]'
                }`}
              >
                {/* Left side: Drag handle + Thumbnail + Details */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div 
                    className="text-[var(--text-secondary)] opacity-40 md:opacity-0 md:group-hover:opacity-40 hover:!opacity-100 hover:text-[var(--accent)] cursor-grab active:cursor-grabbing p-1 transition-opacity shrink-0 -ml-1"
                    title="Перетащить трек"
                  >
                    <GripVertical size={16} />
                  </div>

                  {/* Album Cover Thumbnail */}
                  <div 
                    className={`relative w-11 h-11 overflow-hidden shrink-0 bg-[#161616] rounded-lg group/cover ring-1 ${isActive ? 'ring-[var(--accent)]/50' : 'ring-[var(--border-main)]'}`}
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
                    
                    {/* Animated equalizer bars on active track */}
                    {isActive && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <PlayingIndicator size="sm" isPaused={!isPlaying} barColor="bg-white" />
                      </div>
                    )}
                  </div>
                  
                  {/* Track Title and Artist */}
                  <div className="flex flex-col truncate min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className={`font-semibold text-[15px] truncate tracking-wide leading-snug ${isActive ? 'text-[var(--accent)]' : 'text-[#e0e0e0] group-hover:text-white'}`}>
                        {track.title}
                      </span>
                      {cachedTracks[track.id] && (
                        <span className="flex items-center gap-0.5 text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0" title="Доступен оффлайн">
                          <Check size={9} strokeWidth={3} />
                          КЭШ
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-[#777] truncate mt-0.5">
                      <ArtistLinks 
                        artist={track.artist}
                        className="text-[12px] text-[#777] truncate hover:text-[#aaa] transition-colors"
                        linkClassName="hover:text-white"
                        viewMode="modal"
                      />
                    </div>
                  </div>
                </div>

                {/* Right side: Actions & Duration */}
                <div 
                  className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2 sm:ml-4"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div className={`flex items-center gap-1 sm:gap-1.5 transition-opacity ${isActive ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}>
                    {/* Three dots options (cache, cache similar, similar to queue) */}
                    <TrackOptionsPopover track={track} direction="up" />

                    {/* Heart button */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(track);
                      }}
                      className={`p-1.5 rounded-lg hover:bg-white/5 transition-colors ${isTrackLiked ? 'text-[var(--accent)]' : 'text-[#777] hover:text-white'}`}
                      title={isTrackLiked ? "Убрать из любимых" : "В любимые"}
                    >
                      <Heart size={16} fill={isTrackLiked ? "currentColor" : "none"} />
                    </button>

                    {/* PlusCircle (Add to playlist) */}
                    <PlaylistPopover 
                      track={track} 
                      icon={<PlusCircle size={16} strokeWidth={1.5} className="text-[#777] hover:text-white transition-colors" />} 
                    />

                    {/* Minus (Remove from queue) */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTrack(track.id);
                      }}
                      className="p-1.5 rounded-lg hover:bg-white/5 text-[#777] hover:text-[var(--accent)] transition-colors"
                      title="Удалить из очереди"
                    >
                      <Minus size={16} strokeWidth={1.8} />
                    </button>
                  </div>

                  {/* Duration */}
                  <span className="text-xs text-[#666] font-mono min-w-[36px] text-right">
                    {Math.floor(track.duration / 60)}:{(Math.round(track.duration) % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      )}
    </div>
  );
};

export default TrackList;
