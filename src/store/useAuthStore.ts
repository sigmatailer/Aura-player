import { create } from 'zustand';

export interface CloudUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
}

interface AuthState {
  user: CloudUser | null;
  token: string | null;
  serverUrl: string;
  isSyncing: boolean;
  lastSyncTime: number | null;
  syncStatus: string;
  setUser: (user: CloudUser | null) => void;
  setToken: (token: string | null) => void;
  setServerUrl: (url: string) => void;
  setSyncing: (isSyncing: boolean) => void;
  setLastSyncTime: (time: number) => void;
  setSyncStatus: (status: string) => void;
  logout: () => void;
}

const DEFAULT_SERVER_URL = 'http://31.77.15.175:8090';

export const useAuthStore = create<AuthState>((set) => {
  const savedServer = localStorage.getItem('aura_pb_server') || DEFAULT_SERVER_URL;
  const savedUser = localStorage.getItem('aura_pb_user');
  const savedToken = localStorage.getItem('aura_pb_token');

  return {
    user: savedUser ? JSON.parse(savedUser) : null,
    token: savedToken || null,
    serverUrl: savedServer,
    isSyncing: false,
    lastSyncTime: null,
    syncStatus: 'Готов',

    setUser: (user) => {
      if (user) {
        localStorage.setItem('aura_pb_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('aura_pb_user');
      }
      set({ user });
    },

    setToken: (token) => {
      if (token) {
        localStorage.setItem('aura_pb_token', token);
      } else {
        localStorage.removeItem('aura_pb_token');
      }
      set({ token });
    },

    setServerUrl: (serverUrl) => {
      localStorage.setItem('aura_pb_server', serverUrl);
      set({ serverUrl });
    },

    setSyncing: (isSyncing) => set({ isSyncing }),
    setLastSyncTime: (lastSyncTime) => set({ lastSyncTime }),
    setSyncStatus: (syncStatus) => set({ syncStatus }),

    logout: () => {
      localStorage.removeItem('aura_pb_user');
      localStorage.removeItem('aura_pb_token');
      localStorage.removeItem('pocketbase_auth');
      set({ user: null, token: null, lastSyncTime: null, syncStatus: 'Не авторизован' });
    }
  };
});
