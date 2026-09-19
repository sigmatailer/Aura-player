import { create } from 'zustand';

export type ModalType = 'create_playlist' | 'select_playlist' | 'alert';

interface ModalState {
  isOpen: boolean;
  type: ModalType | null;
  title: string;
  message: string;
  defaultValue: string;
  options: { id: string, name: string }[];
  onConfirm: (val: string) => void;
  
  openCreatePlaylist: (title: string, defaultValue: string, onConfirm: (name: string) => void) => void;
  openSelectPlaylist: (playlists: {id: string, name: string}[], onConfirm: (id: string) => void) => void;
  openAlert: (message: string) => void;
  close: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  isOpen: false,
  type: null,
  title: '',
  message: '',
  defaultValue: '',
  options: [],
  onConfirm: () => {},

  openCreatePlaylist: (title, defaultValue, onConfirm) => set({
    isOpen: true,
    type: 'create_playlist',
    title,
    defaultValue,
    onConfirm
  }),

  openSelectPlaylist: (playlists, onConfirm) => set({
    isOpen: true,
    type: 'select_playlist',
    options: playlists,
    title: 'Выберите плейлист',
    onConfirm
  }),

  openAlert: (message) => set({
    isOpen: true,
    type: 'alert',
    message,
    title: 'Внимание',
    onConfirm: () => {}
  }),

  close: () => set({ isOpen: false, type: null })
}));
