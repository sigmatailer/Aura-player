import { create } from 'zustand';

export interface CloudUser {
  id: string;
  email: string;
  name?: string;
  username?: string;
  avatar?: string;
  banner?: string;
  bio?: string;
  status?: string;
}

interface AuthState {
  user: CloudUser | null;
  token: string | null;
  serverUrl: string;
  isSyncing: boolean;
  lastSyncTime: number | null;
  syncStatus: string;
  isAuthModalOpen: boolean;
  hasSkippedAuthModal: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  skipAuthModal: () => void;
  setUser: (user: CloudUser | null) => void;
  updateUser: (fields: Partial<CloudUser>) => void;
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
  const initialUser = savedUser ? JSON.parse(savedUser) : null;
  const skippedInSession = sessionStorage.getItem('aura_auth_skipped') === 'true';

  return {
    user: initialUser,
    token: savedToken || null,
    serverUrl: savedServer,
    isSyncing: false,
    lastSyncTime: null,
    syncStatus: 'Готов',
    // Если пользователь не залогинен и не нажал "Пропустить", открываем окно сразу при входе
    isAuthModalOpen: !initialUser && !skippedInSession,
    hasSkippedAuthModal: skippedInSession,

    openAuthModal: () => set({ isAuthModalOpen: true }),
    closeAuthModal: () => set({ isAuthModalOpen: false }),
    skipAuthModal: () => {
      sessionStorage.setItem('aura_auth_skipped', 'true');
      set({ isAuthModalOpen: false, hasSkippedAuthModal: true });
    },

    setUser: (user) => {
      if (user) {
        localStorage.setItem('aura_pb_user', JSON.stringify(user));
        sessionStorage.removeItem('aura_auth_skipped');
      } else {
        localStorage.removeItem('aura_pb_user');
      }
      set({ user, isAuthModalOpen: false });
    },

    updateUser: (fields) => {
      set((state) => {
        const cleaned: Partial<CloudUser> = {};
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined) {
            (cleaned as any)[k] = v;
          }
        }
        const updated = state.user 
          ? { ...state.user, ...cleaned }
          : { id: 'local-user', email: 'user@aura.app', name: 'User', username: 'user', ...cleaned };
        localStorage.setItem('aura_pb_user', JSON.stringify(updated));
        return { user: updated as CloudUser };
      });
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
      sessionStorage.removeItem('aura_auth_skipped');
      set({ user: null, token: null, lastSyncTime: null, syncStatus: 'Не авторизован', isAuthModalOpen: true });
    }
  };
});
