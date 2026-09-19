import { invoke } from '@tauri-apps/api/core';
import { Track } from '../types';
import { useSettingsStore } from '../store/usePlayerStore';

/**
 * Generates a high-quality playlist of similar tracks based on:
 * 1. The same artist's top popular songs
 * 2. Similar artists' top songs
 * 3. Matching genres and vibe
 * 4. Yandex Rotor track station
 */
export async function generateSimilarTracks(sourceTrack: Track): Promise<Track[]> {
  const yaToken = useSettingsStore.getState().yandexToken || localStorage.getItem('yandex_access_token') || '';
  if (!yaToken) {
    throw new Error('Для подбора похожих треков необходимо подключение к Яндекс.Музыке');
  }

  // 1. Clean primary artist and title
  const rawArtist = sourceTrack.artist || 'Unknown';
  const cleanTitle = (sourceTrack.title || '').trim();
  
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
    // 2. Search artist on Yandex Music
    const searchResStr: string = await invoke('yandex_api_request', {
      url: `https://api.music.yandex.net/search?type=artist&text=${encodeURIComponent(primaryArtistName)}&page=0`,
      token: yaToken
    });
    const searchData = JSON.parse(searchResStr);
    const artistObj = searchData.result?.artists?.results?.[0];

    const sameArtistTracks: any[] = [];
    const similarArtistsTracksGroups: Array<{ artist: string; tracks: any[] }> = [];
    const genreTracks: any[] = [];

    if (artistObj && artistObj.id) {
      const artistId = artistObj.id;
      const artistGenres: string[] = artistObj.genres || [];

      // A. Fetch popular tracks of the SAME artist
      try {
        const sameResStr: string = await invoke('yandex_api_request', {
          url: `https://api.music.yandex.net/artists/${artistId}/tracks?page=0&pageSize=15`,
          token: yaToken
        });
        const sameData = JSON.parse(sameResStr);
        const rawSame = sameData.result?.tracks || [];
        for (const t of rawSame) {
          // Exclude the source track title so it doesn't duplicate immediately
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
        const simArtists = (simArtistsData.result?.similarArtists || []).slice(0, 6);

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

      // C. Genre tracks boost/fallback if needed
      if (artistGenres.length > 0 && similarArtistsTracksGroups.length < 3) {
        try {
          const topGenre = artistGenres[0];
          const genreResStr: string = await invoke('yandex_api_request', {
            url: `https://api.music.yandex.net/search?type=track&text=${encodeURIComponent(topGenre)}&page=0`,
            token: yaToken
          });
          const genreData = JSON.parse(genreResStr);
          const gTracks = genreData.result?.tracks?.results || [];
          genreTracks.push(...gTracks.slice(0, 10));
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

    // 3. Assemble and interleave the final similar queue
    const seenIds = new Set<string>();
    if (yandexTrackId) seenIds.add(String(yandexTrackId));

    const finalSequence: any[] = [];

    const addTrack = (t: any) => {
      if (!t || !t.id || seenIds.has(String(t.id))) return false;
      // Skip podcasts or tracks without artist
      if (t.type === 'podcast-episode' || !t.artists || t.artists.length === 0) return false;
      // Filter extreme durations
      const durationSec = (t.durationMs || 0) / 1000;
      if (durationSec > 0 && (durationSec < 35 || durationSec > 900)) return false;

      seenIds.add(String(t.id));
      finalSequence.push(t);
      return true;
    };

    // 1) Add 1-2 top tracks from the SAME artist first
    if (sameArtistTracks[0]) addTrack(sameArtistTracks[0]);
    if (sameArtistTracks[1]) addTrack(sameArtistTracks[1]);

    // 2) Interleave from similar artists, same artist, and rotor
    const maxRounds = 4;
    for (let round = 0; round < maxRounds; round++) {
      // From each similar artist group, pick a track
      for (const group of similarArtistsTracksGroups) {
        if (group.tracks[round]) {
          addTrack(group.tracks[round]);
        }
      }

      // Mix in another track by original artist
      if (sameArtistTracks[round + 2]) {
        addTrack(sameArtistTracks[round + 2]);
      }

      // Mix in a rotor track
      if (rotorTracks[round]) {
        addTrack(rotorTracks[round]);
      }

      // Mix in genre tracks if available
      if (genreTracks[round]) {
        addTrack(genreTracks[round]);
      }

      if (finalSequence.length >= 35) break;
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
        genre: t.albums?.[0]?.genre || undefined
      };
    });

    // Return the source track at index 0, followed by the generated similar tracks
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
