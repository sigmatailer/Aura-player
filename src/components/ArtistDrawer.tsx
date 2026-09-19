import React, { useState, useEffect } from 'react';
import { 
  X, Play, Pause, Heart, Shuffle, Disc3, 
  ChevronLeft, ChevronDown, Loader2, Sparkles, FolderHeart, Music
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useArtistStore } from '../store/useArtistStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useCollectionStore } from '../store/useCollectionStore';
import { useSettingsStore } from '../store/usePlayerStore';
import { useThemeStore } from '../store/useThemeStore';
import { Track } from '../types';
import { TrackOptionsPopover } from './TrackOptionsPopover';
import { PlaylistPopover } from './PlaylistPopover';
import { parseArtistNames } from './ArtistLinks';

interface AlbumSummary {
  id: string;
  title: string;
  year?: number;
  type?: string;
  coverUrl: string;
  trackCount: number;
}

interface ArtistDetails {
  id: string;
  name: string;
  coverUrl: string | null;
  genres: string[];
  likesCount?: number;
  popularTracks: Track[];
  albums: AlbumSummary[];
}

type ArtistTab = 'popular' | 'albums' | 'allTracks';

export const ArtistDrawer: React.FC = () => {
  const { isOpen, artistName, artistId, viewMode, closeArtist } = useArtistStore();
  const { playContext, currentTrackIndex, isPlaying, togglePlayPause, queue } = usePlayerStore();
  const { likedTracks, toggleLike, downloadedTracks } = useCollectionStore();
  const yaToken = useSettingsStore(state => state.yandexToken);
  const { customWallpaper } = useThemeStore();

  const [isLoading, setIsLoading] = useState(false);
  const [artistDetails, setArtistDetails] = useState<ArtistDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<ArtistTab>('popular');

  // All tracks state (paginated)
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [allTracksTotal, setAllTracksTotal] = useState<number | null>(null);
  const [allTracksPage, setAllTracksPage] = useState(0);
  const [isLoadingAllTracks, setIsLoadingAllTracks] = useState(false);
  const [hasMoreTracks, setHasMoreTracks] = useState(false);

  // Album view inside drawer
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumSummary | null>(null);
  const [albumTracks, setAlbumTracks] = useState<Track[]>([]);
  const [isLoadingAlbum, setIsLoadingAlbum] = useState(false);

  // Helper to normalize cover url safely
  const normalizeCoverUri = (uri?: string) => {
    if (!uri) return '';
    let clean = uri.replace('%%', '600x600');
    if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
    return `https://${clean}`;
  };

  // Helper to map Yandex track object to Aura Track
  const mapYandexTrack = (item: any): Track => {
    const rawCover = item.coverUri || item.ogImage || item.cover?.uri || item.albums?.[0]?.coverUri;
    const coverUrl = rawCover ? normalizeCoverUri(rawCover) : null;

    return {
      id: `ya_${item.id}`,
      filePath: `yandex:${item.id}`,
      title: item.title,
      artist: item.artists?.[0]?.name || artistName || 'Unknown Artist',
      album: item.albums?.[0]?.title || 'Сингл / Альбом',
      duration: Math.floor((item.durationMs || 0) / 1000),
      originalCoverUrl: coverUrl,
      customCoverPath: null
    };
  };

  // Fetch paginated all tracks
  const fetchAllTracks = async (page: number, append: boolean = false) => {
    if (!artistDetails?.id) return;
    setIsLoadingAllTracks(true);
    try {
      const res: string = await invoke('yandex_api_request', {
        url: `https://api.music.yandex.net/artists/${artistDetails.id}/tracks?page=${page}&pageSize=50`,
        token: yaToken || ''
      });
      const data = JSON.parse(res);
      if (data.result?.tracks) {
        const mapped = data.result.tracks.map(mapYandexTrack);
        if (append) {
          setAllTracks(prev => [...prev, ...mapped]);
        } else {
          setAllTracks(mapped);
        }
        const total = data.result.pager?.total ?? mapped.length;
        setAllTracksTotal(total);
        setAllTracksPage(page);
        setHasMoreTracks((page + 1) * 50 < total);
      }
    } catch (err) {
      console.error('Failed to fetch all tracks for artist:', err);
    } finally {
      setIsLoadingAllTracks(false);
    }
  };

  // Fetch artist profile when opened
  useEffect(() => {
    if (!isOpen || !artistName) {
      setArtistDetails(null);
      setSelectedAlbum(null);
      setAlbumTracks([]);
      setAllTracks([]);
      setAllTracksTotal(null);
      setAllTracksPage(0);
      setHasMoreTracks(false);
      setActiveTab('popular');
      setError(null);
      return;
    }

    let isMounted = true;
    const fetchArtistData = async () => {
      setIsLoading(true);
      setError(null);
      setSelectedAlbum(null);
      setAlbumTracks([]);
      setAllTracks([]);
      setAllTracksTotal(null);
      setAllTracksPage(0);
      setHasMoreTracks(false);
      setActiveTab('popular');

      try {
        let foundArtistId = artistId;
        let initialCover = '';
        let initialGenres: string[] = [];

        // 1. If artistId not provided, search for artist by name
        if (!foundArtistId) {
          const searchRes: string = await invoke('yandex_api_request', {
            url: `https://api.music.yandex.net/search?type=artist&text=${encodeURIComponent(artistName)}&page=0`,
            token: yaToken || ''
          });

          const searchData = JSON.parse(searchRes);
          let firstArtist = searchData.result?.artists?.results?.[0];

          // If no artist found and artistName contains multiple artists (e.g. feat / comma):
          if (!firstArtist) {
            const subArtists = parseArtistNames(artistName);
            for (const sub of subArtists) {
              if (sub !== artistName) {
                try {
                  const sRes: string = await invoke('yandex_api_request', {
                    url: `https://api.music.yandex.net/search?type=artist&text=${encodeURIComponent(sub)}&page=0`,
                    token: yaToken || ''
                  });
                  const sData = JSON.parse(sRes);
                  if (sData.result?.artists?.results?.[0]) {
                    firstArtist = sData.result.artists.results[0];
                    break;
                  }
                } catch (e) {}
              }
            }
          }

          if (firstArtist) {
            foundArtistId = String(firstArtist.id);
            if (firstArtist.cover?.uri) {
              initialCover = normalizeCoverUri(firstArtist.cover.uri);
            }
            if (Array.isArray(firstArtist.genres)) {
              initialGenres = firstArtist.genres;
            }
          }
        }

        if (!foundArtistId) {
          if (isMounted) {
            // No artist ID found on Yandex Music: fallback to local library tracks
            setArtistDetails({
              id: '',
              name: artistName,
              coverUrl: null,
              genres: [],
              popularTracks: [],
              albums: []
            });
            setIsLoading(false);
          }
          return;
        }

        // 2. Fetch brief-info for full popular tracks & direct albums
        const briefRes: string = await invoke('yandex_api_request', {
          url: `https://api.music.yandex.net/artists/${foundArtistId}/brief-info`,
          token: yaToken || ''
        });

        const briefData = JSON.parse(briefRes);
        const result = briefData.result;

        if (result && isMounted) {
          const art = result.artist || {};
          const coverUri = art.cover?.uri || art.ogImage;
          const coverUrl = coverUri ? normalizeCoverUri(coverUri) : (initialCover || null);
          const genres = (art.genres && art.genres.length > 0) ? art.genres : initialGenres;
          const popularTracks: Track[] = (result.popularTracks || []).map(mapYandexTrack);

          const albums: AlbumSummary[] = (result.albums || []).map((a: any) => ({
            id: String(a.id),
            title: a.title,
            year: a.year,
            type: a.type,
            coverUrl: a.coverUri ? normalizeCoverUri(a.coverUri) : '',
            trackCount: a.trackCount || 0
          }));

          setArtistDetails({
            id: foundArtistId,
            name: art.name || artistName,
            coverUrl,
            genres,
            likesCount: art.likesCount,
            popularTracks,
            albums
          });

          // 3. Prefetch page 0 of all tracks for instant tab switching and exact total count badge
          try {
            const tracksRes: string = await invoke('yandex_api_request', {
              url: `https://api.music.yandex.net/artists/${foundArtistId}/tracks?page=0&pageSize=50`,
              token: yaToken || ''
            });
            const tracksData = JSON.parse(tracksRes);
            if (tracksData.result?.tracks && isMounted) {
              const mapped = tracksData.result.tracks.map(mapYandexTrack);
              setAllTracks(mapped);
              const total = tracksData.result.pager?.total ?? mapped.length;
              setAllTracksTotal(total);
              setAllTracksPage(0);
              setHasMoreTracks(50 < total);
            }
          } catch (e) {
            console.error('Failed to prefetch all tracks for artist:', e);
          }
        }
      } catch (err: any) {
        console.error('Failed to load artist details:', err);
        if (isMounted) {
          setError('Не удалось загрузить данные об артисте');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchArtistData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, artistName, artistId, yaToken]);

  // Handle album click: fetch tracks of the album
  const handleOpenAlbum = async (album: AlbumSummary) => {
    setSelectedAlbum(album);
    setIsLoadingAlbum(true);
    try {
      const albumRes: string = await invoke('yandex_api_request', {
        url: `https://api.music.yandex.net/albums/${album.id}/with-tracks`,
        token: yaToken || ''
      });
      const albumData = JSON.parse(albumRes);
      if (albumData.result?.volumes) {
        const flat = albumData.result.volumes.flat();
        const mapped = flat.map(mapYandexTrack);
        setAlbumTracks(mapped);
      }
    } catch (err) {
      console.error('Failed to load album tracks:', err);
    } finally {
      setIsLoadingAlbum(false);
    }
  };

  // Tracks in user's library by this artist
  const normalizedArtist = (artistName || '').toLowerCase().trim();
  const libraryTracks = [
    ...(likedTracks || []),
    ...(downloadedTracks || [])
  ].filter((t, index, self) => 
    t.artist.toLowerCase().trim().includes(normalizedArtist) &&
    self.findIndex(x => x.id === t.id) === index
  );

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeArtist();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeArtist]);

  if (!isOpen) return null;

  const currentTrack = currentTrackIndex >= 0 && queue[currentTrackIndex] ? queue[currentTrackIndex] : null;

  const isTrackPlaying = (trackId: string) => {
    return currentTrack?.id === trackId && isPlaying;
  };

  const isTrackCurrent = (trackId: string) => {
    return currentTrack?.id === trackId;
  };

  const isLiked = (trackId: string) => {
    return likedTracks.some(t => t.id === trackId);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const isAlbumContext = !!(currentTrack && albumTracks.length > 0 && albumTracks.some(t => t.id === currentTrack.id));
  const isAlbumPlaying = isAlbumContext && isPlaying;

  const handleTogglePlayAlbum = () => {
    if (albumTracks.length === 0) return;
    if (isAlbumContext) {
      togglePlayPause();
    } else {
      playContext(albumTracks, 0);
    }
  };

  const isTopContext = !!(currentTrack && artistDetails?.popularTracks && artistDetails.popularTracks.length > 0 && artistDetails.popularTracks.some(t => t.id === currentTrack.id));
  const isTopPlaying = isTopContext && isPlaying;

  const handleTogglePlayTop = () => {
    if (!artistDetails?.popularTracks || artistDetails.popularTracks.length === 0) return;
    if (isTopContext) {
      togglePlayPause();
    } else {
      playContext(artistDetails.popularTracks, 0);
    }
  };

  const isAllContext = !!(currentTrack && allTracks.length > 0 && allTracks.some(t => t.id === currentTrack.id));
  const isAllPlaying = isAllContext && isPlaying;

  const handleTogglePlayAll = () => {
    if (allTracks.length === 0) return;
    if (isAllContext) {
      togglePlayPause();
    } else {
      playContext(allTracks, 0);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[10000] flex w-full h-full p-0 m-0 overflow-hidden">
        {/* Slide-over Drawer or Centered Modal - Fullscreen on Android */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          className={`relative z-50 flex flex-col w-full h-full rounded-none border-0 overflow-hidden select-none ${
            customWallpaper 
              ? 'bg-[var(--bg-main)]/90 backdrop-blur-2xl text-[var(--text-main)]' 
              : 'bg-[var(--bg-main)] text-[var(--text-main)]'
          }`}
        >
          {/* Close button Top-Right */}
          <button 
            onClick={closeArtist}
            className="absolute top-11 right-4 md:top-4 md:right-4 z-50 w-10 h-10 rounded-full flex items-center justify-center bg-black/50 hover:bg-black/70 text-white border border-white/20 backdrop-blur-md transition-all cursor-pointer shadow-xl active:scale-95"
          >
            <X size={20} />
          </button>

          {/* If inside an album view */}
          {selectedAlbum ? (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Back to artist button */}
              <div className="p-4 pt-11 md:pt-4 flex items-center gap-3 border-b border-[var(--border-main)] bg-[var(--bg-surface)]/40 shrink-0">
                <button 
                  onClick={() => {
                    setSelectedAlbum(null);
                    setAlbumTracks([]);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--bg-surface-hover)] border border-[var(--border-main)] hover:border-[var(--accent)] text-[var(--text-main)] transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  <ChevronLeft size={16} />
                  К дискографии артиста
                </button>
              </div>

              {/* Album Header */}
              <div className="p-6 flex items-center gap-5 border-b border-[var(--border-main)] bg-[var(--bg-surface)]/20 shrink-0">
                <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden shadow-2xl border border-[var(--border-main)] shrink-0 bg-black/30">
                  {selectedAlbum.coverUrl ? (
                    <img src={selectedAlbum.coverUrl} alt={selectedAlbum.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                      <Disc3 size={36} />
                    </div>
                  )}
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                    {selectedAlbum.type === 'single' ? 'Сингл' : 'Релиз / Альбом'} {selectedAlbum.year ? `• ${selectedAlbum.year}` : ''}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text-main)] truncate mt-1">
                    {selectedAlbum.title}
                  </h2>
                  <span className="text-xs text-[var(--text-secondary)] mt-1">
                    {artistDetails?.name || artistName}
                  </span>

                  {albumTracks.length > 0 && (
                    <button 
                      onClick={handleTogglePlayAlbum}
                      className="mt-4 self-start flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold hover:brightness-110 transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                      {isAlbumPlaying ? (
                        <>
                          <Pause size={14} fill="currentColor" />
                          Пауза
                        </>
                      ) : (
                        <>
                          <Play size={14} fill="currentColor" />
                          {isAlbumContext ? 'Продолжить' : `Слушать альбом (${albumTracks.length})`}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Album Tracks List */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide p-5 space-y-1 min-h-0">
                {isLoadingAlbum ? (
                  <div className="py-16 flex flex-col items-center justify-center text-[var(--text-secondary)]">
                    <Loader2 size={32} className="animate-spin text-[var(--accent)] mb-3" />
                    <span className="text-xs">Загрузка треков альбома...</span>
                  </div>
                ) : albumTracks.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
                    Треки не найдены
                  </div>
                ) : (
                  albumTracks.map((track, idx) => {
                    const isCurrent = isTrackCurrent(track.id);
                    const isPlayingTrack = isTrackPlaying(track.id);
                    const liked = isLiked(track.id);

                    return (
                      <div 
                        key={track.id}
                        onClick={() => isCurrent ? togglePlayPause() : playContext(albumTracks, idx)}
                        className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                          isCurrent 
                            ? 'bg-[var(--bg-surface-hover)] border border-[var(--accent)]/50 shadow-sm' 
                            : 'hover:bg-[var(--bg-surface-hover)]/60 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-5 text-center text-xs text-[var(--text-secondary)] shrink-0 font-mono">
                            {isCurrent ? (
                              <span className="text-[var(--accent)] font-bold">
                                {isPlayingTrack ? '▶' : '⏸'}
                              </span>
                            ) : (
                              idx + 1
                            )}
                          </span>

                          <div className="flex flex-col min-w-0 flex-1">
                            <span className={`text-xs font-semibold truncate ${isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-main)]'}`}>
                              {track.title}
                            </span>
                            <span className="text-[11px] text-[var(--text-secondary)] truncate">
                              {track.artist}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLike(track);
                            }}
                            className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                          >
                            <Heart size={15} fill={liked ? 'var(--accent)' : 'none'} color={liked ? 'var(--accent)' : 'currentColor'} />
                          </button>

                          <div onClick={(e) => e.stopPropagation()}>
                            <PlaylistPopover track={track} />
                          </div>

                          <div onClick={(e) => e.stopPropagation()}>
                            <TrackOptionsPopover track={track} direction="down" />
                          </div>

                          <span className="text-[11px] text-[var(--text-secondary)] font-mono ml-1 w-9 text-right">
                            {formatDuration(track.duration)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* Artist Profile View */
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Pinned Top Section: Hero Banner & Navigation Tabs */}
              <div className="shrink-0 flex flex-col bg-[var(--bg-main)]">
                {/* Hero Banner Header */}
                <div className="relative h-56 sm:h-64 w-full shrink-0 overflow-hidden bg-[var(--bg-surface)]">
                  {artistDetails?.coverUrl ? (
                    <img 
                      src={artistDetails.coverUrl} 
                      alt={artistName || ''} 
                      className="w-full h-full object-cover scale-105 filter brightness-75"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--bg-surface)] to-[var(--bg-surface-hover)]">
                      <Disc3 size={64} className="text-[var(--text-secondary)]/30 animate-pulse" />
                    </div>
                  )}

                  {/* Gradient fade downwards into the drawer background */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-main)] via-[var(--bg-main)]/60 to-black/20" />

                  {/* Hero Information */}
                  <div className="absolute bottom-4 left-5 right-5 flex flex-col">
                    {artistDetails?.genres && artistDetails.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {artistDetails.genres.slice(0, 3).map((g, idx) => (
                          <span 
                            key={idx}
                            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/50 border border-white/10 text-white/90 backdrop-blur-md"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    )}

                    <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight drop-shadow-md">
                      {artistDetails?.name || artistName}
                    </h1>

                    {parseArtistNames(artistName || undefined).length > 1 && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        <span className="text-[11px] text-white/70 font-medium">Исполнители:</span>
                        {parseArtistNames(artistName || undefined).map((a, idx) => {
                          const isCurrent = (artistDetails?.name || '').toLowerCase() === a.toLowerCase();
                          return (
                            <button
                              key={idx}
                              onClick={() => useArtistStore.getState().openArtist(a, null, viewMode)}
                              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                                isCurrent 
                                  ? 'bg-[var(--accent)] text-white shadow-sm ring-1 ring-white/30' 
                                  : 'bg-white/15 text-white/80 hover:bg-white/25 hover:text-white'
                              }`}
                            >
                              {a}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {artistDetails?.likesCount !== undefined && artistDetails.likesCount > 0 && (
                      <span className="text-xs text-white/70 mt-0.5 flex items-center gap-1.5 font-medium">
                        <Heart size={12} className="text-[var(--accent)]" fill="currentColor" />
                        {artistDetails.likesCount.toLocaleString()} слушателей на Яндекс Музыке
                      </span>
                    )}

                    {/* Play all / Shuffle buttons */}
                    {artistDetails && artistDetails.popularTracks.length > 0 && (
                      <div className="flex items-center gap-2.5 mt-3.5">
                        <button 
                          onClick={handleTogglePlayTop}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold hover:brightness-110 transition-all shadow-md active:scale-95 cursor-pointer"
                        >
                          {isTopPlaying ? (
                            <>
                              <Pause size={14} fill="currentColor" />
                              Пауза
                            </>
                          ) : (
                            <>
                              <Play size={14} fill="currentColor" />
                              {isTopContext ? 'Продолжить' : `Слушать топ (${artistDetails.popularTracks.length})`}
                            </>
                          )}
                        </button>

                        <button 
                          onClick={() => {
                            const shuffled = [...artistDetails.popularTracks].sort(() => 0.5 - Math.random());
                            playContext(shuffled, 0);
                          }}
                          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-black/50 hover:bg-black/70 border border-white/15 text-white text-xs font-semibold backdrop-blur-md transition-all shadow-md active:scale-95 cursor-pointer"
                        >
                          <Shuffle size={14} />
                          Перемешать
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Navigation Tabs (Pinned) */}
                <div className="px-5 sm:px-6 pt-3 pb-3 border-b border-[var(--border-main)] flex items-center gap-2 shrink-0 bg-[var(--bg-main)]/95 backdrop-blur-md z-10">
                  <button 
                    onClick={() => setActiveTab('popular')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      activeTab === 'popular'
                        ? 'bg-[var(--accent)] text-white shadow-sm'
                        : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    <Sparkles size={13} />
                    Популярные
                  </button>

                  <button 
                    onClick={() => setActiveTab('albums')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      activeTab === 'albums'
                        ? 'bg-[var(--accent)] text-white shadow-sm'
                        : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    <Disc3 size={13} />
                    Альбомы {artistDetails?.albums && artistDetails.albums.length > 0 ? `(${artistDetails.albums.length})` : ''}
                  </button>

                  <button 
                    onClick={() => {
                      setActiveTab('allTracks');
                      if (allTracks.length === 0 && artistDetails?.id) {
                        fetchAllTracks(0, false);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      activeTab === 'allTracks'
                        ? 'bg-[var(--accent)] text-white shadow-sm'
                        : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    <Music size={13} />
                    Все треки {allTracksTotal !== null ? `(${allTracksTotal})` : allTracks.length > 0 ? `(${allTracks.length})` : ''}
                  </button>
                </div>
              </div>

              {/* Scrollable Tab Content */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide p-5 sm:p-6 min-h-0 space-y-6">
                {isLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center text-[var(--text-secondary)]">
                    <Loader2 size={36} className="animate-spin text-[var(--accent)] mb-3" />
                    <span className="text-xs font-medium">Загрузка данных артиста...</span>
                  </div>
                ) : error ? (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">
                    {error}
                  </div>
                ) : (
                  <>
                    {/* Tab: Popular */}
                    {activeTab === 'popular' && (
                      <div className="space-y-7">
                        {artistDetails && artistDetails.popularTracks.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                                <Sparkles size={14} className="text-[var(--accent)]" />
                                Популярные треки
                              </span>
                              <span className="text-[11px] text-[var(--text-secondary)]">
                                Топ {artistDetails.popularTracks.length}
                              </span>
                            </div>

                            <div className="space-y-1">
                              {artistDetails.popularTracks.map((track, idx) => {
                                const isCurrent = isTrackCurrent(track.id);
                                const isPlayingTrack = isTrackPlaying(track.id);
                                const liked = isLiked(track.id);

                                return (
                                  <div 
                                    key={track.id}
                                    onClick={() => isCurrent ? togglePlayPause() : playContext(artistDetails.popularTracks, idx)}
                                    className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                                      isCurrent 
                                        ? 'bg-[var(--bg-surface-hover)] border border-[var(--accent)]/50 shadow-sm' 
                                        : 'hover:bg-[var(--bg-surface-hover)]/60 border border-transparent'
                                    }`}
                                  >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      {/* Cover or Play icon */}
                                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 relative bg-black/40 border border-[var(--border-main)] shadow-sm">
                                        {track.originalCoverUrl ? (
                                          <img src={track.originalCoverUrl} alt={track.title} className="w-full h-full object-cover" />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                                            <Disc3 size={16} />
                                          </div>
                                        )}
                                        <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                                          isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                        }`}>
                                          {isPlayingTrack ? (
                                            <Pause size={14} className="text-[var(--accent)]" fill="currentColor" />
                                          ) : (
                                            <Play size={14} className="text-[var(--accent)] ml-0.5" fill="currentColor" />
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex flex-col min-w-0 flex-1">
                                        <span className={`text-xs font-semibold truncate ${isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-main)]'}`}>
                                          {track.title}
                                        </span>
                                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                                          {track.album || track.artist}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleLike(track);
                                        }}
                                        className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                                      >
                                        <Heart size={15} fill={liked ? 'var(--accent)' : 'none'} color={liked ? 'var(--accent)' : 'currentColor'} />
                                      </button>

                                      <div onClick={(e) => e.stopPropagation()}>
                                        <PlaylistPopover track={track} />
                                      </div>

                                      <div onClick={(e) => e.stopPropagation()}>
                                        <TrackOptionsPopover track={track} direction="down" />
                                      </div>

                                      <span className="text-[11px] text-[var(--text-secondary)] font-mono ml-1 w-9 text-right">
                                        {formatDuration(track.duration)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Section: In Your Library */}
                        {libraryTracks.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                                <FolderHeart size={14} className="text-[var(--accent)]" />
                                В вашей медиатеке ({libraryTracks.length})
                              </span>
                            </div>

                            <div className="space-y-1">
                              {libraryTracks.map((track, idx) => {
                                const isCurrent = isTrackCurrent(track.id);
                                const isPlayingTrack = isTrackPlaying(track.id);
                                const liked = isLiked(track.id);

                                return (
                                  <div 
                                    key={track.id}
                                    onClick={() => isCurrent ? togglePlayPause() : playContext(libraryTracks, idx)}
                                    className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                                      isCurrent 
                                        ? 'bg-[var(--bg-surface-hover)] border border-[var(--accent)]/50 shadow-sm' 
                                        : 'hover:bg-[var(--bg-surface-hover)]/60 border border-transparent'
                                    }`}
                                  >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 relative bg-black/40 border border-[var(--border-main)]">
                                        {track.originalCoverUrl ? (
                                          <img src={track.originalCoverUrl} alt={track.title} className="w-full h-full object-cover" />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                                            <Disc3 size={15} />
                                          </div>
                                        )}
                                        <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                                          isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                        }`}>
                                          {isPlayingTrack ? (
                                            <Pause size={13} className="text-[var(--accent)]" fill="currentColor" />
                                          ) : (
                                            <Play size={13} className="text-[var(--accent)] ml-0.5" fill="currentColor" />
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex flex-col min-w-0 flex-1">
                                        <span className={`text-xs font-semibold truncate ${isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-main)]'}`}>
                                          {track.title}
                                        </span>
                                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                                          {track.album || track.artist}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleLike(track);
                                        }}
                                        className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                                      >
                                        <Heart size={15} fill={liked ? 'var(--accent)' : 'none'} color={liked ? 'var(--accent)' : 'currentColor'} />
                                      </button>

                                      <div onClick={(e) => e.stopPropagation()}>
                                        <PlaylistPopover track={track} />
                                      </div>

                                      <div onClick={(e) => e.stopPropagation()}>
                                        <TrackOptionsPopover track={track} direction="down" />
                                      </div>

                                      <span className="text-[11px] text-[var(--text-secondary)] font-mono ml-1 w-9 text-right">
                                        {formatDuration(track.duration)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab: Albums */}
                    {activeTab === 'albums' && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                            <Disc3 size={14} className="text-[var(--accent)]" />
                            Альбомы и релизы ({artistDetails?.albums.length || 0})
                          </span>
                        </div>

                        {artistDetails && artistDetails.albums.length > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {artistDetails.albums.map((album) => (
                              <div 
                                key={album.id}
                                onClick={() => handleOpenAlbum(album)}
                                className="group p-2.5 rounded-2xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-main)] hover:border-[var(--accent)]/50 cursor-pointer transition-all flex flex-col shadow-sm active:scale-98"
                              >
                                <div className="aspect-square w-full rounded-xl overflow-hidden bg-black/40 border border-[var(--border-main)] relative mb-2 shadow-inner">
                                  {album.coverUrl ? (
                                    <img 
                                      src={album.coverUrl} 
                                      alt={album.title} 
                                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                                      <Disc3 size={32} />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <div className="w-9 h-9 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-lg transform translate-y-1 group-hover:translate-y-0 transition-all">
                                      <Play size={16} fill="currentColor" className="ml-0.5" />
                                    </div>
                                  </div>
                                </div>

                                <span className="text-xs font-bold text-[var(--text-main)] truncate block">
                                  {album.title}
                                </span>
                                <span className="text-[10px] text-[var(--text-secondary)] mt-0.5 block truncate">
                                  {album.type === 'single' ? 'Сингл' : 'Альбом'} {album.year ? `• ${album.year}` : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
                            Альбомы не найдены
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab: All Tracks */}
                    {activeTab === 'allTracks' && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                            <Music size={14} className="text-[var(--accent)]" />
                            Все треки исполнителя
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                            {allTracksTotal !== null ? `Всего ${allTracksTotal}` : `${allTracks.length} треков`}
                          </span>
                        </div>

                        {allTracks.length > 0 && (
                          <div className="flex items-center gap-2.5 mb-4">
                            <button 
                              onClick={handleTogglePlayAll}
                              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[var(--accent)] text-white text-xs font-bold hover:brightness-110 transition-all shadow-sm active:scale-95 cursor-pointer"
                            >
                              {isAllPlaying ? (
                                <>
                                  <Pause size={13} fill="currentColor" />
                                  Пауза
                                </>
                              ) : (
                                <>
                                  <Play size={13} fill="currentColor" />
                                  {isAllContext ? 'Продолжить' : `Слушать все (${allTracks.length})`}
                                </>
                              )}
                            </button>

                            <button 
                              onClick={() => {
                                const shuffled = [...allTracks].sort(() => 0.5 - Math.random());
                                playContext(shuffled, 0);
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface-hover)]/80 border border-[var(--border-main)] text-[var(--text-main)] text-xs font-semibold transition-all shadow-sm active:scale-95 cursor-pointer"
                            >
                              <Shuffle size={13} />
                              Перемешать
                            </button>
                          </div>
                        )}

                        {isLoadingAllTracks && allTracks.length === 0 ? (
                          <div className="py-16 flex flex-col items-center justify-center text-[var(--text-secondary)]">
                            <Loader2 size={32} className="animate-spin text-[var(--accent)] mb-3" />
                            <span className="text-xs">Загрузка каталога треков...</span>
                          </div>
                        ) : allTracks.length === 0 ? (
                          <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
                            Треки не найдены
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {allTracks.map((track, idx) => {
                              const isCurrent = isTrackCurrent(track.id);
                              const isPlayingTrack = isTrackPlaying(track.id);
                              const liked = isLiked(track.id);

                              return (
                                <div 
                                  key={track.id + '_' + idx}
                                  onClick={() => isCurrent ? togglePlayPause() : playContext(allTracks, idx)}
                                  className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                                    isCurrent 
                                      ? 'bg-[var(--bg-surface-hover)] border border-[var(--accent)]/50 shadow-sm' 
                                      : 'hover:bg-[var(--bg-surface-hover)]/60 border border-transparent'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    {/* Cover thumbnail or Play icon */}
                                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 relative bg-black/40 border border-[var(--border-main)] shadow-sm">
                                      {track.originalCoverUrl ? (
                                        <img src={track.originalCoverUrl} alt={track.title} className="w-full h-full object-cover" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                                          <Disc3 size={16} />
                                        </div>
                                      )}
                                      <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                                        isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                      }`}>
                                        {isPlayingTrack ? (
                                          <Pause size={14} className="text-[var(--accent)]" fill="currentColor" />
                                        ) : (
                                          <Play size={14} className="text-[var(--accent)] ml-0.5" fill="currentColor" />
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex flex-col min-w-0 flex-1">
                                      <span className={`text-xs font-semibold truncate ${isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-main)]'}`}>
                                        {track.title}
                                      </span>
                                      <span className="text-[11px] text-[var(--text-secondary)] truncate">
                                        {track.album || track.artist}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleLike(track);
                                      }}
                                      className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                                    >
                                      <Heart size={15} fill={liked ? 'var(--accent)' : 'none'} color={liked ? 'var(--accent)' : 'currentColor'} />
                                    </button>

                                    <div onClick={(e) => e.stopPropagation()}>
                                      <PlaylistPopover track={track} />
                                    </div>

                                    <div onClick={(e) => e.stopPropagation()}>
                                      <TrackOptionsPopover track={track} direction="down" />
                                    </div>

                                    <span className="text-[11px] text-[var(--text-secondary)] font-mono ml-1 w-9 text-right">
                                      {formatDuration(track.duration)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Load more button */}
                            {hasMoreTracks && (
                              <div className="pt-3 pb-2 flex justify-center">
                                <button 
                                  disabled={isLoadingAllTracks}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    fetchAllTracks(allTracksPage + 1, true);
                                  }}
                                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-main)] text-xs font-semibold border border-[var(--border-main)] hover:border-[var(--accent)]/50 transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                                >
                                  {isLoadingAllTracks ? (
                                    <>
                                      <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
                                      Загрузка следующих треков...
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown size={14} />
                                      Показать ещё (следующие 50)
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
