import { create } from 'zustand';
import { CloudUser, useAuthStore } from './useAuthStore';
import { pocketBaseService } from '../services/PocketBaseService';

interface FriendsState {
  friends: CloudUser[];
  incomingRequests: CloudUser[];
  outgoingRequests: CloudUser[];
  selectedUser: CloudUser | null;
  isProfileModalOpen: boolean;
  isLoading: boolean;
  
  openProfileModal: (user: CloudUser) => void;
  closeProfileModal: () => void;
  
  sendFriendRequest: (user: CloudUser) => Promise<void>;
  acceptFriendRequest: (userId: string) => Promise<void>;
  rejectFriendRequest: (userId: string) => Promise<void>;
  removeFriend: (userId: string) => Promise<void>;
  cancelOutgoingRequest: (userId: string) => Promise<void>;
  
  getFriendshipStatus: (userId: string) => 'none' | 'friends' | 'incoming' | 'outgoing' | 'self';
  searchUsers: (query: string) => Promise<CloudUser[]>;
  syncWithDatabase: () => Promise<void>;
}

const getStorageKey = () => {
  const currentUserId = useAuthStore.getState().user?.id;
  return currentUserId ? `aura_friends_store_${currentUserId}` : 'aura_friends_store_v2';
};

export const useFriendsStore = create<FriendsState>((set, get) => {
  let initialFriends: CloudUser[] = [];
  let initialIncoming: CloudUser[] = [];
  let initialOutgoing: CloudUser[] = [];

  try {
    const raw = localStorage.getItem(getStorageKey()) || localStorage.getItem('aura_friends_store_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.friends)) {
        initialFriends = parsed.friends.filter((u: CloudUser) => u && u.id);
      }
      if (Array.isArray(parsed.incoming)) {
        initialIncoming = parsed.incoming.filter((u: CloudUser) => u && u.id);
      }
      if (Array.isArray(parsed.outgoing)) {
        initialOutgoing = parsed.outgoing.filter((u: CloudUser) => u && u.id);
      }
    }
  } catch (e) {
    console.warn('Failed to load friends from storage:', e);
  }

  const persist = (friends: CloudUser[], incoming: CloudUser[], outgoing: CloudUser[]) => {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify({ friends, incoming, outgoing }));
      localStorage.removeItem('aura_friends_store_v1');
    } catch {}
  };

  return {
    friends: initialFriends,
    incomingRequests: initialIncoming,
    outgoingRequests: initialOutgoing,
    selectedUser: null,
    isProfileModalOpen: false,
    isLoading: false,

    openProfileModal: (user: CloudUser) => {
      set({ selectedUser: user, isProfileModalOpen: true });
      pocketBaseService.getUserProfile(user.id).then(fresh => {
        if (fresh && get().isProfileModalOpen && get().selectedUser?.id === user.id) {
          set({ selectedUser: { ...user, ...fresh } });
        }
      }).catch(() => {});
    },

    closeProfileModal: () => {
      set({ isProfileModalOpen: false, selectedUser: null });
    },

    getFriendshipStatus: (userId: string) => {
      const currentUserId = useAuthStore.getState().user?.id || pocketBaseService.getUserId();
      if (currentUserId && userId === currentUserId) return 'self';
      if (get().friends.some(f => f.id === userId)) return 'friends';
      if (get().incomingRequests.some(r => r.id === userId)) return 'incoming';
      if (get().outgoingRequests.some(r => r.id === userId)) return 'outgoing';
      return 'none';
    },

    sendFriendRequest: async (targetUser: CloudUser) => {
      const { outgoingRequests, friends } = get();
      if (friends.some(f => f.id === targetUser.id)) return;
      if (outgoingRequests.some(r => r.id === targetUser.id)) return;

      const updatedOutgoing = [...outgoingRequests, targetUser];
      set({ outgoingRequests: updatedOutgoing });
      persist(get().friends, get().incomingRequests, updatedOutgoing);

      try {
        await pocketBaseService.sendFriendRequest(targetUser.id);
        await get().syncWithDatabase();
      } catch (e) {
        console.warn('sendFriendRequest sync error:', e);
      }
    },

    acceptFriendRequest: async (userId: string) => {
      const { incomingRequests, friends } = get();
      const userToAccept = incomingRequests.find(u => u.id === userId);
      if (!userToAccept) return;

      const updatedIncoming = incomingRequests.filter(u => u.id !== userId);
      const updatedFriends = [...friends.filter(f => f.id !== userId), userToAccept];
      set({ friends: updatedFriends, incomingRequests: updatedIncoming });
      persist(updatedFriends, updatedIncoming, get().outgoingRequests);

      try {
        await pocketBaseService.acceptFriendRequest(userId);
        await get().syncWithDatabase();
      } catch (e) {
        console.warn('acceptFriendRequest sync error:', e);
      }
    },

    rejectFriendRequest: async (userId: string) => {
      const { incomingRequests } = get();
      const updatedIncoming = incomingRequests.filter(u => u.id !== userId);
      set({ incomingRequests: updatedIncoming });
      persist(get().friends, updatedIncoming, get().outgoingRequests);

      try {
        await pocketBaseService.rejectFriendRequest(userId);
        await get().syncWithDatabase();
      } catch (e) {
        console.warn('rejectFriendRequest sync error:', e);
      }
    },

    cancelOutgoingRequest: async (userId: string) => {
      const { outgoingRequests } = get();
      const updatedOutgoing = outgoingRequests.filter(u => u.id !== userId);
      set({ outgoingRequests: updatedOutgoing });
      persist(get().friends, get().incomingRequests, updatedOutgoing);

      try {
        await pocketBaseService.cancelOutgoingRequest(userId);
        await get().syncWithDatabase();
      } catch (e) {
        console.warn('cancelOutgoingRequest sync error:', e);
      }
    },

    removeFriend: async (userId: string) => {
      const { friends } = get();
      const updatedFriends = friends.filter(u => u.id !== userId);
      set({ friends: updatedFriends });
      persist(updatedFriends, get().incomingRequests, get().outgoingRequests);

      try {
        await pocketBaseService.removeFriend(userId);
        await get().syncWithDatabase();
      } catch (e) {
        console.warn('removeFriend sync error:', e);
      }
    },

    syncWithDatabase: async () => {
      const currentUserId = useAuthStore.getState().user?.id || pocketBaseService.getUserId();
      if (!currentUserId) return;
      try {
        const isValid = await pocketBaseService.validateSession();
        if (!isValid) return;

        set({ isLoading: true });
        const cloudData = await pocketBaseService.getCloudFriendships();
        const friendIds = new Set(cloudData.friends.map(f => f.id));
        const cleanOutgoing = cloudData.outgoing.filter(u => !friendIds.has(u.id));
        const cleanIncoming = cloudData.incoming.filter(u => !friendIds.has(u.id));
        set({
          friends: cloudData.friends,
          incomingRequests: cleanIncoming,
          outgoingRequests: cleanOutgoing,
          isLoading: false
        });
        persist(cloudData.friends, cleanIncoming, cleanOutgoing);
      } catch (err) {
        set({ isLoading: false });
        console.warn('syncWithDatabase error:', err);
      }
    },

    searchUsers: async (query?: string) => {
      const q = (query || '').trim();
      const currentUserId = useAuthStore.getState().user?.id;
      const resultsMap = new Map<string, CloudUser>();

      // Check PocketBase database for real users only
      try {
        const pbUsers = await pocketBaseService.searchUsers(q);
        for (const u of pbUsers) {
          if (u.id !== currentUserId) {
            resultsMap.set(u.id, u);
          }
        }
      } catch (err) {
        console.warn('Error searching users on PocketBase:', err);
      }

      return Array.from(resultsMap.values());
    }
  };
});

if (typeof window !== 'undefined') {
  window.addEventListener('aura-friends-changed', () => {
    useFriendsStore.getState().syncWithDatabase();
  });
  window.addEventListener('aura-sync-all-complete', () => {
    useFriendsStore.getState().syncWithDatabase();
  });
  window.addEventListener('aura-auth-changed', (e: any) => {
    const user = e.detail?.user;
    if (user?.id) {
      useFriendsStore.getState().syncWithDatabase();
    } else {
      useFriendsStore.setState({ friends: [], incomingRequests: [], outgoingRequests: [] });
    }
  });
}
