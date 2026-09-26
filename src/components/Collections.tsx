import React, { useState, useEffect } from 'react';
import { useCollectionStore } from '../store/useCollectionStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { Heart, Plus, Play, Pause, Trash2, Cloud, Pencil, Image as ImageIcon, FolderPlus, FilePlus, Check, GripVertical, ChevronLeft, Minus } from 'lucide-react';
import { Reorder } from 'framer-motion';
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
import { invoke } from '@tauri-apps/api/core';
import { audioService } from '../services/AudioService';
import { PlayingIndicator } from './PlayingIndicator';
import { Track } from '../types';
import { pickImage } from '../utils/mediaPicker';
import { MediaCover } from './MediaCover';

const ActionPills = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2">
    {children}
  </div>
);

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
  
  const [view, setView] = useState<'none' | 'liked' | 'downloaded' | 'playlist'>('none');
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

  const handleAddLocalFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false
      });
      if (selected) {
        const audioFiles = await invoke<string[]>('read_audio_files_recursive', { dirPath: selected as string });
        let allTracks: Track[] = [];
        for (const filePath of audioFiles) {
          const track = await audioService.parseLocalTrack(filePath);
          allTracks.push(track);
        }
        addDownloadedTracks(allTracks);
      }
    } catch (e) { console.error(e); }
  };

  const isDocked = view === 'none';
  const showSidebar = isDocked || isSidebarHovered;

  const renderTopBar = () => {
    return (
      <div className="md:hidden flex items-center gap-2.5 px-4 py-2.5 overflow-x-auto scrollbar-hide border-b border-[var(--border-main)] shrink-0 select-none bg-black/20 backdrop-blur-md">
        {/* All / Overview tab */}
        <button
          onClick={() => setView('none')}
          className={`h-11 px-3.5 shrink-0 rounded-[16px] flex items-center justify-center gap-1.5 transition-all text-xs font-bold ${
            view === 'none'
              ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-md shadow-[var(--accent)]/20'
              : 'bg-white/[0.05] text-[var(--text-secondary)] border border-white/[0.08] hover:text-white'
          }`}
        >
          <span>Все</span>
        </button>

        {/* Liked songs squircle button */}
        <button
          onClick={() => setView('liked')}
          className={`w-11 h-11 shrink-0 rounded-[16px] flex items-center justify-center transition-all ${
            view === 'liked'
              ? 'bg-[var(--accent)]/20 text-[var(--accent)] border-2 border-[var(--accent)] shadow-[0_0_12px_var(--accent)]'
              : 'bg-white/[0.05] text-[var(--text-secondary)] border border-white/[0.08] hover:text-[var(--accent)]'
          }`}
          title="Любимые треки"
        >
          <Heart size={18} strokeWidth={2} fill={view === 'liked' ? 'currentColor' : 'none'} />
        </button>

        {/* Downloaded songs squircle button */}
        <button
          onClick={() => setView('downloaded')}
          className={`w-11 h-11 shrink-0 rounded-[16px] flex items-center justify-center transition-all ${
            view === 'downloaded'
              ? 'bg-[var(--accent)]/20 text-[var(--accent)] border-2 border-[var(--accent)] shadow-[0_0_12px_var(--accent)]'
              : 'bg-white/[0.05] text-[var(--text-secondary)] border border-white/[0.08] hover:text-[var(--accent)]'
          }`}
          title="Скачанные треки"
        >
          <Cloud size={18} strokeWidth={2} fill={view === 'downloaded' ? 'currentColor' : 'none'} />
        </button>

        {/* Create playlist squircle button */}
        <button
          onClick={() => setIsChoiceModalOpen(true)}
          className="w-11 h-11 shrink-0 rounded-[16px] flex items-center justify-center transition-all bg-white/[0.05] text-[var(--text-secondary)] border border-white/[0.08] hover:text-white active:scale-95"
          title="Создать или импортировать плейлист"
        >
          <Plus size={20} strokeWidth={2} />
        </button>

        {playlists.length > 0 && (
          <div className="w-[1px] h-6 bg-white/10 shrink-0 mx-0.5" />
        )}

        {/* Playlists as circular covers matching PC sidebar */}
        {playlists.map(pl => {
          const isActive = view === 'playlist' && selectedPlaylistId === pl.id;
          return (
            <button
              key={pl.id}
              onClick={() => { setSelectedPlaylistId(pl.id); setView('playlist'); }}
              className={`w-11 h-11 shrink-0 rounded-full transition-all relative p-[2px] flex items-center justify-center ${
                isActive
                  ? 'border-2 border-[var(--accent)] shadow-[0_0_14px_var(--accent)] scale-105'
                  : 'border-2 border-white/10 hover:border-white/30'
              }`}
              title={pl.name}
            >
              <div className="w-full h-full rounded-full overflow-hidden bg-[var(--bg-surface)]">
                {pl.coverUrl ? (
                  <MediaCover src={pl.coverUrl} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)] text-xs font-bold">
                    {pl.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

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
                    <MediaCover src={pl.coverUrl} className="w-full h-full object-cover" />
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
      return (
        <div className="flex-1 h-full flex flex-col px-4 sm:px-8 md:px-12 pt-3 sm:pt-6 md:pt-8 pb-28 overflow-y-auto scrollbar-hide">
          {/* Header */}
          <div className="flex items-center justify-between mb-5 sm:mb-8 shrink-0 gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-[var(--text-main)] tracking-tight truncate">Медиатека</h1>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5 sm:mt-1 font-medium truncate">
                {playlists.length} {playlists.length === 1 ? 'плейлист' : playlists.length >= 2 && playlists.length <= 4 ? 'плейлиста' : 'плейлистов'} • {likedTracks.length} любимых треков
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsChoiceModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full bg-white/10 hover:bg-white/18 text-white border border-white/15 backdrop-blur-md transition-all text-xs font-bold cursor-pointer hover:scale-105 active:scale-95 shadow-sm"
              >
                <Plus size={15} />
                <span className="hidden sm:inline">Создать плейлист</span>
                <span className="sm:hidden">Создать</span>
              </button>
            </div>
          </div>

          {/* Quick Access Hero Cards (Dotify-style cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 mb-8 sm:mb-10 shrink-0">
            {/* 1. Liked Songs Card */}
            <div
              onClick={() => setView('liked')}
              className="relative group p-5 sm:p-6 rounded-[24px] bg-gradient-to-br from-red-500/15 via-white/[0.04] to-transparent border border-white/[0.08] hover:border-red-500/40 transition-all duration-300 cursor-pointer overflow-hidden shadow-xl"
            >
              <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-10 group-hover:opacity-25 group-hover:scale-110 transition-all duration-500 pointer-events-none">
                <Heart size={160} fill="currentColor" className="text-red-500" />
              </div>
              
              <div className="relative z-10 flex flex-col justify-between h-[130px] sm:h-[150px]">
                <div className="flex items-start justify-between">
                  <div className="w-11 sm:w-12 h-11 sm:h-12 rounded-2xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center text-white shadow-lg shadow-red-500/30">
                    <Heart size={20} fill="currentColor" />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayLiked();
                    }}
                    className="w-11 sm:w-12 h-11 sm:h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transform sm:translate-y-2 sm:group-hover:translate-y-0 transition-all duration-200 hover:scale-110"
                    title={isLikedPlaying ? "Пауза" : "Слушать любимые"}
                  >
                    {isLikedPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                  </button>
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Любимые треки</h3>
                  <p className="text-xs text-white/60 font-medium mt-1">
                    {likedTracks.length} {likedTracks.length === 1 ? 'трек' : likedTracks.length >= 2 && likedTracks.length <= 4 ? 'трека' : 'треков'}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Downloaded Songs Card */}
            <div
              onClick={() => setView('downloaded')}
              className="relative group p-5 sm:p-6 rounded-[24px] bg-gradient-to-br from-cyan-500/15 via-white/[0.04] to-transparent border border-white/[0.08] hover:border-cyan-500/40 transition-all duration-300 cursor-pointer overflow-hidden shadow-xl"
            >
              <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-10 group-hover:opacity-25 group-hover:scale-110 transition-all duration-500 pointer-events-none">
                <Cloud size={160} fill="currentColor" className="text-cyan-400" />
              </div>

              <div className="relative z-10 flex flex-col justify-between h-[130px] sm:h-[150px]">
                <div className="flex items-start justify-between">
                  <div className="w-11 sm:w-12 h-11 sm:h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/30">
                    <Cloud size={20} fill="currentColor" />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayDownloaded();
                    }}
                    className="w-11 sm:w-12 h-11 sm:h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transform sm:translate-y-2 sm:group-hover:translate-y-0 transition-all duration-200 hover:scale-110"
                    title={isDownloadedPlaying ? "Пауза" : "Слушать скачанные"}
                  >
                    {isDownloadedPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                  </button>
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Скачанные</h3>
                  <p className="text-xs text-white/60 font-medium mt-1">
                    {downloadedTracks.length} {downloadedTracks.length === 1 ? 'трек' : 'треков'} • Локальные и оффлайн
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Playlists Section */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Плейлисты</h2>
            </div>

            {/* Playlists: horizontal scroll on mobile, responsive grid on desktop */}
            <div className="flex md:grid overflow-x-auto md:overflow-x-visible scrollbar-hide md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4 pb-4 -mx-1 px-1">
              {/* Create Card */}
              <div
                onClick={() => setIsChoiceModalOpen(true)}
                className="group flex flex-col items-center justify-center aspect-square rounded-[20px] border-2 border-dashed border-white/10 hover:border-white/30 bg-white/[0.02] hover:bg-white/[0.05] transition-all cursor-pointer p-4 text-center w-[135px] sm:w-[155px] md:w-auto shrink-0"
              >
                <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-full bg-white/5 group-hover:bg-white/10 flex items-center justify-center text-white/60 group-hover:text-white mb-2 transition-all group-hover:scale-110">
                  <Plus size={22} />
                </div>
                <span className="text-xs font-semibold text-white/70 group-hover:text-white transition-colors">Создать</span>
              </div>

              {/* Playlist Cards */}
              {playlists.map((pl) => {
                const isPlPlaying = queue.length > 0 && pl.tracks.length > 0 && queue.length === pl.tracks.length && queue[0].id === pl.tracks[0].id && isPlaying;
                return (
                  <div
                    key={pl.id}
                    onClick={() => {
                      setSelectedPlaylistId(pl.id);
                      setView('playlist');
                    }}
                    className="group relative flex flex-col p-3 rounded-[20px] bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/[0.15] transition-all duration-300 cursor-pointer shadow-md w-[135px] sm:w-[155px] md:w-auto shrink-0"
                  >
                    <div className="relative aspect-square w-full rounded-[16px] overflow-hidden bg-black/40 mb-3 shadow-md">
                      {pl.coverUrl ? (
                        <MediaCover src={pl.coverUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/30">
                          <Play size={32} fill="currentColor" />
                        </div>
                      )}
                      
                      {/* Play hover button */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (pl.tracks.length > 0) {
                              if (isPlPlaying) togglePlayPause();
                              else playContext(pl.tracks, 0);
                            }
                          }}
                          className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform"
                          title={isPlPlaying ? "Пауза" : "Воспроизвести"}
                        >
                          {isPlPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                        </button>
                      </div>
                    </div>

                    <h4 className="font-bold text-white text-sm truncate leading-snug">{pl.name}</h4>
                    <p className="text-[12px] text-white/50 truncate mt-0.5">{pl.tracks.length} треков</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }
  
    if (view === 'liked') {
      return (
        <div className="flex-1 h-full flex flex-col pl-10 pr-6 pt-8 pb-28 overflow-y-auto scrollbar-hide">
          {/* Back button */}
          <button
            onClick={() => setView('none')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/12 text-white/70 hover:text-white border border-white/10 text-xs font-semibold mb-6 w-fit transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
          >
            <ChevronLeft size={16} />
            Все коллекции
          </button>

          <div className="flex flex-col gap-6 mb-6 shrink-0">
            <div className="flex items-end gap-6">
              <div className="w-40 h-40 rounded-3xl bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
                <Heart size={56} className="text-[var(--accent)]" strokeWidth={1.5} fill="currentColor" />
              </div>
              <div className="flex flex-col pb-2">
                <h1 className="text-5xl font-bold text-[var(--text-main)] mb-2 tracking-tight">Любимые</h1>
                <p className="text-[13px] text-[var(--text-secondary)] font-medium">{likedTracks.length} треков</p>
              </div>
            </div>

            <ActionPills>
              <button 
                onClick={handlePlayLiked}
                className="flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] rounded-full font-bold transition-colors text-sm mr-2"
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
                    <Reorder.Item
                      key={track.id}
                      value={track}
                      onDragStart={() => setDraggedTrackId(track.id)}
                      onDragEnd={() => setDraggedTrackId(null)}
                      onClick={() => { if (isActive) togglePlayPause(); else { playContext(likedTracks, index); } }}
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
                          className="text-[var(--text-secondary)] opacity-30 group-hover:opacity-100 hover:text-[var(--accent)] cursor-grab active:cursor-grabbing p-1 transition-opacity shrink-0"
                          title="Перетащить трек"
                        >
                          <GripVertical size={16} />
                        </div>
                        <div 
                          className="relative w-10 h-10 overflow-hidden shrink-0 bg-[var(--bg-surface-hover)] rounded-lg group/cover"
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <MediaCover src={coverUrl} alt={track.title} className="w-full h-full object-cover" />
                          <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${isActive ? 'opacity-100 bg-black/40' : 'opacity-0 group-hover/cover:opacity-100 bg-black/40'}`}>
                            {isActive ? <PlayingIndicator isPaused={!isPlaying} /> : <div className="w-6 h-6 bg-[var(--accent)] rounded-full flex items-center justify-center shadow-md"><Play size={10} fill="currentColor" className="text-[var(--accent-contrast)] ml-0.5" /></div>}
                          </div>
                        </div>
                        <div className="flex flex-col truncate min-w-0">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className={`font-medium text-[14px] truncate track-title ${isActive ? 'text-[var(--accent)] font-semibold' : 'text-[#e0e0e0] group-hover:text-[var(--text-main)]'}`}>{track.title}</span>
                            {cachedTracks[track.id] && (
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
                      <div 
                        className="flex items-center gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                        onPointerDown={(e) => e.stopPropagation()}
                      > 
                        <TrackOptionsPopover track={track} /> 
                        <button 
                          onClick={(e) => { e.stopPropagation(); useCollectionStore.getState().toggleLike(track); }} 
                          className={`p-1.5 rounded-lg hover:bg-white/5 transition-colors ${isLiked ? 'text-[var(--accent)]' : 'text-[#777] hover:text-white'}`}
                          title={isLiked ? "Убрать из любимых" : "В любимые"}
                        >
                          <Heart size={16} strokeWidth={1.7} fill={isLiked ? "currentColor" : "none"} />
                        </button>
                        <PlaylistPopover track={track} />
                      </div>
                    </Reorder.Item>
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
        <div className="flex-1 h-full flex flex-col pl-10 pr-6 pt-8 pb-28 overflow-y-auto scrollbar-hide">
          {/* Back button */}
          <button
            onClick={() => setView('none')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/12 text-white/70 hover:text-white border border-white/10 text-xs font-semibold mb-6 w-fit transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
          >
            <ChevronLeft size={16} />
            Все коллекции
          </button>

          <div className="flex flex-col gap-6 mb-6 shrink-0">
            <div className="flex items-end gap-6">
              <div className="w-40 h-40 rounded-3xl bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
                <Cloud size={56} className="text-[var(--accent)]" strokeWidth={1.5} fill="currentColor" />
              </div>
              <div className="flex flex-col pb-2">
                <h1 className="text-5xl font-bold text-[var(--text-main)] mb-2 tracking-tight">Скачанные</h1>
                <p className="text-[13px] text-[var(--text-secondary)] font-medium">{downloadedTracks.length} треков</p>
              </div>
            </div>

            <ActionPills>
              {downloadedTracks.length > 0 && (
                <button 
                  onClick={handlePlayDownloaded}
                  className="flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] rounded-full font-bold transition-colors text-sm mr-2"
                >
                  {isDownloadedPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                  Играть все
                </button>
              )}
              
              <PillGroup>
                <PillButton icon={<FilePlus size={16} strokeWidth={2}/>} onClick={handleAddLocalFiles} />
                <PillButton icon={<FolderPlus size={16} strokeWidth={2}/>} onClick={handleAddLocalFolder} />
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
                    <Reorder.Item
                      key={track.id}
                      value={track}
                      onDragStart={() => setDraggedTrackId(track.id)}
                      onDragEnd={() => setDraggedTrackId(null)}
                      onClick={() => { if (isActive) togglePlayPause(); else { playContext(downloadedTracks, index); } }}
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
                          className="text-[var(--text-secondary)] opacity-30 group-hover:opacity-100 hover:text-[var(--accent)] cursor-grab active:cursor-grabbing p-1 transition-opacity shrink-0"
                          title="Перетащить трек"
                        >
                          <GripVertical size={16} />
                        </div>
                        <div 
                          className="relative w-10 h-10 overflow-hidden shrink-0 bg-[var(--bg-surface-hover)] rounded-lg group/cover"
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <MediaCover src={coverUrl} alt={track.title} className="w-full h-full object-cover" />
                          <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${isActive ? 'opacity-100 bg-black/40' : 'opacity-0 group-hover/cover:opacity-100 bg-black/40'}`}>
                            {isActive ? <PlayingIndicator isPaused={!isPlaying} /> : <div className="w-6 h-6 bg-[var(--accent)] rounded-full flex items-center justify-center shadow-md"><Play size={10} fill="currentColor" className="text-[var(--accent-contrast)] ml-0.5" /></div>}
                          </div>
                        </div>
                        <div className="flex flex-col truncate min-w-0">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className={`font-medium text-[14px] truncate track-title ${isActive ? 'text-[var(--accent)] font-semibold' : 'text-[#e0e0e0] group-hover:text-[var(--text-main)]'}`}>{track.title}</span>
                            {cachedTracks[track.id] && (
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
                      <div 
                        className="flex items-center gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                        onPointerDown={(e) => e.stopPropagation()}
                      > 
                        <TrackOptionsPopover track={track} /> 
                        <button 
                          onClick={(e) => { e.stopPropagation(); useCollectionStore.getState().toggleLike(track); }} 
                          className={`p-1.5 rounded-lg hover:bg-white/5 transition-colors ${isLiked ? 'text-[var(--accent)]' : 'text-[#777] hover:text-white'}`}
                          title={isLiked ? "Убрать из любимых" : "В любимые"}
                        >
                          <Heart size={16} strokeWidth={1.7} fill={isLiked ? "currentColor" : "none"} />
                        </button>
                        <PlaylistPopover track={track} />
                        <button 
                          onClick={(e) => { e.stopPropagation(); useCollectionStore.getState().removeDownloadedTrack(track.id); }} 
                          className="p-1.5 rounded-lg hover:bg-white/5 text-[#777] hover:text-[var(--accent)] transition-colors" 
                          title="Удалить"
                        >
                          <Minus size={16} strokeWidth={1.8} />
                        </button>
                      </div>
                    </Reorder.Item>
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
        <div className="flex-1 h-full flex flex-col pl-10 pr-6 pt-8 pb-28 overflow-y-auto scrollbar-hide">
          {/* Back button */}
          <button
            onClick={() => setView('none')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/12 text-white/70 hover:text-white border border-white/10 text-xs font-semibold mb-6 w-fit transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
          >
            <ChevronLeft size={16} />
            Все коллекции
          </button>

          <div className="flex flex-col gap-6 mb-6 shrink-0">
            <div className="flex items-end gap-6">
              <div 
                onClick={handleImageSelect}
                className="w-40 h-40 shrink-0 rounded-3xl overflow-hidden bg-[var(--bg-surface-hover)] shadow-lg relative group cursor-pointer"
                title="Нажмите, чтобы изменить обложку"
              >
                <MediaCover src={playlist.coverUrl || defaultCoverUrl} alt={playlist.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              </div>
              <div className="flex flex-col pb-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-5xl font-bold text-[var(--text-main)] mb-2 tracking-tight">{playlist.name}</h1>
                  <button onClick={() => openCreatePlaylist('Изменить название', playlist.name, (name) => updatePlaylist(playlist.id, { name }))} className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-all bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface-hover)] rounded-full mb-2">
                    <Pencil size={18} />
                  </button>
                </div>
                <p className="text-[13px] text-[var(--text-secondary)] font-medium">{playlist.tracks.length} треков</p>
              </div>
            </div>

            <ActionPills>
              <button 
                onClick={handlePlayPlaylist}
                className="flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] rounded-full font-bold transition-colors text-sm mr-2"
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
                    <Reorder.Item
                      key={track.id}
                      value={track}
                      onDragStart={() => setDraggedTrackId(track.id)}
                      onDragEnd={() => setDraggedTrackId(null)}
                      onClick={() => { if (isActive) togglePlayPause(); else { playContext(playlist.tracks, index); } }}
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
                          className="text-[var(--text-secondary)] opacity-30 group-hover:opacity-100 hover:text-[var(--accent)] cursor-grab active:cursor-grabbing p-1 transition-opacity shrink-0"
                          title="Перетащить трек"
                        >
                          <GripVertical size={16} />
                        </div>
                        <div 
                          className="relative w-10 h-10 overflow-hidden shrink-0 bg-[var(--bg-surface-hover)] rounded-lg group/cover"
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <MediaCover src={coverUrl} alt={track.title} className="w-full h-full object-cover" />
                          <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${isActive ? 'opacity-100 bg-black/40' : 'opacity-0 group-hover/cover:opacity-100 bg-black/40'}`}>
                            {isActive ? <PlayingIndicator isPaused={!isPlaying} /> : <div className="w-6 h-6 bg-[var(--accent)] rounded-full flex items-center justify-center shadow-md"><Play size={10} fill="currentColor" className="text-[var(--accent-contrast)] ml-0.5" /></div>}
                          </div>
                        </div>
                        <div className="flex flex-col truncate min-w-0">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className={`font-medium text-[14px] truncate track-title ${isActive ? 'text-[var(--accent)] font-semibold' : 'text-[#e0e0e0] group-hover:text-[var(--text-main)]'}`}>{track.title}</span>
                            {cachedTracks[track.id] && (
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
                      <div 
                        className="flex items-center gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                        onPointerDown={(e) => e.stopPropagation()}
                      > 
                        <TrackOptionsPopover track={track} /> 
                        <button 
                          onClick={(e) => { e.stopPropagation(); useCollectionStore.getState().toggleLike(track); }} 
                          className={`p-1.5 rounded-lg hover:bg-white/5 transition-colors ${isLiked ? 'text-[var(--accent)]' : 'text-[#777] hover:text-white'}`}
                          title={isLiked ? "Убрать из любимых" : "В любимые"}
                        >
                          <Heart size={16} strokeWidth={1.7} fill={isLiked ? "currentColor" : "none"} />
                        </button>
                        <PlaylistPopover track={track} />
                        <button 
                          onClick={(e) => { e.stopPropagation(); useCollectionStore.getState().removeTrackFromPlaylist(playlist.id, track.id); }} 
                          className="p-1.5 rounded-lg hover:bg-white/5 text-[#777] hover:text-[var(--accent)] transition-colors" 
                          title="Удалить из плейлиста"
                        >
                          <Minus size={16} strokeWidth={1.8} />
                        </button>
                      </div>
                    </Reorder.Item>
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
    <div className="w-full h-full flex flex-col md:flex-row bg-transparent relative overflow-hidden pt-16 sm:pt-16 md:pt-0">
      {renderTopBar()}
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
