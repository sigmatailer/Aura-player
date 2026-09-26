import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Disc3, Play } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useCollectionStore } from '../store/useCollectionStore';
import { useArtistStore } from '../store/useArtistStore';
import { useThemeStore } from '../store/useThemeStore';
import { WaveBanner } from './WaveBanner';
import { invoke } from '@tauri-apps/api/core';
import { Track } from '../types';

interface VibeArtist {
  id?: string;
  name: string;
  coverUrl?: string;
}

export const MyVibe: React.FC = () => {
  const { queue, currentTrackIndex, history, playContext, setHistoryDrawerOpen } = usePlayerStore();
  const { likedTracks } = useCollectionStore();
  const { openArtist } = useArtistStore();
  const { customWallpaper, transparencyEnabled, glassStrength, glassBlur, windowOpacity } = useThemeStore();
  const [vibeArtists, setVibeArtists] = useState<VibeArtist[]>([]);
  const [similarArtists, setSimilarArtists] = useState<VibeArtist[]>([]);
  const [releases, setReleases] = useState<Track[]>([]);
  
  // "Для вас" (For You) mix and recommendation states
  const [forYouMixTracks, setForYouMixTracks] = useState<Track[]>(() => {
    try {
      const raw = localStorage.getItem('aura_for_you_mix');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [forYouMixTitle, setForYouMixTitle] = useState<string>(() => {
    return localStorage.getItem('aura_for_you_mix_title') || 'hold up, подъездная эпопея, я знаю';
  });
  const [forYouRecommendations, setForYouRecommendations] = useState<Track[]>(() => {
    try {
      const raw = localStorage.getItem('aura_for_you_recs');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const lastMixHistCountRef = useRef<number>(
    parseInt(localStorage.getItem('aura_for_you_hist_count') || '0', 10)
  );

  const carouselRef = useRef<HTMLDivElement>(null);
  const releasesRef = useRef<HTMLDivElement>(null);
  const forYouRef = useRef<HTMLDivElement>(null);

  const currentTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null;
  const isVibeMode = queue.length > 0 && currentTrack?.id?.startsWith('vibe_');

  // Mouse wheel horizontal scroll helper
  const setupWheelScroll = (el: HTMLElement | null) => {
    if (!el) return () => {};
    let target = el.scrollLeft;
    let isAnimating = false;
    const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

    const animate = () => {
      if (!el) return;
      el.scrollLeft = lerp(el.scrollLeft, target, 0.15);
      if (Math.abs(el.scrollLeft - target) > 0.5) {
        requestAnimationFrame(animate);
      } else {
        el.scrollLeft = target;
        isAnimating = false;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      target += e.deltaY * 2;
      target = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth));
      if (!isAnimating) {
        isAnimating = true;
        requestAnimationFrame(animate);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  };

  useEffect(() => {
    const cleanupArtists = setupWheelScroll(carouselRef.current);
    const cleanupReleases = setupWheelScroll(releasesRef.current);
    const cleanupForYou = setupWheelScroll(forYouRef.current);
    return () => {
      cleanupArtists();
      cleanupReleases();
      cleanupForYou();
    };
  }, [forYouMixTracks.length, releases.length]);

  // Generate or re-generate "Для вас" mix and recommendations (analyzed every 15 played tracks)
  const generateForYouMix = useCallback(async () => {
    try {
      const yaToken = localStorage.getItem('yandex_access_token') || '';
      const artistCounts = new Map<string, number>();
      for (const t of [...(history || []), ...(likedTracks || [])]) {
        if (!t?.artist) continue;
        const mainArtist = t.artist.split(/[,&/]|feat\.?|ft\.?/i)[0].trim();
        if (mainArtist) {
          artistCounts.set(mainArtist, (artistCounts.get(mainArtist) || 0) + 1);
        }
      }

      const topArtists = Array.from(artistCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(entry => entry[0]);

      const seedArtists = topArtists.length > 0 
        ? topArtists 
        : ['отравленный', 'зашил порезы', 'CUPSIZE', 'тёмный принц', 'tryavoid'];

      const collectedMixTracks: Track[] = [];
      const collectedRecTracks: Track[] = [];
      const seenIds = new Set<string>();

      for (const artistName of seedArtists) {
        try {
          const searchResStr: string = await invoke('yandex_api_request', {
            url: `https://api.music.yandex.net/search?type=artist&text=${encodeURIComponent(artistName)}&page=0`,
            token: yaToken
          });
          const searchData = JSON.parse(searchResStr);
          const artistObj = searchData.result?.artists?.results?.[0];

          if (artistObj?.id) {
            const simResStr: string = await invoke('yandex_api_request', {
              url: `https://api.music.yandex.net/artists/${artistObj.id}/similar`,
              token: yaToken
            });
            const simData = JSON.parse(simResStr);
            const simArtists = (simData.result?.similarArtists || []).slice(0, 4);

            for (const simA of [artistObj, ...simArtists]) {
              try {
                const tracksStr: string = await invoke('yandex_api_request', {
                  url: `https://api.music.yandex.net/artists/${simA.id}/tracks?page=0&pageSize=6`,
                  token: yaToken
                });
                const tracksData = JSON.parse(tracksStr);
                const rawTracks = tracksData.result?.tracks || [];

                for (const t of rawTracks) {
                  if (!t || !t.id || seenIds.has(String(t.id))) continue;
                  seenIds.add(String(t.id));

                  const mapped: Track = {
                    id: 'foryou_' + t.id,
                    title: t.title,
                    artist: t.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
                    album: t.albums?.[0]?.title || 'Для вас',
                    duration: t.durationMs ? t.durationMs / 1000 : 0,
                    filePath: `yandex:${t.id}`,
                    originalCoverUrl: t.coverUri ? `https://${t.coverUri.replace('%%', '400x400')}` : null,
                    customCoverPath: null
                  };

                  if (collectedMixTracks.length < 15) {
                    collectedMixTracks.push(mapped);
                  } else if (collectedRecTracks.length < 15) {
                    collectedRecTracks.push(mapped);
                  }
                }
              } catch {}
            }
          }
        } catch {}
      }

      // Also supplement from onyourwave rotor station if needed
      if (collectedMixTracks.length < 15 || collectedRecTracks.length < 8) {
        try {
          const rotorResStr: string = await invoke('yandex_api_request', {
            url: 'https://api.music.yandex.net/rotor/station/user:onyourwave/tracks?count=25',
            token: yaToken
          });
          const rotorData = JSON.parse(rotorResStr);
          const seq = rotorData.result?.sequence || [];
          for (const item of seq) {
            const t = item.track;
            if (!t || !t.id || seenIds.has(String(t.id))) continue;
            seenIds.add(String(t.id));

            const mapped: Track = {
              id: 'foryou_' + t.id,
              title: t.title,
              artist: t.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
              album: t.albums?.[0]?.title || 'Для вас',
              duration: t.durationMs ? t.durationMs / 1000 : 0,
              filePath: `yandex:${t.id}`,
              originalCoverUrl: t.coverUri ? `https://${t.coverUri.replace('%%', '400x400')}` : null,
              customCoverPath: null
            };

            if (collectedMixTracks.length < 15) {
              collectedMixTracks.push(mapped);
            } else if (collectedRecTracks.length < 15) {
              collectedRecTracks.push(mapped);
            }
          }
        } catch {}
      }

      if (collectedMixTracks.length > 0) {
        setForYouMixTracks(collectedMixTracks);
        const mixName = collectedMixTracks.slice(0, 2).map(t => t.title).join(', ') + '...';
        setForYouMixTitle(mixName);
        localStorage.setItem('aura_for_you_mix', JSON.stringify(collectedMixTracks));
        localStorage.setItem('aura_for_you_mix_title', mixName);
      }

      if (collectedRecTracks.length > 0) {
        setForYouRecommendations(collectedRecTracks);
        localStorage.setItem('aura_for_you_recs', JSON.stringify(collectedRecTracks));
      }

      const histCount = (usePlayerStore.getState().history || []).length;
      lastMixHistCountRef.current = histCount;
      localStorage.setItem('aura_for_you_hist_count', String(histCount));
    } catch (err) {
      console.warn('For You Mix generation error:', err);
    }
  }, [likedTracks, history]);

  // Auto update For You mix every 15 played tracks
  useEffect(() => {
    const currentHistCount = (history || []).length;
    const diff = Math.abs(currentHistCount - (lastMixHistCountRef.current || 0));
    if (forYouMixTracks.length === 0 || diff >= 15) {
      generateForYouMix();
    }
  }, [history.length, generateForYouMix, forYouMixTracks.length]);

  // Fetch extended releases: onyourwave + new releases from similar artists of top user artists
  useEffect(() => {
    let isMounted = true;
    const fetchReleases = async () => {
      try {
        const yaToken = localStorage.getItem('yandex_access_token') || '';
        const list: Track[] = [];
        const seen = new Set<string>();

        // 1. Fetch from onyourwave with 30 tracks
        try {
          const res: string = await invoke('yandex_api_request', {
            url: 'https://api.music.yandex.net/rotor/station/user:onyourwave/tracks?count=30',
            token: yaToken
          });
          const data = JSON.parse(res);
          if (data.result?.sequence) {
            for (const item of data.result.sequence) {
              const t = item.track;
              if (t && t.id && !seen.has(String(t.id))) {
                seen.add(String(t.id));
                list.push({
                  id: 'rel_' + t.id,
                  title: t.title,
                  artist: t.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
                  album: t.albums?.[0]?.title || 'Новые релизы',
                  duration: t.durationMs ? t.durationMs / 1000 : 0,
                  filePath: `yandex:${t.id}`,
                  originalCoverUrl: t.coverUri ? `https://${t.coverUri.replace('%%', '400x400')}` : null,
                  customCoverPath: null
                });
              }
            }
          }
        } catch (e) {
          console.warn('Onyourwave releases fetch error:', e);
        }

        // 2. Fetch fresh tracks from similar artists of the user's top played artists
        const topArtists = Array.from(
          new Set(
            [...(history || []), ...(likedTracks || [])]
              .map(t => t?.artist?.split(/[,&/]|feat\.?|ft\.?/i)[0]?.trim())
              .filter(Boolean) as string[]
          )
        ).slice(0, 4);

        for (const aName of topArtists) {
          try {
            const sRes: string = await invoke('yandex_api_request', {
              url: `https://api.music.yandex.net/search?type=artist&text=${encodeURIComponent(aName)}&page=0`,
              token: yaToken
            });
            const sData = JSON.parse(sRes);
            const aObj = sData.result?.artists?.results?.[0];
            if (aObj?.id) {
              const simRes: string = await invoke('yandex_api_request', {
                url: `https://api.music.yandex.net/artists/${aObj.id}/similar`,
                token: yaToken
              });
              const simData = JSON.parse(simRes);
              const sims = (simData.result?.similarArtists || []).slice(0, 3);
              for (const simA of sims) {
                try {
                  const tRes: string = await invoke('yandex_api_request', {
                    url: `https://api.music.yandex.net/artists/${simA.id}/tracks?page=0&pageSize=6`,
                    token: yaToken
                  });
                  const tData = JSON.parse(tRes);
                  for (const t of (tData.result?.tracks || [])) {
                    if (t && t.id && !seen.has(String(t.id))) {
                      seen.add(String(t.id));
                      list.push({
                        id: 'rel_' + t.id,
                        title: t.title,
                        artist: t.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
                        album: t.albums?.[0]?.title || 'Новые релизы',
                        duration: t.durationMs ? t.durationMs / 1000 : 0,
                        filePath: `yandex:${t.id}`,
                        originalCoverUrl: t.coverUri ? `https://${t.coverUri.replace('%%', '400x400')}` : null,
                        customCoverPath: null
                      });
                    }
                  }
                } catch {}
              }
            }
          } catch {}
        }

        if (isMounted && list.length > 0) {
          setReleases(list);
        }
      } catch (err) {
        console.warn('Releases fetch fallback', err);
      }
    };
    fetchReleases();
    return () => { isMounted = false; };
  }, [likedTracks, history]);

  // Fetch similar artists when current track changes
  useEffect(() => {
    if (!currentTrack?.artist) {
      setSimilarArtists([]);
      return;
    }

    let isMounted = true;
    const fetchSimilar = async () => {
      try {
        const yaToken = localStorage.getItem('yandex_access_token') || '';
        const searchRes: string = await invoke('yandex_api_request', {
          url: `https://api.music.yandex.net/search?type=artist&text=${encodeURIComponent(currentTrack.artist)}&page=0`,
          token: yaToken
        });
        const searchData = JSON.parse(searchRes);
        const firstArtist = searchData.result?.artists?.results?.[0];

        if (firstArtist && isMounted) {
          const currentArtistObj: VibeArtist = {
            id: String(firstArtist.id),
            name: firstArtist.name,
            coverUrl: firstArtist.cover?.uri ? `https://${firstArtist.cover.uri.replace('%%', '200x200')}` : undefined
          };

          const simRes: string = await invoke('yandex_api_request', {
            url: `https://api.music.yandex.net/artists/${firstArtist.id}/similar`,
            token: yaToken
          });
          const simData = JSON.parse(simRes);
          const rawSimilar = simData.result?.similarArtists || [];
          const mappedSimilar: VibeArtist[] = rawSimilar.slice(0, 10).map((a: any) => ({
            id: String(a.id),
            name: a.name,
            coverUrl: a.cover?.uri ? `https://${a.cover.uri.replace('%%', '200x200')}` : undefined
          }));

          if (isMounted) {
            setSimilarArtists([currentArtistObj, ...mappedSimilar]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch similar artists in MyVibe:', err);
      }
    };

    fetchSimilar();
    return () => { isMounted = false; };
  }, [currentTrack?.artist]);

  // Build the list of artists to display
  const displayArtists: VibeArtist[] = (() => {
    if (similarArtists.length > 0) return similarArtists;
    if (vibeArtists.length > 0) return vibeArtists;
    const fallback: VibeArtist[] = [];
    const seen = new Set<string>();
    for (const t of (likedTracks || [])) {
      const lower = (t.artist || '').toLowerCase().trim();
      if (lower && !seen.has(lower)) {
        seen.add(lower);
        fallback.push({
          name: t.artist,
          coverUrl: t.customCoverPath || t.originalCoverUrl || undefined
        });
        if (fallback.length >= 12) break;
      }
    }
    return fallback;
  })();

  // 5 vertical cover slices for History card (recently listened)
  const historyCovers = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();
    for (const t of history || []) {
      const url = t.customCoverPath || t.originalCoverUrl;
      if (url && !seen.has(url)) {
        seen.add(url);
        list.push(url);
        if (list.length >= 5) break;
      }
    }
    // Pad to 5 slices if fewer unique covers available
    if (list.length > 0 && list.length < 5) {
      const orig = [...list];
      while (list.length < 5) {
        list.push(orig[list.length % orig.length]);
      }
    }
    return list;
  }, [history]);

  // 2 vertical cover slices for Liked card (favorite tracks)
  const likedCovers = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();
    for (const t of likedTracks || []) {
      const url = t.customCoverPath || t.originalCoverUrl;
      if (url && !seen.has(url)) {
        seen.add(url);
        list.push(url);
        if (list.length >= 2) break;
      }
    }
    if (list.length === 1) {
      list.push(list[0]);
    }
    return list;
  }, [likedTracks]);

  return (
    <div className="w-full h-full flex flex-col justify-start bg-transparent px-4 sm:px-6 md:px-8 pt-12 sm:pt-14 md:pt-8 pb-24 relative overflow-y-auto gap-6 select-none scrollbar-hide">
      
      {/* 1. Dotify-Style Majestic Wave Hero Banner */}
      <div className="w-full shrink-0 relative z-30">
        <WaveBanner onArtistsUpdate={(newA) => setVibeArtists(newA)} />
      </div>

      {/* 2. Two Horizontal Quick Action Cards (История: 5 частей / Любимые треки: 2 части, без кругляшков и без подсветки) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full relative z-20">
        
        {/* Card 1: История (5 вертикальных частей обложек, адаптируется под стекло) */}
        <div
          onClick={() => setHistoryDrawerOpen(true)}
          style={{
            backgroundColor: transparencyEnabled && customWallpaper
              ? `rgba(16, 12, 16, ${Math.max(0.12, (windowOpacity / 100) * 0.68)})`
              : 'rgba(22, 18, 20, 0.88)',
            backdropFilter: transparencyEnabled && customWallpaper && glassBlur > 0
              ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.5}%)`
              : 'blur(20px)',
            WebkitBackdropFilter: transparencyEnabled && customWallpaper && glassBlur > 0
              ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.5}%)`
              : 'blur(20px)',
            borderColor: transparencyEnabled && customWallpaper
              ? `rgba(255, 255, 255, ${0.06 + (glassStrength / 100) * 0.16})`
              : 'rgba(255, 255, 255, 0.08)',
            boxShadow: transparencyEnabled && customWallpaper
              ? `0 15px 35px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,${(glassStrength / 100) * 0.18})`
              : undefined
          }}
          className="relative h-[80px] rounded-[18px] overflow-hidden border p-5 flex items-center justify-between cursor-pointer select-none"
        >
          {/* 5 Vertical Cover Slices */}
          {historyCovers.length > 0 && (
            <div className="absolute inset-0 grid grid-cols-5 w-full h-full pointer-events-none select-none">
              {historyCovers.map((cover, idx) => (
                <div key={idx} className="relative w-full h-full overflow-hidden border-r border-black/20 last:border-r-0">
                  <img 
                    src={cover} 
                    alt="" 
                    className="w-full h-full object-cover select-none"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Dark translucent gradient overlay matching Screenshot 2 */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/75 pointer-events-none" />

          {/* Content: Title & subtitle (кругляшки убраны) */}
          <div className="flex flex-col min-w-0 z-10">
            <span className="text-[16px] font-bold text-white leading-tight truncate">
              История
            </span>
            <span className="text-[12.5px] text-white/60 leading-tight truncate mt-0.5">
              {history.length > 0 ? `Ваши недавно прослушанные треки (${history.length})` : 'Ваши недавно прослушанные треки'}
            </span>
          </div>
        </div>

        {/* Card 2: Любимые треки (2 вертикальные части обложек, адаптируется под стекло) */}
        <div
          onClick={() => {
            if (likedTracks && likedTracks.length > 0) {
              playContext(likedTracks, 0);
            }
          }}
          style={{
            backgroundColor: transparencyEnabled && customWallpaper
              ? `rgba(16, 12, 16, ${Math.max(0.12, (windowOpacity / 100) * 0.68)})`
              : 'rgba(22, 18, 20, 0.88)',
            backdropFilter: transparencyEnabled && customWallpaper && glassBlur > 0
              ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.5}%)`
              : 'blur(20px)',
            WebkitBackdropFilter: transparencyEnabled && customWallpaper && glassBlur > 0
              ? `blur(${glassBlur}px) saturate(${100 + glassStrength * 1.5}%)`
              : 'blur(20px)',
            borderColor: transparencyEnabled && customWallpaper
              ? `rgba(255, 255, 255, ${0.06 + (glassStrength / 100) * 0.16})`
              : 'rgba(255, 255, 255, 0.08)',
            boxShadow: transparencyEnabled && customWallpaper
              ? `0 15px 35px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,${(glassStrength / 100) * 0.18})`
              : undefined
          }}
          className="relative h-[80px] rounded-[18px] overflow-hidden border p-5 flex items-center justify-between cursor-pointer select-none"
        >
          {/* 2 Vertical Cover Slices */}
          {likedCovers.length > 0 && (
            <div className="absolute inset-0 grid grid-cols-2 w-full h-full pointer-events-none select-none">
              {likedCovers.map((cover, idx) => (
                <div key={idx} className="relative w-full h-full overflow-hidden border-r border-black/20 last:border-r-0">
                  <img 
                    src={cover} 
                    alt="" 
                    className="w-full h-full object-cover select-none"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Dark translucent gradient overlay matching Screenshot 2 */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/75 pointer-events-none" />

          {/* Content: Title & subtitle (кругляшки убраны) */}
          <div className="flex flex-col min-w-0 z-10">
            <span className="text-[16px] font-bold text-white leading-tight truncate">
              Любимые треки
            </span>
            <span className="text-[12.5px] text-white/60 leading-tight truncate mt-0.5">
              {likedTracks.length > 0 ? `Ваша коллекция любимой музыки (${likedTracks.length})` : 'Ваша коллекция любимой музыки'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Section: Для вас (Curated mix with stacked card effect + recommendations with sun badge) */}
      <div className="relative z-10 w-full flex flex-col pt-2">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Для вас
          </h2>
          <span className="text-[11px] text-white/40">
            Обновляется каждые 15 прослушиваний
          </span>
        </div>

        <div 
          ref={forYouRef}
          className="flex gap-4 sm:gap-5 overflow-x-auto py-2 px-1 scrollbar-hide select-none items-start"
        >
          {/* A. The 15-Track Curated Mix with 3-Covers Stacked Effect (Screenshot 1) */}
          <motion.div
            whileHover={{ scale: 1.035 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            onClick={() => {
              if (forYouMixTracks.length > 0) {
                playContext(forYouMixTracks, 0);
              }
            }}
            className="w-[145px] sm:w-[165px] flex flex-col group cursor-pointer shrink-0 mr-2 select-none"
          >
            {/* 3-Covers Stacked Layout: Left, Right, and Center Front */}
            <div className="relative w-full h-[140px] sm:h-[160px] mb-2.5 flex items-center justify-center">
              {/* Left Cover (peeking out behind to the left) */}
              <div className="absolute top-1.5 bottom-1.5 left-0 w-[88%] rounded-[18px] bg-black/60 border border-white/10 shadow-lg overflow-hidden transform -translate-x-3.5 -rotate-[3deg] scale-[0.93] opacity-65 pointer-events-none transition-transform duration-300 group-hover:-translate-x-4">
                {forYouMixTracks[1]?.originalCoverUrl ? (
                  <img src={forYouMixTracks[1].originalCoverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-indigo-900 via-neutral-900 to-black" />
                )}
              </div>

              {/* Right Cover (peeking out behind to the right) */}
              <div className="absolute top-1.5 bottom-1.5 right-0 w-[88%] rounded-[18px] bg-black/60 border border-white/10 shadow-lg overflow-hidden transform translate-x-3.5 rotate-[3deg] scale-[0.93] opacity-65 pointer-events-none transition-transform duration-300 group-hover:translate-x-4">
                {forYouMixTracks[2]?.originalCoverUrl ? (
                  <img src={forYouMixTracks[2].originalCoverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-purple-900 via-neutral-900 to-black" />
                )}
              </div>

              {/* Front Main Center Cover */}
              <div className="relative z-10 w-[92%] h-full rounded-[20px] overflow-hidden bg-black/80 border border-white/20 group-hover:border-white/40 shadow-2xl transition-all">
                <img 
                  src={forYouMixTracks[0]?.originalCoverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400&auto=format&fit=crop'} 
                  alt="Mix" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400&auto=format&fit=crop';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent opacity-70" />
                
                {/* Play Button Overlay */}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-xl transform scale-90 group-hover:scale-100 transition-transform">
                    <Play size={18} fill="currentColor" className="ml-0.5" />
                  </div>
                </div>
              </div>
            </div>

            <span className="text-xs sm:text-sm font-bold text-white truncate max-w-full group-hover:text-[var(--accent)] transition-colors">
              {forYouMixTitle}
            </span>
            <span className="text-[11px] text-white/50 truncate max-w-full mt-0.5">
              {forYouMixTracks.length > 0 ? `${forYouMixTracks.length} треков` : '15 треков'}
            </span>
          </motion.div>

          {/* B. Individual Recommended Tracks with Amber Sun Badge (Screenshot 2) */}
          {(forYouRecommendations.length > 0 ? forYouRecommendations : releases.slice(0, 10)).map((track, idx) => {
            const cover = track.customCoverPath || track.originalCoverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400&auto=format&fit=crop';
            return (
              <motion.div
                key={'foryou_rec_' + track.id + '_' + idx}
                whileHover={{ y: -4 }}
                onClick={() => {
                  const allForYou = [...forYouRecommendations, ...forYouMixTracks];
                  const idxInList = allForYou.findIndex(t => t.id === track.id);
                  if (idxInList !== -1) {
                    playContext(allForYou, idxInList);
                  } else {
                    playContext([track, ...queue], 0);
                  }
                }}
                className="w-[140px] sm:w-[160px] flex flex-col group cursor-pointer shrink-0"
              >
                <div className="relative w-[140px] h-[140px] sm:w-[160px] sm:h-[160px] rounded-[18px] overflow-hidden bg-black/40 border border-white/10 group-hover:border-white/30 transition-all shadow-lg mb-2.5">
                  <img 
                    src={cover} 
                    alt={track.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400&auto=format&fit=crop';
                    }}
                  />

                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-xl transform scale-90 group-hover:scale-100 transition-transform">
                      <Play size={18} fill="currentColor" className="ml-0.5" />
                    </div>
                  </div>
                </div>

                <span className="text-xs sm:text-sm font-bold text-white truncate max-w-full group-hover:text-[var(--accent)] transition-colors">
                  {track.title}
                </span>
                <span className="text-[11px] text-white/50 truncate max-w-full mt-0.5">
                  {track.artist}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* 4. Section: Релизы (Releases row with extended similar artists releases) */}
      <div className="relative z-10 w-full flex flex-col pt-2">
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-3 px-1">
          Релизы
        </h2>

        <div 
          ref={releasesRef}
          className="flex gap-4 sm:gap-5 overflow-x-auto py-2 px-1 scrollbar-hide select-none"
        >
          {(releases.length > 0 ? releases : (queue.slice(0, 10))).map((track, idx) => {
            const cover = track.customCoverPath || track.originalCoverUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400&auto=format&fit=crop';
            return (
              <motion.div
                key={track.id + '_' + idx}
                whileHover={{ y: -4 }}
                onClick={() => {
                  const idxInQueue = queue.findIndex(t => t.id === track.id);
                  if (idxInQueue !== -1) {
                    usePlayerStore.getState().playTrack(idxInQueue);
                  } else {
                    usePlayerStore.getState().playContext([track, ...queue], 0);
                  }
                }}
                className="w-[140px] sm:w-[160px] flex flex-col group cursor-pointer shrink-0"
              >
                <div className="relative w-[140px] h-[140px] sm:w-[160px] sm:h-[160px] rounded-[18px] overflow-hidden bg-black/40 border border-white/10 group-hover:border-white/30 transition-all shadow-lg mb-2.5">
                  <img 
                    src={cover} 
                    alt={track.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400&auto=format&fit=crop';
                    }}
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-xl transform scale-90 group-hover:scale-100 transition-transform">
                      <Play size={18} fill="currentColor" className="ml-0.5" />
                    </div>
                  </div>
                </div>

                <span className="text-xs sm:text-sm font-bold text-white truncate max-w-full group-hover:text-[var(--accent)] transition-colors">
                  {track.title}
                </span>
                <span className="text-[11px] text-white/50 truncate max-w-full mt-0.5">
                  {track.artist}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* 4. Section: Артисты вашей волны */}
      {displayArtists.length > 0 && (
        <div className="relative z-10 w-full flex flex-col pt-2 pb-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-white/80" />
              <span className="text-sm font-bold text-white tracking-tight">
                {isVibeMode 
                  ? 'Артисты вашей волны' 
                  : currentTrack 
                    ? `Похожие на ${currentTrack.artist}` 
                    : 'Ваши любимые артисты'}
              </span>
            </div>
            <span className="text-[11px] text-white/40 hidden sm:inline">
              Нажмите для просмотра дискографии
            </span>
          </div>

          <div 
            ref={carouselRef} 
            className="flex gap-4 sm:gap-6 overflow-x-auto py-2 px-1 scrollbar-hide select-none"
          >
            {displayArtists.map((artist, idx) => {
              const isCurrentPlayingArtist = currentTrack && currentTrack.artist.toLowerCase().includes(artist.name.toLowerCase());

              return (
                <div
                  key={artist.name + '_' + idx}
                  onClick={() => openArtist(artist.name, artist.id || null, 'modal')}
                  className="flex flex-col items-center group cursor-pointer shrink-0 transition-transform active:scale-95"
                >
                  <div className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden transition-all duration-300 group-hover:scale-105 shadow-xl ${
                    isCurrentPlayingArtist 
                      ? 'border-2 border-white shadow-[0_0_20px_rgba(255,255,255,0.4)]' 
                      : 'border-2 border-white/10 group-hover:border-white/40'
                  } bg-[#16161a]`}>
                    {artist.coverUrl ? (
                      <img 
                        src={artist.coverUrl} 
                        alt={artist.name} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/40">
                        <Disc3 size={32} />
                      </div>
                    )}
                  </div>

                  <span className={`text-xs font-semibold text-center mt-2.5 truncate max-w-[95px] transition-colors ${
                    isCurrentPlayingArtist 
                      ? 'text-white font-bold' 
                      : 'text-white/80 group-hover:text-white'
                  }`}>
                    {artist.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
