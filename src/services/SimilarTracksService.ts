import { invoke } from '@tauri-apps/api/core';
import { Track } from '../types';
import { useSettingsStore } from '../store/usePlayerStore';
import { useCacheStore } from '../store/useCacheStore';

export function detectTrackLanguage(title: string, artist: string): 'ru' | 'en' | 'other' {
  const text = `${title} ${artist}`;
  const cyrillic = (text.match(/[а-яё]/gi) || []).length;
  const latin = (text.match(/[a-z]/gi) || []).length;
  if (cyrillic > latin && cyrillic > 0) return 'ru';
  if (latin > 0) return 'en';
  return 'other';
}

/**
 * Analyses track by artist, genre, and language, and returns ONLY the similar tracks (ideal for queue insertion).
 */
export async function getSimilarTracksOnly(sourceTrack: Track, limitCount = 20): Promise<Track[]> {
  const full = await generateSimilarTracks(sourceTrack);
  // Exclude the source track itself
  const sourceIdLower = sourceTrack.id.toLowerCase();
  const sourceTitleLower = (sourceTrack.title || '').trim().toLowerCase();
  const sourceArtistLower = (sourceTrack.artist || '').trim().toLowerCase();

  const filtered = full.filter(t => {
    if (t.id.toLowerCase() === sourceIdLower) return false;
    if (t.id.replace('similar_', '').toLowerCase() === sourceIdLower.replace('similar_', '')) return false;
    if (t.title.trim().toLowerCase() === sourceTitleLower && t.artist.trim().toLowerCase() === sourceArtistLower) return false;
    return true;
  });

  return filtered.slice(0, limitCount);
}

/**
 * Caches similar tracks in background for offline listening.
 */
export async function cacheSimilarTracks(
  sourceTrack: Track,
  count = 5,
  onProgress?: (cachedCount: number, total: number) => void
): Promise<{ cached: number; failed: number }> {
  const yaToken = useSettingsStore.getState().yandexToken || localStorage.getItem('yandex_access_token') || '';
  const similarTracks = await getSimilarTracksOnly(sourceTrack, count);
  let cached = 0;
  let failed = 0;

  for (let i = 0; i < similarTracks.length; i++) {
    const t = similarTracks[i];
    try {
      const { cacheTrack } = useCacheStore.getState();
      await cacheTrack(t, yaToken);
      cached++;
      onProgress?.(cached, similarTracks.length);
    } catch (e) {
      console.warn(`Failed to cache similar track ${t.title}:`, e);
      failed++;
    }
  }

  return { cached, failed };
}

/**
 * Generates a high-quality playlist of similar tracks based on:
 * 1. The same artist's top popular songs
 * 2. Similar artists' top songs
 * 3. Matching genres and vibe
 * 4. Language affinity (Russian vs Foreign)
 * 5. Yandex Rotor track station
 */
export async function generateSimilarTracks(sourceTrack: Track): Promise<Track[]> {
  const yaToken = useSettingsStore.getState().yandexToken || localStorage.getItem('yandex_access_token') || '';
  if (!yaToken) {
    throw new Error('Для подбора похожих треков необходимо подключение к Яндекс.Музыке');
  }

  // 1. Clean primary artist and title, detect language
  const rawArtist = sourceTrack.artist || 'Unknown';
  const cleanTitle = (sourceTrack.title || '').trim();
  const sourceLang = detectTrackLanguage(cleanTitle, rawArtist);
  
  // Extract primary artist (e.g. "CUPSIZE, тёмный принц" -> "CUPSIZE")
  const splitArtists = rawArtist
    .split(/[,&/]|feat\.?|ft\.?/i)
    .map(s => s.trim())
    .filter(Boolean);
    
  const primaryArtistName = splitArtists[0] || rawArtist;

  // Extract Yandex Track ID if available
  let yandexTrackId: string | undefined;
  if (sourceTrack.filePath && sourceTrack.filePath.startsWith('yandex:')) {
    yandexTrackId = sourceTrack.filePath.replace('yandex:', '');
  } else if (sourceTrack.id && sourceTrack.id.startsWith('ya_')) {
    yandexTrackId = sourceTrack.id.replace('ya_', '');
  }

  try {
    // 2. Search artist on Yandex Music to get official genres and similar artists
    const searchResStr: string = await invoke('yandex_api_request', {
      url: `https://api.music.yandex.net/search?type=artist&text=${encodeURIComponent(primaryArtistName)}&page=0`,
      token: yaToken
    });
    const searchData = JSON.parse(searchResStr);
    const artistObj = searchData.result?.artists?.results?.[0];

    const sameArtistTracks: any[] = [];
    const similarArtistsTracksGroups: Array<{ artist: string; tracks: any[] }> = [];
    const genreTracks: any[] = [];
    let discoveredGenres: string[] = [];

    if (artistObj && artistObj.id) {
      const artistId = artistObj.id;
      discoveredGenres = artistObj.genres || [];

      // A. Fetch popular tracks of the SAME artist
      try {
        const sameResStr: string = await invoke('yandex_api_request', {
          url: `https://api.music.yandex.net/artists/${artistId}/tracks?page=0&pageSize=15`,
          token: yaToken
        });
        const sameData = JSON.parse(sameResStr);
        const rawSame = sameData.result?.tracks || [];
        for (const t of rawSame) {
          if (t && t.title && t.title.toLowerCase().trim() !== cleanTitle.toLowerCase()) {
            sameArtistTracks.push(t);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch same artist tracks:', err);
      }

      // B. Fetch SIMILAR artists and their top tracks
      try {
        const simArtistsResStr: string = await invoke('yandex_api_request', {
          url: `https://api.music.yandex.net/artists/${artistId}/similar`,
          token: yaToken
        });
        const simArtistsData = JSON.parse(simArtistsResStr);
        const simArtists = (simArtistsData.result?.similarArtists || []).slice(0, 8);

        for (const simA of simArtists) {
          try {
            const aTracksStr: string = await invoke('yandex_api_request', {
              url: `https://api.music.yandex.net/artists/${simA.id}/tracks?page=0&pageSize=6`,
              token: yaToken
            });
            const aTracksData = JSON.parse(aTracksStr);
            const aTracks = aTracksData.result?.tracks || [];
            if (aTracks.length > 0) {
              similarArtistsTracksGroups.push({
                artist: simA.name,
                tracks: aTracks
              });
            }
          } catch (e) {}
        }
      } catch (err) {
        console.warn('Failed to fetch similar artists:', err);
      }

      // C. Genre tracks search matching track genre and language
      if (discoveredGenres.length > 0) {
        try {
          const topGenre = discoveredGenres[0];
          const queryGenre = sourceLang === 'ru' ? (topGenre.includes('rus') ? topGenre : `русский ${topGenre}`) : topGenre;
          const genreResStr: string = await invoke('yandex_api_request', {
            url: `https://api.music.yandex.net/search?type=track&text=${encodeURIComponent(queryGenre)}&page=0`,
            token: yaToken
          });
          const genreData = JSON.parse(genreResStr);
          const gTracks = genreData.result?.tracks?.results || [];
          genreTracks.push(...gTracks.slice(0, 12));
        } catch (e) {}
      }
    }

    // D. Check Yandex Rotor track radio if track ID exists
    let rotorTracks: any[] = [];
    if (yandexTrackId) {
      try {
        const rotorResStr: string = await invoke('yandex_api_request', {
          url: `https://api.music.yandex.net/rotor/station/track:${yandexTrackId}/tracks`,
          token: yaToken
        });
        const rotorData = JSON.parse(rotorResStr);
        const seq = rotorData.result?.sequence || [];
        rotorTracks = seq
          .map((s: any) => s.track)
          .filter((t: any) => t && t.title && t.artists && t.artists.length > 0 && (!t.type || t.type === 'music'));
      } catch (e) {}
    }

    // 3. Assemble and rank tracks by language affinity and artist diversity
    const seenIds = new Set<string>();
    if (yandexTrackId) seenIds.add(String(yandexTrackId));

    const finalSequence: any[] = [];

    const isLanguageMatch = (t: any) => {
      if (sourceLang === 'other') return true;
      const trackLang = detectTrackLanguage(t.title || '', t.artists?.[0]?.name || '');
      return trackLang === sourceLang || trackLang === 'other';
    };

    const addTrack = (t: any, strictLang = false) => {
      if (!t || !t.id || seenIds.has(String(t.id))) return false;
      if (t.type === 'podcast-episode' || !t.artists || t.artists.length === 0) return false;
      const durationSec = (t.durationMs || 0) / 1000;
      if (durationSec > 0 && (durationSec < 35 || durationSec > 900)) return false;
      if (strictLang && !isLanguageMatch(t)) return false;

      seenIds.add(String(t.id));
      finalSequence.push(t);
      return true;
    };

    // 1) Add 1-2 top tracks from the SAME artist first (matching language)
    if (sameArtistTracks[0]) addTrack(sameArtistTracks[0], true);
    if (sameArtistTracks[1]) addTrack(sameArtistTracks[1], true);

    // 2) Interleave from similar artists, prioritizing matching language
    const maxRounds = 4;
    for (let round = 0; round < maxRounds; round++) {
      for (const group of similarArtistsTracksGroups) {
        if (group.tracks[round]) {
          addTrack(group.tracks[round], true);
        }
      }

      if (rotorTracks[round]) {
        addTrack(rotorTracks[round], true);
      }

      if (sameArtistTracks[round + 2]) {
        addTrack(sameArtistTracks[round + 2], true);
      }

      if (genreTracks[round]) {
        addTrack(genreTracks[round], true);
      }

      if (finalSequence.length >= 30) break;
    }

    // If fewer tracks were found with strict language, fill with remaining similar artist tracks
    if (finalSequence.length < 15) {
      for (const group of similarArtistsTracksGroups) {
        for (const t of group.tracks) {
          addTrack(t, false);
          if (finalSequence.length >= 25) break;
        }
      }
      for (const t of rotorTracks) {
        addTrack(t, false);
        if (finalSequence.length >= 25) break;
      }
    }

    // 4. Map to Track model
    const mappedTracks: Track[] = finalSequence.map((t: any) => {
      const cover = t.coverUri 
        ? `https://${t.coverUri.replace('%%', '400x400')}` 
        : (t.albums?.[0]?.coverUri ? `https://${t.albums[0].coverUri.replace('%%', '400x400')}` : '');

      return {
        id: 'similar_' + t.id + '_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
        title: t.title,
        artist: t.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
        album: t.albums?.[0]?.title || 'Похожие треки',
        duration: Math.floor((t.durationMs || 0) / 1000),
        originalCoverUrl: cover,
        filePath: 'yandex:' + t.id,
        customCoverPath: null,
        genre: t.albums?.[0]?.genre || (discoveredGenres[0] || undefined)
      };
    });

    const sourceClone: Track = {
      ...sourceTrack,
      id: sourceTrack.id.startsWith('similar_') ? sourceTrack.id : ('similar_' + sourceTrack.id)
    };

    return [sourceClone, ...mappedTracks];
  } catch (err) {
    console.error('generateSimilarTracks error:', err);
    throw err;
  }
}
