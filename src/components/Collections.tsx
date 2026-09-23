import React, { useState, useEffect } from 'react';
import { useCollectionStore } from '../store/useCollectionStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { Heart, Plus, Play, Pause, Trash2, Cloud, Pencil, Image as ImageIcon, FilePlus, Check, GripVertical } from 'lucide-react';
import { Reorder, useDragControls } from 'framer-motion';
import { PlaylistPopover } from './PlaylistPopover';
import { TrackOptionsPopover } from './TrackOptionsPopover';
import { CollectionOptionsPopover } from './CollectionOptionsPopover';
import { PlaylistChoiceModal } from './PlaylistChoiceModal';
import { PlaylistImportModal } from './PlaylistImportModal';
import { useCacheStore } from '../store/useCacheStore';
import { useModalStore } from '../store/useModalStore';
import { useThemeStore } from '../store/useThemeStore';
import { ArtistLinks } from './ArtistLinks';
import { open } from '@tauri-apps/plugin-dialog';
import { audioService } from '../services/AudioService';
import { PlayingIndicator } from './PlayingIndicator';
import { Track } from '../types';
import { pickImage } from '../utils/mediaPicker';

const ActionPills = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2">
    {children}
  </div>
);

interface CollectionTrackRowProps {
  track: Track;
  isActive: boolean;
  isPlaying: boolean;
  isDragging: boolean;
  coverUrl: string;
  isCached: boolean;
  onTrackClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  actions: React.ReactNode;
}

const CollectionTrackRow: React.FC<CollectionTrackRowProps> = ({
  track,
  isActive,
  isPlaying,
  isDragging,
  coverUrl,
  isCached,
  onTrackClick,
  onDragStart,
  onDragEnd,
  actions,
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
        zIndex: 50,
        cursor: 'grabbing'
      }}
      transition={{
        layout: { type: 'spring', damping: 26, stiffness: 280 }
      }}
      className={`group flex items-center justify-between p-2 pr-4 mb-2 rounded-2xl border select-none cursor-pointer ${
        isDragging
          ? 'transition-none bg-black/70 backdrop-blur-xl border-[var(--accent)] shadow-2xl shadow-black/90 ring-1 ring-[var(--accent)]/50'
          : isActive 
            ? 'transition-colors duration-150 bg-[var(--bg-surface-hover)]/80 border-[var(--accent)]/60 ring-1 ring-[var(--accent)]/30 backdrop-blur-sm' 
            : 'transition-colors duration-150 bg-transparent border-[var(--border-main)] hover:bg-[var(--bg-surface-hover)]/40'
      }`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div 
          onPointerDown={(e) => dragControls.start(e)}
          className="touch-none text-[var(--text-secondary)] opacity-40 group-hover:opacity-100 hover:text-[var(--accent)] cursor-grab active:cursor-grabbing p-2 -ml-1 transition-opacity shrink-0"
          title="Перетащить трек"
        >
          <GripVertical size={16} />
        </div>
        <div 
          className="relative w-10 h-10 overflow-hidden shrink-0 bg-[var(--bg-surface-hover)] rounded-lg group/cover"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <img src={coverUrl} alt={track.title} className="w-full h-full object-cover" />
          <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${isActive ? 'opacity-100 bg-black/40' : 'opacity-0 group-hover/cover:opacity-100 bg-black/40'}`}>
            {isActive ? <PlayingIndicator isPaused={!isPlaying} /> : <div className="w-6 h-6 bg-[var(--accent)] rounded-full flex items-center justify-center shadow-md"><Play size={10} fill="currentColor" className="text-[var(--text-main)] ml-0.5" /></div>}
          </div>
        </div>
        <div className="flex flex-col truncate min-w-0">
          <div className="flex items-center gap-1.5 truncate">
            <span className={`font-medium text-[14px] truncate track-title ${isActive ? 'text-[var(--accent)] font-semibold' : 'text-[#e0e0e0] group-hover:text-[var(--text-main)]'}`}>{track.title}</span>
            {isCached && (
              <span className="flex items-center gap-0.5 text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0" title="Доступен оффлайн (в кэше)">
                <Check size={10} strokeWidth={3} />
                КЭШ
              </span>
            )}
          </div>
          <ArtistLinks 
            artist={track.artist}
            className="text-[12px] text-[var(--text-secondary)] truncate transition-colors uppercase tracking-wider"
            linkClassName="hover:text-[var(--text-main)]"
            viewMode="modal"
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 md:gap-4 md:opacity-0 md:group-hover:opacity-100 transition-opacity" onPointerDown={(e) => e.stopPropagation()}>
        {actions}
      </div>
    </Reorder.Item>
  );
};

const PillGroup = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-surface)] rounded-full border border-[var(--border-main)]">
    {children}
  </div>
);

const PillButton = ({ icon, onClick }: { icon: React.ReactNode, onClick?: () => void }) => (
  <button onClick={onClick} className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors rounded-full hover:bg-[var(--bg-surface-hover)]">
    {icon}
  </button>
);

export const Collections: React.FC = () => {
  const { 
    likedTracks, 
    playlists, 
    downloadedTracks, 
    createPlaylist, 
    updatePlaylist, 
    deletePlaylist, 
    addDownloadedTracks,
    reorderLikedTracks,
    reorderDownloadedTracks,
    reorderPlaylistTracks
  } = useCollectionStore();
  const { queue, playContext, currentTrackIndex, isPlaying, togglePlayPause } = usePlayerStore();
  const { openCreatePlaylist } = useModalStore();
  const cachedTracks = useCacheStore(state => state.cachedTracks);
  const customWallpaper = useThemeStore(state => state.customWallpaper);
  
  const [view, setView] = useState<'none' | 'liked' | 'downloaded' | 'playlist'>('liked');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);

  useEffect(() => {
    if (view === 'playlist' && selectedPlaylistId) {
      if (!playlists.find(p => p.id === selectedPlaylistId)) {
        setView('none');
        setSelectedPlaylistId(null);
      }
    }
  }, [playlists, selectedPlaylistId, view]);

  const defaultCoverUrl = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
  
  const isLikedContext = queue.length > 0 && likedTracks.length > 0 && queue.length === likedTracks.length && queue[0].id === likedTracks[0].id;
  const isLikedPlaying = isLikedContext && isPlaying;

  const isDownloadedContext = queue.length > 0 && downloadedTracks.length > 0 && queue.length === downloadedTracks.length && queue[0].id === downloadedTracks[0].id;
  const isDownloadedPlaying = isDownloadedContext && isPlaying;

  const handlePlayLiked = () => {
    if (likedTracks.length === 0) return;
    if (isLikedContext) togglePlayPause();
    else { playContext(likedTracks, 0); }
  };

  const handlePlayDownloaded = () => {
    if (downloadedTracks.length === 0) return;
    if (isDownloadedContext) togglePlayPause();
    else { playContext(downloadedTracks, 0); }
  };

  const handleAddLocalFiles = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a'] }]
      });
      if (selected) {
        const files = Array.isArray(selected) ? selected : [selected];
        let allTracks: Track[] = [];
        for (const filePath of files) {
          const track = await audioService.parseLocalTrack(filePath);
          allTracks.push(track);
        }
        addDownloadedTracks(allTracks);
      }
    } catch (e) { console.error(e); }
  };


  const isDocked = view === 'none';
  const showSidebar = isDocked || isSidebarHovered;

  const renderMobileTabs = () => (
    <div className="md:hidden flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border-main)] bg-[var(--bg-surface)]/90 backdrop-blur-md overflow-x-auto scrollbar-hide shrink-0 z-20">
      <button 
        onClick={() => setView('liked')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
          view === 'liked' 
            ? 'bg-[var(--accent)] text-[var(--text-main)] shadow-sm' 
            : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]'
        }`}
      >
        <Heart size={14} fill={view === 'liked' ? 'currentColor' : 'none'} />
        Любимые
      </button>

      <button 
        onClick={() => setView('downloaded')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
          view === 'downloaded' 
            ? 'bg-[var(--accent)] text-[var(--text-main)] shadow-sm' 
            : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]'
        }`}
      >
        <Cloud size={14} fill={view === 'downloaded' ? 'currentColor' : 'none'} />
        Скачанные
      </button>

      <button 
        onClick={() => setIsChoiceModalOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] active:text-[var(--text-main)] transition-colors"
      >
        <Plus size={14} />
        Создать
      </button>

      {playlists.map(pl => {
        const isActive = view === 'playlist' && selectedPlaylistId === pl.id;
        return (
          <button 
            key={pl.id}
            onClick={() => { setSelectedPlaylistId(pl.id); setView('playlist'); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              isActive 
                ? 'bg-[var(--accent)] text-[var(--text-main)]' 
                : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]'
            }`}
          >
            {pl.name}
          </button>
        );
      })}
    </div>
  );

  const renderSidebar = () => {
    return (
      <div 
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
        className={`hidden md:block h-full transition-all duration-300 ease-in-out z-30 ${
          isDocked
            ? `w-[88px] flex-shrink-0 border-r border-[var(--border-main)] ${customWallpaper ? 'bg-black/40 backdrop-blur-md' : 'bg-[var(--bg-main)]'} relative overflow-hidden`
            : `absolute left-0 top-0 bottom-0 ${
                showSidebar 
                  ? `w-[88px] border-r border-[var(--border-main)] ${customWallpaper ? 'bg-black/80 backdrop-blur-xl' : 'bg-[var(--bg-main)]'} shadow-[10px_0_35px_rgba(0,0,0,0.6)]` 
                  : 'w-[14px] overflow-hidden border-r border-transparent bg-transparent hover:bg-white/[0.04] cursor-pointer'
              }`
        }`}
      >
        <div 
          className={`w-[88px] h-full flex flex-col gap-4 py-6 px-0 items-center overflow-y-auto scrollbar-hide transition-all duration-300 ease-out ${
            showSidebar 
              ? 'opacity-100 visible translate-x-0 pointer-events-auto' 
              : 'opacity-0 invisible -translate-x-full pointer-events-none'
          }`}
        >
          <button 
            onClick={() => setView('liked')}
            className={`w-[56px] h-[56px] shrink-0 rounded-[22px] flex items-center justify-center transition-all ${
              view === 'liked' 
                ? 'bg-[var(--accent)]/15 text-[var(--accent)] border-2 border-[var(--accent)] shadow-[0_0_12px_var(--accent)]' 
                : 'bg-transparent text-[var(--text-secondary)] border border-[var(--border-main)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10'
            }`}
            data-tooltip="Любимые треки"
            data-tooltip-pos="right"
          >
            <Heart size={22} strokeWidth={1.5} fill={view === 'liked' ? 'currentColor' : 'none'} />
          </button>

          <button 
            onClick={() => setView('downloaded')}
            className={`w-[56px] h-[56px] shrink-0 rounded-[22px] flex items-center justify-center transition-all ${
              view === 'downloaded' 
                ? 'bg-[var(--accent)]/15 text-[var(--accent)] border-2 border-[var(--accent)] shadow-[0_0_12px_var(--accent)]' 
                : 'bg-transparent text-[var(--text-secondary)] border border-[var(--border-main)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10'
            }`}
            data-tooltip="Скачанные треки"
            data-tooltip-pos="right"
          >
            <Cloud size={24} strokeWidth={1.5} fill={view === 'downloaded' ? 'currentColor' : 'none'} />
          </button>

          <button 
            onClick={() => setIsChoiceModalOpen(true)}
            className="w-[56px] h-[56px] shrink-0 rounded-[22px] flex items-center justify-center transition-all bg-transparent text-[var(--text-secondary)] border border-[var(--border-main)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)]"
            data-tooltip="Создать или импортировать плейлист"
            data-tooltip-pos="right"
          >
            <Plus size={26} strokeWidth={1.5} />
          </button>

          {playlists.length > 0 && (
            <div className="w-full flex items-center justify-center my-2 shrink-0 px-6">
              <div className="w-12 h-[1px] bg-gradient-to-r from-transparent via-[var(--border-main)] to-transparent" />
            </div>
          )}

          {playlists.map(pl => {
            const isActive = view === 'playlist' && selectedPlaylistId === pl.id;
            return (
              <button 
                key={pl.id}
                onClick={() => { setSelectedPlaylistId(pl.id); setView('playlist'); }}
                className={`w-[64px] h-[64px] shrink-0 rounded-full transition-all relative p-[2.5px] flex items-center justify-center ${
                  isActive 
                    ? 'border-2 border-[var(--accent)] shadow-[0_0_16px_var(--accent)] scale-105' 
                    : 'border-2 border-transparent hover:border-white/25 hover:scale-102'
                }`}
                data-tooltip={pl.name}
                data-tooltip-pos="right"
              >
                <div className="w-full h-full rounded-full overflow-hidden bg-[var(--bg-surface)]">
                  {pl.coverUrl ? (
                    <img src={pl.coverUrl} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#555]">
                      <Play size={18} fill="currentColor" />
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (view === 'none') {
      return <div className="flex-1 h-full" />;
    }
  
    if (view === 'liked') {
      return (
        <div className="flex-1 h-full flex flex-col px-3.5 md:pl-10 md:pr-6 pt-3 md:pt-10 pb-20 md:pb-24 overflow-y-auto scrollbar-hide">
          <div className="flex flex-col gap-4 md:gap-6 mb-4 md:mb-6 shrink-0">
            <div className="flex items-center md:items-end gap-4 md:gap-6">
              <div className="w-20 h-20 md:w-40 md:h-40 rounded-2xl md:rounded-3xl bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
                <Heart size={36} className="md:hidden text-[var(--accent)]" strokeWidth={1.5} fill="currentColor" />
                <Heart size={56} className="hidden md:block text-[var(--accent)]" strokeWidth={1.5} fill="currentColor" />
              </div>
              <div className="flex flex-col pb-1 md:pb-2">
                <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-[var(--text-main)] mb-1 md:mb-2 tracking-tight">Любимые</h1>
                <p className="text-[12px] md:text-[13px] text-[var(--text-secondary)] font-medium">{likedTracks.length} треков</p>
              </div>
            </div>

            <ActionPills>
              <button 
                onClick={handlePlayLiked}
                className="flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-[var(--text-main)] hover:bg-[var(--accent-hover)] rounded-full font-bold transition-colors text-sm mr-2"
              >
                {isLikedPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                Играть все
              </button>
              <CollectionOptionsPopover tracks={likedTracks} />
            </ActionPills>
          </div>

          <div className="w-full h-[1px] bg-[var(--bg-surface-hover)] mb-4" />

          <div className="flex flex-col flex-1">
            {likedTracks.length === 0 ? (
              <div className="text-center text-[var(--text-secondary)] mt-10">Нет любимых треков. Нажмите на сердечко во время проигрывания, чтобы добавить.</div>
            ) : (
              <Reorder.Group
                axis="y"
                values={likedTracks}
                onReorder={reorderLikedTracks}
                className="flex flex-col flex-1 list-none m-0 p-0"
              >
                {likedTracks.map((track, index) => {
                  const isActive = queue[currentTrackIndex]?.id === track.id;
                  const isDragging = draggedTrackId === track.id;
                  const coverUrl = track.customCoverPath || track.originalCoverUrl || defaultCoverUrl;
                  const isLiked = useCollectionStore.getState().isLiked(track.id);
                  return (
                    <CollectionTrackRow
                      key={track.id}
                      track={track}
                      isActive={isActive}
                      isPlaying={isPlaying}
                      isDragging={isDragging}
                      coverUrl={coverUrl}
                      isCached={!!cachedTracks[track.id]}
                      onTrackClick={() => { if (isActive) togglePlayPause(); else { playContext(likedTracks, index); } }}
                      onDragStart={() => setDraggedTrackId(track.id)}
                      onDragEnd={() => setDraggedTrackId(null)}
                      actions={
                        <>
                          <TrackOptionsPopover track={track} />
                          <PlaylistPopover track={track} />
                          <button onClick={(e) => { e.stopPropagation(); useCollectionStore.getState().toggleLike(track); }} className="p-1.5 rounded-sm hover:scale-110 transition-transform">
                            <Heart size={16} fill={isLiked ? "var(--accent)" : "none"} color={isLiked ? "var(--accent)" : "#888"} />
                          </button>
                        </>
                      }
                    />
                  );
                })}
              </Reorder.Group>
            )}
          </div>
        </div>
      );
    }
    
    if (view === 'downloaded') {
      return (
        <div className="flex-1 h-full flex flex-col px-3.5 md:pl-10 md:pr-6 pt-3 md:pt-10 pb-20 md:pb-24 overflow-y-auto scrollbar-hide">
          <div className="flex flex-col gap-4 md:gap-6 mb-4 md:mb-6 shrink-0">
            <div className="flex items-center md:items-end gap-4 md:gap-6">
              <div className="w-20 h-20 md:w-40 md:h-40 rounded-2xl md:rounded-3xl bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
                <Cloud size={36} className="md:hidden text-[var(--accent)]" strokeWidth={1.5} fill="currentColor" />
                <Cloud size={56} className="hidden md:block text-[var(--accent)]" strokeWidth={1.5} fill="currentColor" />
              </div>
              <div className="flex flex-col pb-1 md:pb-2">
                <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-[var(--text-main)] mb-1 md:mb-2 tracking-tight">Скачанные</h1>
                <p className="text-[12px] md:text-[13px] text-[var(--text-secondary)] font-medium">{downloadedTracks.length} треков</p>
              </div>
            </div>

            <ActionPills>
              {downloadedTracks.length > 0 && (
                <button 
                  onClick={handlePlayDownloaded}
                  className="flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-[var(--text-main)] hover:bg-[var(--accent-hover)] rounded-full font-bold transition-colors text-sm mr-2"
                >
                  {isDownloadedPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                  Играть все
                </button>
              )}
              
              <PillGroup>
                <PillButton icon={<FilePlus size={16} strokeWidth={2}/>} onClick={handleAddLocalFiles} />
              </PillGroup>

              <CollectionOptionsPopover tracks={downloadedTracks} />
            </ActionPills>
          </div>

          <div className="w-full h-[1px] bg-[var(--bg-surface-hover)] mb-4" />

          <div className="flex flex-col flex-1">
            {downloadedTracks.length === 0 ? (
              <div className="text-center text-[var(--text-secondary)] mt-10">Здесь будут отображаться скачанные треки. Нажмите плюсик, чтобы добавить файлы.</div>
            ) : (
              <Reorder.Group
                axis="y"
                values={downloadedTracks}
                onReorder={reorderDownloadedTracks}
                className="flex flex-col flex-1 list-none m-0 p-0"
              >
                {downloadedTracks.map((track, index) => {
                  const isActive = queue[currentTrackIndex]?.id === track.id;
                  const isDragging = draggedTrackId === track.id;
                  const coverUrl = track.customCoverPath || track.originalCoverUrl || defaultCoverUrl;
                  const isLiked = useCollectionStore.getState().isLiked(track.id);
                  return (
                    <CollectionTrackRow
                      key={track.id}
                      track={track}
                      isActive={isActive}
                      isPlaying={isPlaying}
                      isDragging={isDragging}
                      coverUrl={coverUrl}
                      isCached={!!cachedTracks[track.id]}
                      onTrackClick={() => { if (isActive) togglePlayPause(); else { playContext(downloadedTracks, index); } }}
                      onDragStart={() => setDraggedTrackId(track.id)}
                      onDragEnd={() => setDraggedTrackId(null)}
                      actions={
                        <>
                          <TrackOptionsPopover track={track} />
                          <PlaylistPopover track={track} />
                          <button onClick={(e) => { e.stopPropagation(); useCollectionStore.getState().toggleLike(track); }} className="p-1.5 rounded-sm hover:scale-110 transition-transform">
                            <Heart size={16} fill={isLiked ? "var(--accent)" : "none"} color={isLiked ? "var(--accent)" : "#888"} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); useCollectionStore.getState().removeDownloadedTrack(track.id); }} className="p-1.5 rounded-sm text-[var(--text-secondary)] hover:text-red-400 transition-colors" title="Удалить">
                            <Trash2 size={16} />
                          </button>
                        </>
                      }
                    />
                  );
                })}
              </Reorder.Group>
            )}
          </div>
        </div>
      );
    }
    
    if (view === 'playlist') {
      const playlist = playlists.find(p => p.id === selectedPlaylistId);
      if (!playlist) return null;
      const isPlaylistContext = queue.length > 0 && playlist.tracks.length > 0 && queue.length === playlist.tracks.length && queue[0].id === playlist.tracks[0].id;
      const isPlaylistPlaying = isPlaylistContext && isPlaying;
      const handlePlayPlaylist = () => {
        if (playlist.tracks.length === 0) return;
        if (isPlaylistContext) togglePlayPause(); else { playContext(playlist.tracks, 0); }
      };
      const handleImageSelect = async () => {
        try {
          const dataUrl = await pickImage();
          if (dataUrl) {
            updatePlaylist(playlist.id, { coverUrl: dataUrl });
          }
        } catch (e) {
          console.error('Failed to update playlist cover:', e);
        }
      };
      return (
        <div className="flex-1 h-full flex flex-col px-3.5 md:pl-10 md:pr-6 pt-3 md:pt-10 pb-20 md:pb-24 overflow-y-auto scrollbar-hide">
          <div className="flex flex-col gap-4 md:gap-6 mb-4 md:mb-6 shrink-0">
            <div className="flex items-center md:items-end gap-4 md:gap-6">
              <div 
                onClick={handleImageSelect}
                className="w-20 h-20 md:w-40 md:h-40 shrink-0 rounded-2xl md:rounded-3xl overflow-hidden bg-[var(--bg-surface-hover)] shadow-lg relative group cursor-pointer"
                title="Нажмите, чтобы изменить обложку"
              >
                <img src={playlist.coverUrl || defaultCoverUrl} alt={playlist.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              </div>
              <div className="flex flex-col pb-1 md:pb-2">
                <div className="flex items-center gap-2 md:gap-3">
                  <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-[var(--text-main)] mb-1 md:mb-2 tracking-tight">{playlist.name}</h1>
                  <button onClick={() => openCreatePlaylist('Изменить название', playlist.name, (name) => updatePlaylist(playlist.id, { name }))} className="p-1.5 md:p-2 text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-all bg-[var(--bg-surface-hover)] rounded-full mb-1 md:mb-2">
                    <Pencil size={15} />
                  </button>
                </div>
                <p className="text-[12px] md:text-[13px] text-[var(--text-secondary)] font-medium">{playlist.tracks.length} треков</p>
              </div>
            </div>

            <ActionPills>
              <button 
                onClick={handlePlayPlaylist}
                className="flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-[var(--text-main)] hover:bg-[var(--accent-hover)] rounded-full font-bold transition-colors text-sm mr-2"
              >
                {isPlaylistPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                Играть все
              </button>
              
              <button 
                onClick={handleImageSelect}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-surface-hover)] text-[var(--text-main)] hover:bg-[var(--border-main)] rounded-full font-bold transition-colors text-sm mr-2"
              >
                <ImageIcon size={16} />
                Изменить обложку
              </button>

              <CollectionOptionsPopover tracks={playlist.tracks} />

              <button 
                onClick={() => { if (confirm('Удалить плейлист?')) deletePlaylist(playlist.id); }}
                className="flex items-center justify-center p-2 bg-transparent text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 rounded-full transition-colors"
                title="Удалить плейлист"
              >
                <Trash2 size={16} />
              </button>

            </ActionPills>
          </div>

          <div className="w-full h-[1px] bg-[var(--bg-surface-hover)] mb-4" />

          <div className="flex flex-col flex-1">
            {playlist.tracks.length === 0 ? (
              <div className="text-center text-[var(--text-secondary)] mt-10">В этом плейлисте пока нет треков</div>
            ) : (
              <Reorder.Group
                axis="y"
                values={playlist.tracks}
                onReorder={(newOrder) => reorderPlaylistTracks(playlist.id, newOrder)}
                className="flex flex-col flex-1 list-none m-0 p-0"
              >
                {playlist.tracks.map((track, index) => {
                  const isActive = queue[currentTrackIndex]?.id === track.id;
                  const isDragging = draggedTrackId === track.id;
                  const coverUrl = track.customCoverPath || track.originalCoverUrl || defaultCoverUrl;
                  const isLiked = useCollectionStore.getState().isLiked(track.id);
                  return (
                    <CollectionTrackRow
                      key={track.id}
                      track={track}
                      isActive={isActive}
                      isPlaying={isPlaying}
                      isDragging={isDragging}
                      coverUrl={coverUrl}
                      isCached={!!cachedTracks[track.id]}
                      onTrackClick={() => { if (isActive) togglePlayPause(); else { playContext(playlist.tracks, index); } }}
                      onDragStart={() => setDraggedTrackId(track.id)}
                      onDragEnd={() => setDraggedTrackId(null)}
                      actions={
                        <>
                          <TrackOptionsPopover track={track} />
                          <PlaylistPopover track={track} />
                          <button onClick={(e) => { e.stopPropagation(); useCollectionStore.getState().toggleLike(track); }} className="p-1.5 rounded-sm hover:scale-110 transition-transform">
                            <Heart size={16} fill={isLiked ? "var(--accent)" : "none"} color={isLiked ? "var(--accent)" : "#888"} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); useCollectionStore.getState().removeTrackFromPlaylist(playlist.id, track.id); }} className="p-1.5 rounded-sm text-[var(--text-secondary)] hover:text-red-400 transition-colors" title="Удалить из плейлиста">
                            <Trash2 size={16} />
                          </button>
                        </>
                      }
                    />
                  );
                })}
              </Reorder.Group>
            )}
          </div>
        </div>
      );
    }
  };

  return (
    <div className="w-full h-full flex flex-col md:flex-row bg-transparent relative overflow-hidden">
      {renderMobileTabs()}
      {renderSidebar()}
      {renderContent()}

      <PlaylistChoiceModal 
        isOpen={isChoiceModalOpen}
        onClose={() => setIsChoiceModalOpen(false)}
        onCreateEmpty={() => openCreatePlaylist('Создать плейлист', '', (name) => createPlaylist(name))}
        onOpenImport={() => setIsImportModalOpen(true)}
      />

      <PlaylistImportModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onOpenPlaylist={(playlistId) => {
          setSelectedPlaylistId(playlistId);
          setView('playlist');
        }}
      />
    </div>
  );
};
