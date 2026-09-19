import { create } from 'zustand';

export type ArtistViewMode = 'drawer' | 'modal';

interface ArtistState {
  isOpen: boolean;
  artistName: string | null;
  artistId: string | null;
  viewMode: ArtistViewMode;
  openArtist: (name: string, artistId?: string | null, viewMode?: ArtistViewMode) => void;
  closeArtist: () => void;
}

export const useArtistStore = create<ArtistState>((set) => ({
  isOpen: false,
  artistName: null,
  artistId: null,
  viewMode: 'drawer',

  openArtist: (name: string, artistId?: string | null, viewMode: ArtistViewMode = 'drawer') => {
    if (!name || !name.trim()) return;
    set({
      isOpen: true,
      artistName: name.trim(),
      artistId: artistId ? String(artistId) : null,
      viewMode,
    });
  },

  closeArtist: () => {
    set({
      isOpen: false,
      artistName: null,
      artistId: null,
      viewMode: 'drawer',
    });
  },
}));
