import { create } from 'zustand';
import { Track } from '../types';

export interface Playlist {
  id: string;
  name: string;
  coverUrl?: string;
  tracks: Track[];
  cloudId?: string;
  updatedAt?: number;
}

export type CollectionSyncListener = {
  onTrackLiked?: (track: Track, isLiked: boolean) => void;
  onPlaylistModified?: (playlist: Playlist) => void;
  onPlaylistDeleted?: (name: string) => void;
};

let syncListener: CollectionSyncListener | null = null;
export const setCollectionSyncListener = (listener: CollectionSyncListener) => {
  syncListener = listener;
};

const safeStorageSet = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn(`Failed to save ${key} to localStorage:`, e);
  }
};

interface CollectionState {
  likedTracks: Track[];
  playlists: Playlist[];
  toggleLike: (track: Track) => void;
  isLiked: (trackId: string) => boolean;
  createPlaylist: (name: string, tracks?: Track[], coverUrl?: string) => void;
  updatePlaylist: (id: string, updates: { name?: string, coverUrl?: string, tracks?: Track[], cloudId?: string }) => void;
  setPlaylists: (playlists: Playlist[]) => void;
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
  if (savedLiked) safeStorageSet('liked_tracks', initialLiked);
  if (savedPlaylists) safeStorageSet('playlists', initialPlaylists);

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
      safeStorageSet('downloaded_tracks', updated);
      return { downloadedTracks: updated };
    }),

    removeDownloadedTrack: (trackId) => set((state) => {
      const updated = state.downloadedTracks.filter(t => t.id !== trackId);
      safeStorageSet('downloaded_tracks', updated);
      return { downloadedTracks: updated };
    }),
    
    toggleLike: (track) => set((state) => {
      const exists = state.likedTracks.find(t => t.id === track.id);
      let newLiked;
      if (exists) {
        newLiked = state.likedTracks.filter(t => t.id !== track.id);
        syncListener?.onTrackLiked?.(track, false);
      } else {
        newLiked = [track, ...state.likedTracks];
        syncListener?.onTrackLiked?.(track, true);
      }
      safeStorageSet('liked_tracks', newLiked);
      return { likedTracks: newLiked };
    }),
    
    isLiked: (trackId) => {
      return get().likedTracks.some(t => t.id === trackId);
    },
    
    createPlaylist: (name, tracks = [], coverUrl) => set((state) => {
      const now = Date.now();
      const newPlaylist: Playlist = {
        id: 'pl_' + now.toString(),
        name,
        tracks,
        coverUrl,
        updatedAt: now
      };
      const newPlaylists = [...state.playlists, newPlaylist];
      safeStorageSet('playlists', newPlaylists);
      syncListener?.onPlaylistModified?.(newPlaylist);
      return { playlists: newPlaylists };
    }),
    
    updatePlaylist: (id, updates) => set((state) => {
      const now = Date.now();
      let modifiedPlaylist: Playlist | null = null;
      const newPlaylists = state.playlists.map(p => {
        if (p.id === id) {
          const updated = { ...p, ...updates, updatedAt: now };
          modifiedPlaylist = updated;
          return updated;
        }
        return p;
      });
      safeStorageSet('playlists', newPlaylists);
      if (modifiedPlaylist) {
        syncListener?.onPlaylistModified?.(modifiedPlaylist);
      }
      return { playlists: newPlaylists };
    }),

    setPlaylists: (playlists) => {
      safeStorageSet('playlists', playlists);
      set({ playlists });
    },

    deletePlaylist: (id) => set((state) => {
      const target = state.playlists.find(p => p.id === id);
      if (target) {
        syncListener?.onPlaylistDeleted?.(target.name);
      }
      const newPlaylists = state.playlists.filter(p => p.id !== id);
      safeStorageSet('playlists', newPlaylists);
      return { playlists: newPlaylists };
    }),
    
    addTrackToPlaylist: (playlistId, track) => set((state) => {
      const now = Date.now();
      let modifiedPlaylist: Playlist | null = null;
      const newPlaylists = state.playlists.map(p => {
        if (p.id === playlistId && !p.tracks.some(t => t.id === track.id)) {
          const updated = { ...p, tracks: [...p.tracks, track], updatedAt: now };
          modifiedPlaylist = updated;
          return updated;
        }
        return p;
      });
      safeStorageSet('playlists', newPlaylists);
      if (modifiedPlaylist) {
        syncListener?.onPlaylistModified?.(modifiedPlaylist);
      }
      return { playlists: newPlaylists };
    }),
    
    removeTrackFromPlaylist: (playlistId, trackId) => set((state) => {
      const now = Date.now();
      let modifiedPlaylist: Playlist | null = null;
      const newPlaylists = state.playlists.map(p => {
        if (p.id === playlistId) {
          const updated = { ...p, tracks: p.tracks.filter(t => t.id !== trackId), updatedAt: now };
          modifiedPlaylist = updated;
          return updated;
        }
        return p;
      });
      safeStorageSet('playlists', newPlaylists);
      if (modifiedPlaylist) {
        syncListener?.onPlaylistModified?.(modifiedPlaylist);
      }
      return { playlists: newPlaylists };
    }),

    reorderLikedTracks: (tracks) => set(() => {
      safeStorageSet('liked_tracks', tracks);
      return { likedTracks: tracks };
    }),

    reorderDownloadedTracks: (tracks) => set(() => {
      safeStorageSet('downloaded_tracks', tracks);
      return { downloadedTracks: tracks };
    }),

    reorderPlaylistTracks: (playlistId, tracks) => set((state) => {
      const now = Date.now();
      let modifiedPlaylist: Playlist | null = null;
      const newPlaylists = state.playlists.map(p => {
        if (p.id === playlistId) {
          const updated = { ...p, tracks, updatedAt: now };
          modifiedPlaylist = updated;
          return updated;
        }
        return p;
      });
      safeStorageSet('playlists', newPlaylists);
      if (modifiedPlaylist) {
        syncListener?.onPlaylistModified?.(modifiedPlaylist);
      }
      return { playlists: newPlaylists };
    })
  };
});
