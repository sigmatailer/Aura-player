import { create } from 'zustand';
import { Track } from '../types';

export interface Playlist {
  id: string;
  name: string;
  coverUrl?: string;
  tracks: Track[];
}

interface CollectionState {
  likedTracks: Track[];
  playlists: Playlist[];
  toggleLike: (track: Track) => void;
  isLiked: (trackId: string) => boolean;
  createPlaylist: (name: string, tracks?: Track[], coverUrl?: string) => void;
  updatePlaylist: (id: string, updates: { name?: string, coverUrl?: string }) => void;
  deletePlaylist: (id: string) => void;
  addTrackToPlaylist: (playlistId: string, track: Track) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  downloadedTracks: Track[];
  addDownloadedTracks: (tracks: Track[]) => void;
  removeDownloadedTrack: (trackId: string) => void;
  reorderLikedTracks: (tracks: Track[]) => void;
  reorderDownloadedTracks: (tracks: Track[]) => void;
  reorderPlaylistTracks: (playlistId: string, tracks: Track[]) => void;
}

export const useCollectionStore = create<CollectionState>((set, get) => {
  const savedLiked = localStorage.getItem('liked_tracks');
  const savedPlaylists = localStorage.getItem('playlists');
  const savedDownloaded = localStorage.getItem('downloaded_tracks');
  
    let initialLiked = savedLiked ? JSON.parse(savedLiked) : [];
  let initialPlaylists = savedPlaylists ? JSON.parse(savedPlaylists) : [];
  const initialDownloaded = savedDownloaded ? JSON.parse(savedDownloaded) : [];

  // Migration for broken yandex track filePaths
  const fixTrack = (t: Track) => {
    if (t.filePath && t.filePath.startsWith('ya_')) {
      t.filePath = t.filePath.replace('ya_', 'yandex:');
    }
    return t;
  };
  initialLiked = initialLiked.map(fixTrack);
  initialPlaylists = initialPlaylists.map((pl: Playlist) => ({ ...pl, tracks: pl.tracks.map(fixTrack) }));
  
  // Save fixed back to storage
  if (savedLiked) localStorage.setItem('liked_tracks', JSON.stringify(initialLiked));
  if (savedPlaylists) localStorage.setItem('playlists', JSON.stringify(initialPlaylists));

  return {
    likedTracks: initialLiked,
    playlists: initialPlaylists,
    downloadedTracks: initialDownloaded,
    
    addDownloadedTracks: (tracks) => set((state) => {
      const existingMap = new Map(state.downloadedTracks.map(t => [t.id, t]));
      
      let hasChanges = false;
      for (const t of tracks) {
        if (!existingMap.has(t.id)) {
          existingMap.set(t.id, t);
          hasChanges = true;
        } else {
          // Update existing track if it doesn't have metadata (e.g. Unknown Title)
          const existing = existingMap.get(t.id)!;
          const isUnknownTitle = existing.title === 'Unknown Title' || existing.title === existing.filePath.split('/').pop()?.replace(/\.[^/.]+$/, "");
          const needsCover = !existing.originalCoverUrl && t.originalCoverUrl;
          if (isUnknownTitle || needsCover) {
            existingMap.set(t.id, { ...existing, ...t });
            hasChanges = true;
          }
        }
      }
      
      if (!hasChanges) return state;
      
      const updated = Array.from(existingMap.values());
      localStorage.setItem('downloaded_tracks', JSON.stringify(updated));
      return { downloadedTracks: updated };
    }),

    removeDownloadedTrack: (trackId) => set((state) => {
      const updated = state.downloadedTracks.filter(t => t.id !== trackId);
      localStorage.setItem('downloaded_tracks', JSON.stringify(updated));
      return { downloadedTracks: updated };
    }),
    
    toggleLike: (track) => set((state) => {
      const exists = state.likedTracks.find(t => t.id === track.id);
      let newLiked;
      if (exists) {
        newLiked = state.likedTracks.filter(t => t.id !== track.id);
      } else {
        newLiked = [track, ...state.likedTracks];
      }
      localStorage.setItem('liked_tracks', JSON.stringify(newLiked));
      return { likedTracks: newLiked };
    }),
    
    isLiked: (trackId) => {
      return get().likedTracks.some(t => t.id === trackId);
    },
    
    createPlaylist: (name, tracks = [], coverUrl) => set((state) => {
      const newPlaylist: Playlist = {
        id: 'pl_' + Date.now().toString(),
        name,
        tracks,
        coverUrl
      };
      const newPlaylists = [...state.playlists, newPlaylist];
      localStorage.setItem('playlists', JSON.stringify(newPlaylists));
      return { playlists: newPlaylists };
    }),
    
    updatePlaylist: (id, updates) => set((state) => {
      const newPlaylists = state.playlists.map(p => {
        if (p.id === id) {
          return { ...p, ...updates };
        }
        return p;
      });
      localStorage.setItem('playlists', JSON.stringify(newPlaylists));
      return { playlists: newPlaylists };
    }),

    deletePlaylist: (id) => set((state) => {
      const newPlaylists = state.playlists.filter(p => p.id !== id);
      localStorage.setItem('playlists', JSON.stringify(newPlaylists));
      return { playlists: newPlaylists };
    }),
    
    addTrackToPlaylist: (playlistId, track) => set((state) => {
      const newPlaylists = state.playlists.map(p => {
        if (p.id === playlistId && !p.tracks.some(t => t.id === track.id)) {
          return { ...p, tracks: [...p.tracks, track] };
        }
        return p;
      });
      localStorage.setItem('playlists', JSON.stringify(newPlaylists));
      return { playlists: newPlaylists };
    }),
    
    removeTrackFromPlaylist: (playlistId, trackId) => set((state) => {
      const newPlaylists = state.playlists.map(p => {
        if (p.id === playlistId) {
          return { ...p, tracks: p.tracks.filter(t => t.id !== trackId) };
        }
        return p;
      });
      localStorage.setItem('playlists', JSON.stringify(newPlaylists));
      return { playlists: newPlaylists };
    }),

    reorderLikedTracks: (tracks) => set(() => {
      localStorage.setItem('liked_tracks', JSON.stringify(tracks));
      return { likedTracks: tracks };
    }),

    reorderDownloadedTracks: (tracks) => set(() => {
      localStorage.setItem('downloaded_tracks', JSON.stringify(tracks));
      return { downloadedTracks: tracks };
    }),

    reorderPlaylistTracks: (playlistId, tracks) => set((state) => {
      const newPlaylists = state.playlists.map(p => {
        if (p.id === playlistId) {
          return { ...p, tracks };
        }
        return p;
      });
      localStorage.setItem('playlists', JSON.stringify(newPlaylists));
      return { playlists: newPlaylists };
    })
  };
});

