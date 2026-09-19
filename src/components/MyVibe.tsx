import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Disc3 } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useCollectionStore } from '../store/useCollectionStore';
import { useArtistStore } from '../store/useArtistStore';
import { WaveBanner } from './WaveBanner';
import { ArtistLinks } from './ArtistLinks';
import { invoke } from '@tauri-apps/api/core';

interface VibeArtist {
  id?: string;
  name: string;
  coverUrl?: string;
}

export const MyVibe: React.FC = () => {
  const { queue, currentTrackIndex } = usePlayerStore();
  const { likedTracks } = useCollectionStore();
  const { openArtist } = useArtistStore();
  const [vibeArtists, setVibeArtists] = useState<VibeArtist[]>([]);
  const [similarArtists, setSimilarArtists] = useState<VibeArtist[]>([]);
  const carouselRef = useRef<HTMLDivElement>(null);

  const currentTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null;
  const isVibeMode = queue.length > 0 && currentTrack?.id?.startsWith('vibe_');

  // Mouse wheel horizontal scroll for artists carousel
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;

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
  }, []);

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
        // 1. Search artist to get ID and cover
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

          // 2. Fetch similar artists
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
    return () => {
      isMounted = false;
    };
  }, [currentTrack?.artist]);

  // Build the list of artists to display in circular cards
  const displayArtists: VibeArtist[] = (() => {
    if (similarArtists.length > 0) {
      return similarArtists;
    }
    if (vibeArtists.length > 0) {
      return vibeArtists;
    }
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

  return (
    <div className="w-full h-full rounded-2xl flex flex-col justify-start bg-transparent p-4 sm:p-8 md:p-10 relative overflow-y-auto gap-8">
      
      {/* Sleek Wave Banner matching reference at top of tab */}
      <div className="w-full shrink-0 relative z-30">
        <WaveBanner onArtistsUpdate={(newA) => setVibeArtists(newA)} />
      </div>

      {/* Currently Playing Vibe Track Info (if vibe active) */}
      {isVibeMode && currentTrack && (
        <div className="w-full flex flex-col items-center sm:items-start px-2 py-3 bg-[var(--bg-surface)]/30 rounded-2xl border border-white/5 backdrop-blur-sm animate-in fade-in duration-300 relative z-10">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)] mb-1">
            Сейчас играет в волне
          </span>
          <h1 className="text-[var(--text-main)] text-2xl sm:text-3xl font-bold tracking-tight truncate max-w-full drop-shadow-sm">
            {currentTrack.title}
          </h1>
          <div className="mt-0.5">
            <ArtistLinks 
              artist={currentTrack.artist} 
              className="text-[var(--text-secondary)] text-base sm:text-lg font-medium truncate max-w-full transition-colors"
              linkClassName="hover:text-[var(--text-main)]"
              viewMode="modal"
            />
          </div>
        </div>
      )}

      {/* Bottom Section: Dynamic Circular Artist Cards */}
      {displayArtists.length > 0 && (
        <div className="relative z-10 w-full flex flex-col pt-1">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-[var(--accent)]" />
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                {isVibeMode 
                  ? 'Артисты вашей волны' 
                  : currentTrack 
                    ? `Похожие на ${currentTrack.artist}` 
                    : 'Ваши любимые артисты'}
              </span>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)] opacity-60 hidden sm:inline">
              Нажмите для просмотра дискографии
            </span>
          </div>

          <div 
            ref={carouselRef} 
            className="flex gap-5 sm:gap-6 overflow-x-auto py-3 px-2 -mx-2 scrollbar-hide select-none"
          >
            {displayArtists.map((artist, idx) => {
              const isCurrentPlayingArtist = currentTrack && currentTrack.artist.toLowerCase().includes(artist.name.toLowerCase());

              return (
                <div
                  key={artist.name + '_' + idx}
                  onClick={() => openArtist(artist.name, artist.id || null, 'modal')}
                  className="flex flex-col items-center group cursor-pointer shrink-0 transition-transform active:scale-95"
                >
                  <div className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden transition-all duration-300 group-hover:scale-105 shadow-lg ${
                    isCurrentPlayingArtist 
                      ? 'border-2 border-[var(--accent)] shadow-[0_0_18px_var(--accent)]/40' 
                      : 'border-2 border-white/10 group-hover:border-[var(--accent)]/80'
                  } bg-[var(--bg-surface-hover)]`}>
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
                      <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                        <Disc3 size={32} />
                      </div>
                    )}

                    {/* Hover sparkle overlay */}
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Sparkles size={20} className="text-white drop-shadow-md" />
                    </div>
                  </div>

                  <span className={`text-xs font-semibold text-center mt-2.5 truncate max-w-[95px] transition-colors ${
                    isCurrentPlayingArtist 
                      ? 'text-[var(--accent)] font-bold' 
                      : 'text-[var(--text-main)] group-hover:text-[var(--accent)]'
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
