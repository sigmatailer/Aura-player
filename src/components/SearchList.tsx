import React, { useState, useEffect, useRef } from 'react';
import { usePlayerStore, useSettingsStore } from '../store/usePlayerStore';
import { useCollectionStore } from '../store/useCollectionStore';
import { useModalStore } from '../store/useModalStore';
import { useArtistStore } from '../store/useArtistStore';
import { Play, Search, Loader2, Disc3, ListMusic, Music, Settings, Cloud, X, Heart, Plus, User, ChevronRight, Sparkles } from 'lucide-react';
import { PlaylistPopover } from './PlaylistPopover';
import { TrackOptionsPopover } from './TrackOptionsPopover';
import { PlayingIndicator } from './PlayingIndicator';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';

type SearchType = 'track' | 'album' | 'playlist' | 'artist';

interface SearchListProps {
  onOpenSettings?: () => void;
}

export const SearchList: React.FC<SearchListProps> = ({ onOpenSettings }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchType, setSearchType] = useState<SearchType>('track');
  const [loadingCollection, setLoadingCollection] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [searchNotice, setSearchNotice] = useState<{
    type: 'corrected' | 'artist_tracks' | 'hint';
    text: string;
    actionText?: string;
    onAction?: () => void;
  } | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;

    let target = el.scrollLeft;
    let isAnimating = false;

    const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

    const animate = () => {
      if (!el) return;
      el.scrollLeft = lerp(el.scrollLeft, target, 0.1);
      
      if (Math.abs(target - el.scrollLeft) > 0.5) {
        requestAnimationFrame(animate);
      } else {
        el.scrollLeft = target;
        isAnimating = false;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      target += e.deltaY * 2; // Умножаем для скорости
      target = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth));
      
      if (!isAnimating) {
        isAnimating = true;
        requestAnimationFrame(animate);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const { queue, addTrack, playTrack, playContext, currentTrackIndex, isPlaying, togglePlayPause } = usePlayerStore();
  const yaToken = useSettingsStore(state => state.yandexToken);
  const { likedTracks, toggleLike } = useCollectionStore();
  const { openAlert, openCreatePlaylist } = useModalStore();
  const setYaToken = useSettingsStore(state => state.setYandexToken);

  useEffect(() => {
    try {
      const history = localStorage.getItem('search_history');
      if (history) setSearchHistory(JSON.parse(history));
    } catch(e){}
  }, []);

  const handleLogout = () => {
    setYaToken(null);
    setResults([]);
    setQuery('');
    setHasSearched(false);
    setSearchedQuery('');
    setSearchNotice(null);
  };

  const removeHistoryItem = (itemToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSearchHistory(prev => {
      const newHistory = prev.filter(item => item !== itemToRemove);
      localStorage.setItem('search_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

    const mapResultsForType = (type: SearchType, items: any[]) => {
    if (type === 'track') {
      return items.map((item: any) => ({
        id: item.id.toString(),
        title: item.title,
        author: item.artists?.[0]?.name || 'Unknown Artist',
        lengthSeconds: Math.floor((item.durationMs || 0) / 1000),
        cover: item.coverUri ? `https://${item.coverUri.replace('%%', '200x200')}` : '',
        type: 'track'
      }));
    }
    if (type === 'album') {
      return items.map((item: any) => ({
        id: item.id.toString(),
        title: item.title,
        author: item.artists?.[0]?.name || 'Unknown Artist',
        cover: item.coverUri ? `https://${item.coverUri.replace('%%', '200x200')}` : '',
        trackCount: item.trackCount,
        type: 'album'
      }));
    }
    if (type === 'playlist') {
      return items.map((item: any) => ({
        id: item.kind.toString(),
        ownerUid: item.owner?.uid?.toString(),
        title: item.title,
        author: item.owner?.name || item.owner?.login || 'Unknown',
        cover: item.cover?.uri ? `https://${item.cover.uri.replace('%%', '200x200')}` : '',
        trackCount: item.trackCount,
        type: 'playlist'
      }));
    }
    if (type === 'artist') {
      return items.map((item: any) => {
        const rawCover = item.cover?.uri || item.ogImage;
        return {
          id: item.id.toString(),
          title: item.name,
          author: item.genres && item.genres.length > 0 ? item.genres.slice(0, 3).join(', ') : 'Исполнитель',
          cover: rawCover ? `https://${rawCover.replace('%%', '400x400')}` : '',
          trackCount: item.counts?.tracks || 0,
          albumCount: item.counts?.directAlbums || 0,
          type: 'artist'
        };
      });
    }
    return [];
  };

  const handleSearch = async (e?: React.FormEvent, overrideQuery?: string, forceType?: SearchType) => {
    if (e) e.preventDefault();
    const q = overrideQuery !== undefined ? overrideQuery : query;
    const activeType = forceType || searchType;
    if (!q.trim() || !yaToken) return;

    const qTrimmed = q.trim();
    setHasSearched(true);
    setSearchedQuery(qTrimmed);
    setSearchNotice(null);

    // Сохраняем в историю
    setSearchHistory(prev => {
      const filtered = prev.filter(item => item !== qTrimmed);
      const newHistory = [qTrimmed, ...filtered].slice(0, 10);
      localStorage.setItem('search_history', JSON.stringify(newHistory));
      return newHistory;
    });

    setIsSearching(true);
    setErrorMsg('');
    setResults([]);
    
    try {
      const response: string = await invoke('yandex_api_request', { 
        url: `https://api.music.yandex.net/search?type=${activeType}&text=${encodeURIComponent(qTrimmed)}&page=0`,
        token: yaToken
      });
      
      const data = JSON.parse(response);
      
      if (data.error) {
        if (data.error === 'not-authorized' || data.error.name === 'not-authorized') {
          handleLogout();
          throw new Error('Токен устарел или недействителен. Пожалуйста, получите новый токен в Настройках.');
        }
        throw new Error(data.error.message || 'Ошибка Yandex Music API');
      }

      let parsedResults: any[] = [];
      if (data.result) {
        const rawItems = data.result[activeType + 's']?.results;
        if (rawItems && rawItems.length > 0) {
          parsedResults = mapResultsForType(activeType, rawItems);
        }
      }

      // Умный поиск при 0 результатах: проверяем общий поиск (type=all)
      if (parsedResults.length === 0) {
        try {
          const allResStr: string = await invoke('yandex_api_request', {
            url: `https://api.music.yandex.net/search?type=all&text=${encodeURIComponent(qTrimmed)}&page=0`,
            token: yaToken
          });
          const allData = JSON.parse(allResStr);
          const allRes = allData.result;

          if (allRes) {
            // 1. Проверяем исправление опечаток от Яндекса
            if (allRes.misspellResult && allRes.misspellResult.toLowerCase() !== qTrimmed.toLowerCase()) {
              const corrected = allRes.misspellResult;
              const corrResStr: string = await invoke('yandex_api_request', {
                url: `https://api.music.yandex.net/search?type=${activeType}&text=${encodeURIComponent(corrected)}&page=0`,
                token: yaToken
              });
              const corrData = JSON.parse(corrResStr);
              const corrItems = corrData.result?.[activeType + 's']?.results;
              if (corrItems && corrItems.length > 0) {
                parsedResults = mapResultsForType(activeType, corrItems);
                setSearchNotice({
                  type: 'corrected',
                  text: `Показаны результаты по запросу «${corrected}»`
                });
              }
            }

            // 2. Если искали в "Треках", но треков нет, а найден артист (например: naafesisbouje -> Nafeesisboujee)
            if (parsedResults.length === 0 && activeType === 'track') {
              const bestArtist = allRes.best?.type === 'artist' ? allRes.best.result : allRes.artists?.results?.[0];
              if (bestArtist && bestArtist.name) {
                const artistTracksRes: string = await invoke('yandex_api_request', {
                  url: `https://api.music.yandex.net/search?type=track&text=${encodeURIComponent(bestArtist.name)}&page=0`,
                  token: yaToken
                });
                const artistTracksData = JSON.parse(artistTracksRes);
                const tracks = artistTracksData.result?.tracks?.results;
                if (tracks && tracks.length > 0) {
                  parsedResults = mapResultsForType('track', tracks);
                  setSearchNotice({
                    type: 'artist_tracks',
                    text: `Найден исполнитель «${bestArtist.name}». Показаны его треки:`,
                    actionText: 'Карточка артиста',
                    onAction: () => useArtistStore.getState().openArtist(bestArtist.name, bestArtist.id?.toString() || null, 'modal')
                  });
                }
              }
            }

            // 3. Если искали в "Артистах" и 0, но в allRes есть артист в best
            if (parsedResults.length === 0 && activeType === 'artist') {
              const bestArtist = allRes.best?.type === 'artist' ? allRes.best.result : allRes.artists?.results?.[0];
              if (bestArtist) {
                parsedResults = mapResultsForType('artist', [bestArtist]);
              }
            }

            // 4. Если в выбранном типе ничего нет, но есть в других разделах — подсказываем пользователю
            if (parsedResults.length === 0) {
              const availableCategories: string[] = [];
              if (allRes.tracks?.total > 0 && activeType !== 'track') availableCategories.push(`Треки (${allRes.tracks.total})`);
              if (allRes.artists?.total > 0 && activeType !== 'artist') availableCategories.push(`Артисты (${allRes.artists.total})`);
              if (allRes.albums?.total > 0 && activeType !== 'album') availableCategories.push(`Альбомы (${allRes.albums.total})`);
              if (allRes.playlists?.total > 0 && activeType !== 'playlist') availableCategories.push(`Плейлисты (${allRes.playlists.total})`);

              if (availableCategories.length > 0) {
                setSearchNotice({
                  type: 'hint',
                  text: `В этом разделе ничего нет. Найдено в других: ${availableCategories.join(', ')}`
                });
              }
            }
          }
        } catch (fallbackErr) {
          console.warn('Fallback search error:', fallbackErr);
        }
      }

      setResults(parsedResults);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Не удалось выполнить поиск.');
    } finally {
      setIsSearching(false);
    }
  };

  // Switch search type and auto-trigger search if query exists
  useEffect(() => {
    if (query.trim() && hasSearched) {
      handleSearch(undefined, query.trim(), searchType);
    }
  }, [searchType]);

  const normalizeCoverUri = (uri?: string) => {
    if (!uri) return '';
    let clean = uri.replace('%%', '400x400');
    if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
    return `https://${clean}`;
  };

  const mapYandexTrack = (item: any) => {
    const rawCover = item.coverUri || item.ogImage || item.cover?.uri || (item.albums?.[0]?.coverUri);
    const coverUrl = rawCover 
      ? normalizeCoverUri(rawCover)
      : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';

    return {
      id: `ya_${item.id}`,
      filePath: `yandex:${item.id}`,
      title: item.title,
      artist: item.artists?.[0]?.name || 'Unknown Artist',
      album: item.albums?.[0]?.title || 'Yandex Music',
      duration: Math.floor((item.durationMs || 0) / 1000),
      originalCoverUrl: coverUrl,
      coverUrl: coverUrl,
      customCoverPath: null
    };
  };


  useEffect(() => {
    const fetchRecommendations = async () => {
      if (!yaToken) {
        return;
      }
      try {
        let tracks: any[] = [];
        
        // Попытка 1: Настоящие рекомендации (Плейлист дня)
        try {
          const res1 = await invoke<string>('yandex_api_request', {
            url: 'https://api.music.yandex.net/landing3?blocks=personalplaylists',
            token: yaToken
          });
          const data1 = JSON.parse(res1);
          
          let targetUid = null;
          let targetKind = null;
          
          const blocks = data1.result?.blocks || [];
          for (const block of blocks) {
            if (block.entities) {
              for (const entity of block.entities) {
                 const plData = entity.data?.data || entity.data;
                 if (plData && plData.uid && plData.kind) {
                   if (entity.id === 'playlistOfTheDay' || plData.generatedPlaylistType === 'playlistOfTheDay') {
                     targetUid = plData.uid;
                     targetKind = plData.kind;
                     break;
                   }
                   if (!targetUid) {
                     targetUid = plData.uid;
                     targetKind = plData.kind;
                   }
                 }
              }
            }
          }
          
          if (targetUid && targetKind) {
             const res2 = await invoke<string>('yandex_api_request', {
               url: `https://api.music.yandex.net/users/${targetUid}/playlists/${targetKind}`,
               token: yaToken
             });
             const data2 = JSON.parse(res2);
               if (data2.result?.tracks) {
                  tracks = data2.result.tracks.map((t: any) => t.track || t);
               }
          }
        } catch (e) {
          console.error("Failed to fetch personalplaylists", e);
        }

        // Попытка 2: Берем любимые треки пользователя и перемешиваем (если Плейлист дня не загрузился)
        if (tracks.length === 0 && likedTracks && likedTracks.length > 0) {
          const shuffled = [...likedTracks].sort(() => 0.5 - Math.random());
          tracks = shuffled.slice(0, 20);
        }
        
        // Попытка 3: Чарт (Топ 100)
        if (tracks.length === 0) {
          try {
            const res = await invoke<string>('yandex_api_request', {
              url: 'https://api.music.yandex.net/search?text=хиты&type=track&page=0',
              token: yaToken
            });
            const data = JSON.parse(res);
            if (data.result?.tracks?.results) {
               tracks = data.result.tracks.results.map(mapYandexTrack);
            }
          } catch (e) {}
        }
        
        if (tracks.length > 0) {
          setRecommendations(tracks.map(t => (t.id && String(t.id).startsWith('ya_')) ? t : mapYandexTrack(t)));
        }
      } catch (e: any) {
        console.error('Failed to fetch recommendations', e);
      }
    };
    
    fetchRecommendations();
  }, [yaToken, likedTracks]);

  const handlePlayResult = async (result: any) => {
    if (result.type === 'track') {
      const existingIndex = queue.findIndex(t => t.id === `ya_${result.id}`);
      
      if (existingIndex >= 0) {
        if (existingIndex === currentTrackIndex) {
          togglePlayPause();
        } else {
          playTrack(existingIndex);
        }
        return;
      }

      const newTrack = mapYandexTrack({
        id: result.id,
        title: result.title,
        artists: [{ name: result.author }],
        durationMs: result.lengthSeconds * 1000,
        coverUri: result.cover ? result.cover.replace('https://', '').replace('200x200', '%%') : ''
      });

      addTrack(newTrack);
      const newIndex = usePlayerStore.getState().queue.length - 1;
      playTrack(newIndex);
      } else if (result.type === 'album') {
      try {
        setLoadingCollection(result.id);
        const response: string = await invoke('yandex_api_request', { 
          url: `https://api.music.yandex.net/albums/${result.id}/with-tracks`,
          token: yaToken
        });
        const data = JSON.parse(response);
        if (data.result && data.result.volumes && data.result.volumes.length > 0) {
          const flatTracks = data.result.volumes.flat();
          const newTracks = flatTracks.map(mapYandexTrack);
          
          playContext(newTracks, 0);
          
        }
      } catch (err) {
        console.error(err);
        alert('Не удалось загрузить треки альбома');
      } finally {
        setLoadingCollection(null);
      }
    } else if (result.type === 'playlist') {
      try {
        setLoadingCollection(result.id);
        const response: string = await invoke('yandex_api_request', { 
          url: `https://api.music.yandex.net/users/${result.ownerUid}/playlists/${result.id}`,
          token: yaToken
        });
        const data = JSON.parse(response);
        if (data.result && data.result.tracks && data.result.tracks.length > 0) {
          const flatTracks = data.result.tracks.map((t: any) => t.track);
          const newTracks = flatTracks.map(mapYandexTrack);
          
          playContext(newTracks, 0);
          
        }
      } catch (err) {
        console.error(err);
        alert('Не удалось загрузить плейлист');
      } finally {
        setLoadingCollection(null);
      }
    } else if (result.type === 'artist') {
      useArtistStore.getState().openArtist(result.title, result.id, 'modal');
    }
  };

  const handlePlayArtist = async (artistItem: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      setLoadingCollection(artistItem.id);
      const response: string = await invoke('yandex_api_request', { 
        url: `https://api.music.yandex.net/artists/${artistItem.id}/brief-info`,
        token: yaToken
      });
      const data = JSON.parse(response);
      if (data.result?.popularTracks && data.result.popularTracks.length > 0) {
        const newTracks = data.result.popularTracks.map(mapYandexTrack);
        playContext(newTracks, 0);
      } else {
        useArtistStore.getState().openArtist(artistItem.title, artistItem.id, 'modal');
      }
    } catch (err) {
      console.error(err);
      useArtistStore.getState().openArtist(artistItem.title, artistItem.id, 'modal');
    } finally {
      setLoadingCollection(null);
    }
  };

  if (!yaToken) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 text-[#cccccc]">
        <Search size={48} className="mb-4 opacity-30" />
        <h2 className="text-2xl font-bold text-[var(--text-main)] mb-2 text-center">Yandex Music не подключен</h2>
        <p className="text-sm text-center max-w-md mb-6">
          Для поиска музыки необходимо подключить Yandex Music. Вы можете сделать это в Настройках приложения в разделе "Сервисы".
        </p>
        <button 
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-6 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-[3px] text-[var(--text-main)] font-bold text-sm transition-colors"
        >
          <Settings size={18} /> Открыть Настройки
        </button>
      </div>
    );
  }

  const isHomeState = !hasSearched && !isSearching && results.length === 0;

  return (
    <div className={`w-full mx-auto h-full flex flex-col transition-all duration-500 ease-in-out ${isHomeState ? 'justify-center max-w-2xl' : 'pt-4 w-full'}`}>
      
      <div className={`relative z-50 flex flex-col gap-4 shrink-0 transition-all duration-500 ease-in-out ${isHomeState ? 'mb-0' : 'mb-6'}`}>
        <form onSubmit={handleSearch} className="relative w-full group z-50">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              const val = e.target.value;
              setQuery(val);
              if (!val.trim()) {
                setHasSearched(false);
                setSearchedQuery('');
                setResults([]);
                setSearchNotice(null);
                setErrorMsg('');
              }
            }}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setTimeout(() => setIsInputFocused(false), 200)}
            placeholder="Трек, альбом, исполнитель, подкаст"
            className={`w-full bg-[var(--bg-surface)] border border-[var(--border-main)] py-3.5 pl-12 pr-20 text-[var(--text-main)] text-[15px] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-all duration-300 shadow-sm ${isInputFocused && searchHistory.length > 0 ? 'rounded-t-[16px] rounded-b-none border-b-transparent' : 'rounded-[16px]'}`}
          />
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555] group-focus-within:text-[var(--text-secondary)] transition-colors" />
          
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {query.trim() && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setHasSearched(false);
                  setSearchedQuery('');
                  setResults([]);
                  setSearchNotice(null);
                  setErrorMsg('');
                }}
                className="p-1 hover:bg-[var(--bg-surface-hover)] rounded-full text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors"
                title="Очистить"
              >
                <X size={15} />
              </button>
            )}
            <button 
              type="submit"
              disabled={isSearching}
              className="flex items-center justify-center transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {isSearching && !loadingCollection ? (
                <Loader2 size={18} className="animate-spin text-[var(--accent)]" />
              ) : (
                <Cloud size={18} className="text-[var(--accent)]" />
              )}
            </button>
          </div>

          <AnimatePresence>
            {isInputFocused && searchHistory.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.2 }}
                className="absolute top-full left-0 right-0 bg-[var(--bg-surface)] border border-[var(--border-main)] border-t-0 rounded-b-[16px] overflow-hidden shadow-2xl py-2 z-50"
              >
                {searchHistory.map((item, i) => (
                  <div 
                    key={i} 
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-[var(--bg-surface-hover)] cursor-pointer text-[#aaa] hover:text-[var(--text-main)] transition-colors"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setQuery(item);
                      handleSearch(undefined, item);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Search size={16} className="text-[#555]" />
                      <span className="text-[14px]">{item}</span>
                    </div>
                    <button 
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        removeHistoryItem(item, e);
                      }}
                      className="p-1 hover:bg-[var(--bg-surface-hover)] rounded-full text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        <div className={`flex items-center gap-2 overflow-x-auto scrollbar-hide py-1 px-1 justify-start sm:justify-center transition-opacity duration-500 ${isHomeState && !query.trim() ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100 h-auto'}`}>
          <button 
            onClick={() => setSearchType('track')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${searchType === 'track' ? 'bg-[var(--accent)] text-[var(--text-main)]' : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'}`}
          >
            <Music size={14} /> Треки
          </button>
          <button 
            onClick={() => setSearchType('album')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${searchType === 'album' ? 'bg-[var(--accent)] text-[var(--text-main)]' : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'}`}
          >
            <Disc3 size={14} /> Альбомы
          </button>
          <button 
            onClick={() => setSearchType('playlist')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${searchType === 'playlist' ? 'bg-[var(--accent)] text-[var(--text-main)]' : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'}`}
          >
            <ListMusic size={14} /> Плейлисты
          </button>
          <button 
            onClick={() => setSearchType('artist')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${searchType === 'artist' ? 'bg-[var(--accent)] text-[var(--text-main)]' : 'bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'}`}
          >
            <User size={14} /> Артисты
          </button>
        </div>
      </div>

      <div className={`transition-all duration-500 ease-in-out ${isHomeState && recommendations.length > 0 ? 'opacity-100 h-auto mt-12' : 'opacity-0 h-0 overflow-hidden pointer-events-none'}`}>
        <h3 className="text-xl font-bold text-[var(--text-main)] mb-4 px-2">Рекомендуем вам</h3>
        <div ref={carouselRef} className="flex overflow-x-auto gap-4 pb-4 scrollbar-hide px-2">
          {recommendations.map((track, i) => {
            const isQueuedAndActive = queue.findIndex(t => t.id === track.id) === currentTrackIndex && currentTrackIndex !== -1;
            const coverUrl = track.customCoverPath || track.originalCoverUrl || track.coverUrl || track.cover || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
            return (
              <div 
                key={track.id + '_' + i} 
                className="flex flex-col gap-2 cursor-pointer group shrink-0"
                onClick={() => {
                  if (isQueuedAndActive) {
                    togglePlayPause();
                  } else {
                    const existingIndex = queue.findIndex(t => t.id === track.id);
                    if (existingIndex !== -1) {
                      playTrack(existingIndex);
                    } else {
                      addTrack(track);
                      playTrack(queue.length);
                    }
                  }
                }}
              >
                <div className="relative w-[160px] h-[160px] rounded-2xl overflow-hidden bg-[var(--bg-surface-hover)] border border-[var(--border-main)] shadow-md">
                  <img 
                    src={coverUrl} 
                    alt={track.title} 
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                  />
                  <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${isQueuedAndActive ? 'opacity-100 bg-black/40' : 'opacity-0 group-hover:opacity-100 bg-black/40'}`}>
                    {isQueuedAndActive ? (
                      <PlayingIndicator isPaused={!isPlaying} />
                    ) : (
                      <div className="w-10 h-10 bg-[var(--accent)] rounded-full flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                        <Play size={18} fill="currentColor" className="text-[var(--text-main)] ml-0.5" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col w-[160px]">
                  <span className="font-bold text-[var(--text-main)] text-[14px] truncate">{track.title}</span>
                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      useArtistStore.getState().openArtist(track.artist, null, 'modal');
                    }}
                    className="text-[var(--text-secondary)] text-[13px] truncate hover:text-[var(--text-main)] hover:underline cursor-pointer transition-colors"
                  >
                    {track.artist}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`relative z-0 flex flex-col flex-1 overflow-y-auto scrollbar-hide pb-24 transition-opacity duration-500 ${isHomeState ? 'opacity-0 pointer-events-none hidden' : 'opacity-100 pointer-events-auto'}`}>
        {errorMsg && (
          <div className="text-red-500 text-center py-4 bg-red-500/10 rounded-2xl border border-red-500/20 mb-4">{errorMsg}</div>
        )}

        {searchNotice && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 mb-4 rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-sm text-[var(--text-main)]">
            <div className="flex items-center gap-2.5 truncate">
              <Sparkles size={16} className="text-[var(--accent)] shrink-0" />
              <span className="truncate font-medium">{searchNotice.text}</span>
            </div>
            {searchNotice.onAction && searchNotice.actionText && (
              <button 
                onClick={searchNotice.onAction}
                className="shrink-0 flex items-center gap-1 px-3 py-1 bg-[var(--accent)] text-[var(--text-main)] hover:bg-[var(--accent-hover)] rounded-full text-xs font-semibold transition-colors shadow-sm"
              >
                <span>{searchNotice.actionText}</span>
                <ChevronRight size={12} />
              </button>
            )}
          </div>
        )}

        {isSearching && !loadingCollection ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--text-secondary)]">
            <Loader2 size={32} className="animate-spin text-[var(--accent)] mb-3" />
            <span className="text-sm font-medium">Поиск музыки...</span>
          </div>
        ) : results.length === 0 && !errorMsg ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--text-secondary)]">
            <div className="w-16 h-16 rounded-full bg-[var(--bg-surface-hover)] border border-[var(--border-main)] flex items-center justify-center mb-4 text-[var(--text-secondary)]">
              <Search size={28} className="opacity-40" />
            </div>
            <h3 className="text-lg font-bold text-[var(--text-main)] mb-1">Ничего не найдено</h3>
            <p className="text-sm max-w-sm text-center text-[var(--text-secondary)]">
              По запросу «{searchedQuery || query}» в разделе {
                searchType === 'track' ? '«Треки»' :
                searchType === 'album' ? '«Альбомы»' :
                searchType === 'playlist' ? '«Плейлисты»' : '«Артисты»'
              } ничего не нашлось. Попробуйте проверить другие вкладки или изменить формулировку.
            </p>
          </div>
        ) : (
          results.map((result) => {
            const isTrack = result.type === 'track';
            const isArtist = result.type === 'artist';
            const isQueuedAndActive = isTrack && queue.findIndex(t => t.id === `ya_${result.id}`) === currentTrackIndex && currentTrackIndex !== -1;
            const coverUrl = result.cover || (isArtist 
              ? 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=200&auto=format&fit=crop'
              : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop');
            const isCollectionLoading = loadingCollection === result.id;
            
            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                key={result.id}
                onClick={() => handlePlayResult(result)}
                className={`group flex items-center justify-between p-2 pr-4 mb-2 rounded-2xl border border-[var(--border-main)] cursor-pointer transition-all ${
                  isQueuedAndActive ? 'bg-[var(--bg-surface-hover)] border-[var(--border-main)]' : 'bg-transparent hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className={`relative w-12 h-12 overflow-hidden shrink-0 bg-[var(--bg-surface-hover)] ${
                    isArtist ? 'rounded-full border border-white/10' : isTrack ? 'rounded-[10px]' : 'rounded-md shadow-md'
                  }`}>
                    {result.cover ? (
                      <img src={coverUrl} alt={result.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                        {isArtist ? <User size={22} /> : <Disc3 size={22} />}
                      </div>
                    )}
                    <div 
                      onClick={(e) => {
                        if (isArtist) {
                          handlePlayArtist(result, e);
                        }
                      }}
                      className={`absolute inset-0 flex items-center justify-center transition-opacity ${isQueuedAndActive || isCollectionLoading ? 'opacity-100 bg-black/40' : 'opacity-0 group-hover:opacity-100 bg-black/40'}`}
                    >
                      {isCollectionLoading ? (
                        <div className="w-8 h-8 bg-[var(--accent)] rounded-full flex items-center justify-center shadow-md">
                          <Loader2 size={14} className="text-[var(--text-main)] animate-spin" />
                        </div>
                      ) : isQueuedAndActive ? (
                        <PlayingIndicator isPaused={!isPlaying} />
                      ) : (
                        <div className="w-8 h-8 bg-[var(--accent)] rounded-full flex items-center justify-center shadow-md">
                          <Play size={14} fill="currentColor" className="text-[var(--text-main)] ml-0.5" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col truncate">
                    <span className={`font-medium text-[15px] truncate ${isQueuedAndActive ? 'text-[var(--accent)]' : 'text-[#cccccc] group-hover:text-[var(--text-main)]'}`}>
                      {result.title}
                    </span>
                    <span 
                      onClick={(e) => {
                        if (!isArtist) {
                          e.stopPropagation();
                          useArtistStore.getState().openArtist(result.author, null, 'modal');
                        }
                      }}
                      className={`text-[13px] text-[var(--text-secondary)] truncate ${!isArtist ? 'hover:text-[var(--text-main)] hover:underline cursor-pointer' : ''} transition-colors`}
                    >
                      {isArtist ? (
                        <>
                          {result.author}
                          {result.trackCount > 0 && ` • ${result.trackCount} треков`}
                          {result.albumCount > 0 && ` • ${result.albumCount} релизов`}
                        </>
                      ) : (
                        <>
                          {result.author} {result.trackCount ? `• ${result.trackCount} треков` : ''}
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {isArtist && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        useArtistStore.getState().openArtist(result.title, result.id, 'modal');
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--bg-surface-hover)] border border-[var(--border-main)] hover:border-[var(--accent)] text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-all shadow-sm group/btn"
                    >
                      <span>Карточка артиста</span>
                      <ChevronRight size={13} className="text-[var(--text-secondary)] group-hover/btn:text-[var(--accent)] group-hover/btn:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                )}

                {!isTrack && !isArtist && (
                  <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const { createPlaylist } = useCollectionStore.getState();
                          let newTracks = [];
                          if (result.type === 'album') {
                            const response: string = await invoke('yandex_api_request', { 
                              url: `https://api.music.yandex.net/albums/${result.id}/with-tracks`,
                              token: yaToken
                            });
                            const data = JSON.parse(response);
                              if (data.result && data.result.volumes && data.result.volumes.length > 0) {
                                newTracks = data.result.volumes.flat().map(mapYandexTrack);
                              }
                            } else if (result.type === 'playlist') {
                              const response: string = await invoke('yandex_api_request', { 
                                url: `https://api.music.yandex.net/users/${result.ownerUid}/playlists/${result.id}`,
                                token: yaToken
                              });
                              const data = JSON.parse(response);
                              if (data.result && data.result.tracks && data.result.tracks.length > 0) {
                                newTracks = data.result.tracks.map((t: any) => t.track).map(mapYandexTrack);
                              }
                            }
                            
                            if (newTracks.length > 0) {
                              openCreatePlaylist('Введите название для сохранения:', result.title, (plName) => {
                                createPlaylist(plName, newTracks, coverUrl);
                                openAlert('Сохранено в Мою коллекцию!');
                              });
                            }
                          } catch(err) {
                            console.error(err);
                            openAlert('Не удалось сохранить');
                          }
                        }}
                        className="p-1.5 rounded-sm text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors"
                        title="Добавить в коллекцию"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  )}

                  {isTrack && (
                    <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <TrackOptionsPopover track={mapYandexTrack({id: result.id, title: result.title, artists: [{ name: result.author }], durationMs: result.lengthSeconds * 1000, coverUri: result.cover ? result.cover.replace('https://', '').replace('200x200', '%%') : ''})} /> <PlaylistPopover 
                        track={mapYandexTrack({
                            id: result.id,
                            title: result.title,
                            artists: [{ name: result.author }],
                            durationMs: result.lengthSeconds * 1000,
                            coverUri: result.cover ? result.cover.replace('https://', '').replace('200x200', '%%') : ''
                          })}
                      />
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                                                      const t = mapYandexTrack({
                              id: result.id,
                              title: result.title,
                              artists: [{ name: result.author }],
                              durationMs: result.lengthSeconds * 1000,
                              coverUri: result.cover ? result.cover.replace('https://', '').replace('200x200', '%%') : ''
                            });
                          toggleLike(t);
                        }}
                        className={`p-1.5 rounded-sm transition-colors ${likedTracks.some(lt => lt.id === `ya_${result.id}`) ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'}`}
                        title={likedTracks.some(lt => lt.id === `ya_${result.id}`) ? "Убрать из любимых" : "В любимые"}
                      >
                        <Heart size={16} fill={likedTracks.some(lt => lt.id === `ya_${result.id}`) ? "currentColor" : "none"} />
                      </button>
                    </div>
                  )}
                </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};



