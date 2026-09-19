import { invoke } from '@tauri-apps/api/core';
import { Track } from '../types';
import { usePlayerStore, useSettingsStore } from '../store/usePlayerStore';
import { useCollectionStore } from '../store/useCollectionStore';

export interface WaveTuningOptions {
  mood?: 'all' | 'energetic' | 'calm' | 'happy' | 'sad';
  character?: 'favorite' | 'discovery' | 'popular';
  language?: 'auto' | 'russian' | 'foreign' | 'instrumental';
}

export interface TrackAnalysis {
  cyrillicCount: number;
  latinCount: number;
  isRussian: boolean;
  artists: string[];
  yandexTrackId?: string;
  genre?: string;
}

export interface PlaybackProfile {
  totalAnalyzed: number;
  russianRatio: number;
  foreignRatio: number;
  dominantLanguage: 'russian' | 'foreign' | 'mixed';
  seedArtists: string[];
  seedYandexTrackIds: string[];
  seedGenres: string[];
}

export function analyzeTrack(track: Track): TrackAnalysis {
  const text = `${track.title || ''} ${track.artist || ''}`.toLowerCase();
  
  const cyrillicMatches = text.match(/[а-яё]/g);
  const cyrillicCount = cyrillicMatches ? cyrillicMatches.length : 0;
  
  const latinMatches = text.match(/[a-z]/g);
  const latinCount = latinMatches ? latinMatches.length : 0;
  
  const isRussian = cyrillicCount > latinCount && cyrillicCount >= 2;
  
  const artists = (track.artist || '')
    .split(/[,&/]|feat\.?|ft\.?/i)
    .map(s => s.trim())
    .filter(Boolean);
    
  let yandexTrackId: string | undefined;
  if (track.filePath && track.filePath.startsWith('yandex:')) {
    yandexTrackId = track.filePath.replace('yandex:', '');
  }
  
  return {
    cyrillicCount,
    latinCount,
    isRussian,
    artists,
    yandexTrackId,
    genre: track.genre
  };
}

export function analyzePlaybackHistory(tracks: Track[]): PlaybackProfile {
  const seeds = tracks.slice(0, 15);
  if (seeds.length === 0) {
    return {
      totalAnalyzed: 0,
      russianRatio: 0.5,
      foreignRatio: 0.5,
      dominantLanguage: 'mixed',
      seedArtists: [],
      seedYandexTrackIds: [],
      seedGenres: []
    };
  }
  
  let russianCount = 0;
  let foreignCount = 0;
  const artistCounts: Record<string, number> = {};
  const seedYandexTrackIds: string[] = [];
  const genreCounts: Record<string, number> = {};
  
  for (const track of seeds) {
    const analysis = analyzeTrack(track);
    if (analysis.isRussian) {
      russianCount++;
    } else if (analysis.latinCount > 0) {
      foreignCount++;
    }
    
    for (const a of analysis.artists) {
      const lower = a.toLowerCase();
      artistCounts[lower] = (artistCounts[lower] || 0) + 1;
    }
    
    if (analysis.yandexTrackId) {
      seedYandexTrackIds.push(analysis.yandexTrackId);
    }
    
    if (analysis.genre) {
      const lowerG = analysis.genre.toLowerCase();
      genreCounts[lowerG] = (genreCounts[lowerG] || 0) + 1;
    }
  }
  
  const total = seeds.length;
  const russianRatio = russianCount / total;
  const foreignRatio = foreignCount / total;
  
  let dominantLanguage: 'russian' | 'foreign' | 'mixed' = 'mixed';
  if (russianRatio >= 0.55) {
    dominantLanguage = 'russian';
  } else if (foreignRatio >= 0.55) {
    dominantLanguage = 'foreign';
  }
  
  const seedArtists = Object.entries(artistCounts)
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0]);
    
  const seedGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0]);
    
  return {
    totalAnalyzed: total,
    russianRatio,
    foreignRatio,
    dominantLanguage,
    seedArtists,
    seedYandexTrackIds,
    seedGenres
  };
}

// Map tuner options to official Yandex Rotor settings2 parameters
function mapTuningToYandexSettings2(tuning: WaveTuningOptions) {
  const settings2: Record<string, string> = {
    diversity: 'default',
    moodEnergy: 'all',
    language: 'any'
  };

  // 1. Mood / Energy
  if (tuning.mood === 'energetic') settings2.moodEnergy = 'active';
  else if (tuning.mood === 'calm') settings2.moodEnergy = 'calm';
  else if (tuning.mood === 'happy') settings2.moodEnergy = 'fun';
  else if (tuning.mood === 'sad') settings2.moodEnergy = 'sad';
  else settings2.moodEnergy = 'all';

  // 2. Character / Diversity
  if (tuning.character === 'favorite') settings2.diversity = 'favorite';
  else if (tuning.character === 'discovery') settings2.diversity = 'discover';
  else if (tuning.character === 'popular') settings2.diversity = 'popular';
  else settings2.diversity = 'default';

  // 3. Language
  if (tuning.language === 'russian') settings2.language = 'russian';
  else if (tuning.language === 'foreign') settings2.language = 'not-russian';
  else if (tuning.language === 'instrumental') settings2.language = 'without-words';
  else settings2.language = 'any';

  return settings2;
}

// Session state to support seamless infinite wave generation
let currentBatchId: string | null = null;
let currentLastTrackId: string | null = null;
let currentTuning: WaveTuningOptions = {};
let isFetchingMore = false;

export async function generateWaveTracks(tuning: WaveTuningOptions = {}): Promise<{
  tracks: Track[];
  profile: PlaybackProfile;
  artists: Array<{ id?: string; name: string; coverUrl?: string }>;
}> {
  currentTuning = tuning;
  const playerState = usePlayerStore.getState();
  const collectionState = useCollectionStore.getState();

  // Profile history analysis
  let seedPool = [...(playerState.history || [])];
  if (seedPool.length < 15) {
    const liked = collectionState.likedTracks || [];
    for (const t of liked) {
      if (!seedPool.some(s => s.id === t.id)) {
        seedPool.push(t);
        if (seedPool.length >= 15) break;
      }
    }
  }
  const profile = analyzePlaybackHistory(seedPool);

  const yaToken = useSettingsStore.getState().yandexToken || localStorage.getItem('yandex_access_token') || '';
  const yandexSettings = mapTuningToYandexSettings2(tuning);

  const collectedRawTracks: any[] = [];
  const seenIds = new Set<string>();
  let lastTrackId: string | null = null;
  let batchId: string | null = null;

  // 1. Fetch batches directly from Yandex Rotor "Моя волна" (user:onyourwave)
  if (yaToken) {
    for (let b = 0; b < 5; b++) {
      try {
        let url = 'https://api.music.yandex.net/rotor/station/user:onyourwave/tracks';
        const params: string[] = [];
        if (lastTrackId) params.push(`queue=${encodeURIComponent(lastTrackId)}`);
        if (batchId) params.push(`batchId=${encodeURIComponent(batchId)}`);
        params.push(`settings2=${encodeURIComponent(JSON.stringify(yandexSettings))}`);
        url += `?${params.join('&')}`;

        const response: string = await invoke('yandex_api_request', { url, token: yaToken });
        const data = JSON.parse(response);
        const sequence = data.result?.sequence || [];
        if (sequence.length === 0) break;

        if (data.result?.batchId) {
          batchId = data.result.batchId;
        }

        for (const item of sequence) {
          const t = item.track;
          if (t && t.id && !seenIds.has(String(t.id))) {
            seenIds.add(String(t.id));
            collectedRawTracks.push(t);
            lastTrackId = String(t.id);
          }
        }
      } catch (err) {
        console.warn(`Rotor onyourwave batch ${b} failed:`, err);
        break;
      }
    }
  }

  currentBatchId = batchId;
  currentLastTrackId = lastTrackId;

  // 2. Fallback: If Rotor is unavailable or returns 0 tracks, try personal playlists
  if (collectedRawTracks.length === 0 && yaToken) {
    try {
      const landingRes: string = await invoke('yandex_api_request', {
        url: 'https://api.music.yandex.net/landing3?blocks=personalplaylists,chart',
        token: yaToken
      });
      const landingData = JSON.parse(landingRes);
      const blocks = landingData.result?.blocks || [];
      for (const block of blocks) {
        if (block.entities) {
          for (const entity of block.entities) {
            const plData = entity.data?.data || entity.data;
            if (plData?.tracks) {
              for (const t of plData.tracks) {
                const tr = t.track || t;
                if (tr && tr.id && !seenIds.has(String(tr.id))) {
                  seenIds.add(String(tr.id));
                  collectedRawTracks.push(tr);
                }
              }
            }
          }
        }
      }
    } catch (fbErr) {
      console.warn('Personal playlist fallback failed:', fbErr);
    }
  }

  // 3. Fallback: Liked tracks
  if (collectedRawTracks.length === 0 && collectionState.likedTracks && collectionState.likedTracks.length > 0) {
    const shuffled = [...collectionState.likedTracks].sort(() => 0.5 - Math.random());
    const tracks: Track[] = shuffled.slice(0, 25).map(t => ({
      ...t,
      id: 'vibe_' + t.id + '_' + Date.now() + '_' + Math.floor(Math.random() * 10000)
    }));

    const artists: Array<{ id?: string; name: string; coverUrl?: string }> = [];
    const seenNames = new Set<string>();
    for (const t of tracks) {
      const lower = (t.artist || '').toLowerCase().trim();
      if (lower && !seenNames.has(lower)) {
        seenNames.add(lower);
        artists.push({
          name: t.artist,
          coverUrl: t.customCoverPath || t.originalCoverUrl || undefined
        });
      }
    }

    return { tracks, profile, artists };
  }

  // Convert directly into Track models PRESERVING Yandex's official sequence order!
  const tracks: Track[] = collectedRawTracks.map((t: any) => ({
    id: 'vibe_' + t.id + '_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    title: t.title,
    artist: t.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
    album: t.albums?.[0]?.title || 'Yandex Music',
    duration: t.durationMs ? t.durationMs / 1000 : 0,
    filePath: 'yandex:' + t.id,
    originalCoverUrl: t.coverUri ? 'https://' + t.coverUri.replace('%%', '400x400') : '',
    customCoverPath: null,
    genre: t.albums?.[0]?.genre || undefined,
  }));

  // Extract unique artist cards for the vibe circular carousel
  const artists: Array<{ id?: string; name: string; coverUrl?: string }> = [];
  const seenNames = new Set<string>();

  for (const t of collectedRawTracks) {
    if (t.artists) {
      for (const a of t.artists) {
        const lower = (a.name || '').toLowerCase().trim();
        if (lower && !seenNames.has(lower)) {
          seenNames.add(lower);
          artists.push({
            id: a.id ? String(a.id) : undefined,
            name: a.name,
            coverUrl: a.cover?.uri
              ? `https://${a.cover.uri.replace('%%', '200x200')}`
              : (t.coverUri ? `https://${t.coverUri.replace('%%', '200x200')}` : undefined)
          });
        }
      }
    }
  }

  return { tracks, profile, artists };
}

// Automatically fetch next tracks from Yandex Rotor for infinite wave playback
export async function fetchMoreWaveTracks(overrideLastId?: string): Promise<Track[]> {
  if (isFetchingMore) return [];
  const yaToken = useSettingsStore.getState().yandexToken || localStorage.getItem('yandex_access_token') || '';
  if (!yaToken) return [];

  const targetLastId = overrideLastId || currentLastTrackId;
  const yandexSettings = mapTuningToYandexSettings2(currentTuning);

  isFetchingMore = true;
  const newRawTracks: any[] = [];

  try {
    let url = 'https://api.music.yandex.net/rotor/station/user:onyourwave/tracks';
    const params: string[] = [];
    if (targetLastId) params.push(`queue=${encodeURIComponent(targetLastId)}`);
    if (currentBatchId) params.push(`batchId=${encodeURIComponent(currentBatchId)}`);
    params.push(`settings2=${encodeURIComponent(JSON.stringify(yandexSettings))}`);
    url += `?${params.join('&')}`;

    const response: string = await invoke('yandex_api_request', { url, token: yaToken });
    const data = JSON.parse(response);
    const sequence = data.result?.sequence || [];

    if (data.result?.batchId) {
      currentBatchId = data.result.batchId;
    }

    const currentQueue = usePlayerStore.getState().queue;
    const existingKeys = new Set<string>();
    for (const t of currentQueue) {
      if (t.filePath) existingKeys.add(t.filePath.replace('yandex:', '').toLowerCase());
      if (t.id) existingKeys.add(t.id.toLowerCase());
      if (t.title && t.artist) existingKeys.add(`${t.title.trim().toLowerCase()}|${t.artist.trim().toLowerCase()}`);
    }

    for (const item of sequence) {
      const t = item.track;
      if (!t || !t.id) continue;
      const tArtist = t.artists?.map((a: any) => a.name).join(', ') || '';
      const tKey = `${(t.title || '').trim().toLowerCase()}|${tArtist.trim().toLowerCase()}`;
      if (!existingKeys.has(String(t.id).toLowerCase()) && !existingKeys.has(tKey)) {
        existingKeys.add(String(t.id).toLowerCase());
        existingKeys.add(tKey);
        newRawTracks.push(t);
        currentLastTrackId = String(t.id);
      }
    }
  } catch (err) {
    console.warn('Failed to fetch more wave tracks from Rotor:', err);
  } finally {
    isFetchingMore = false;
  }

  if (newRawTracks.length === 0) return [];

  const newTracks: Track[] = newRawTracks.map((t: any) => ({
    id: 'vibe_' + t.id + '_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    title: t.title,
    artist: t.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
    album: t.albums?.[0]?.title || 'Yandex Music',
    duration: t.durationMs ? t.durationMs / 1000 : 0,
    filePath: 'yandex:' + t.id,
    originalCoverUrl: t.coverUri ? 'https://' + t.coverUri.replace('%%', '400x400') : '',
    customCoverPath: null,
    genre: t.albums?.[0]?.genre || undefined,
  }));

  // Append new tracks seamlessly to queue
  const currentQueue = usePlayerStore.getState().queue;
  usePlayerStore.getState().setQueue([...currentQueue, ...newTracks]);

  return newTracks;
}
