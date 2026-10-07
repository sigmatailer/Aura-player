import PocketBase from 'pocketbase';
import { useAuthStore, CloudUser } from '../store/useAuthStore';
import { useFriendsStore } from '../store/useFriendsStore';
import { useThemeStore } from '../store/useThemeStore';
import { useCollectionStore, Playlist, setCollectionSyncListener } from '../store/useCollectionStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { Track } from '../types';

const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

async function makePortableCover(url?: string): Promise<string> {
  if (!url) return '';
  if (url.startsWith('data:') || (url.startsWith('https://') && !url.includes('localhost'))) {
    return url;
  }
  if (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
    return url;
  }

  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise<string>((resolve) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(blob);
      img.onload = () => {
        const maxDim = 800;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } else {
          resolve(url);
        }
        URL.revokeObjectURL(objUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve(url);
      };
      img.src = objUrl;
    });
  } catch (err) {
    console.warn('Failed to convert cover to portable format:', err);
    return url;
  }
}

async function getBlobWithTimeout(url: string, timeoutMs: number = 3000): Promise<Blob | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return await res.blob();
  } catch (e) {
    console.warn('getBlobWithTimeout failed or timed out:', e);
    return null;
  }
}

class PocketBaseService {
  public pb: PocketBase;
  private unsubscribeFavorites: (() => void) | null = null;
  private unsubscribePlaylists: (() => void) | null = null;
  private unsubscribeDevices: (() => void) | null = null;
  private unsubscribeUser: (() => void) | null = null;
  private unsubscribeHistory: (() => void) | null = null;
  private unsubscribeForYou: (() => void) | null = null;
  private unsubscribeFriendRequests: (() => void) | null = null;
  private isSyncingFavorites: boolean = false;
  private isSyncingPlaylists: boolean = false;
  private isSyncingHistory: boolean = false;
  private isSyncingForYou: boolean = false;
  private isInternalSync: boolean = false;
  private historyDebounceTimer: any = null;
  private forYouDebounceTimer: any = null;
  private deviceListeners = new Set<() => void>();

  private profileUpdateSeq: number = 0;
  private cloudCustomizationCache = new Map<string, { data: Record<string, any>; timestamp: number }>();

  public getLocalCustomization(userId?: string): { nicknameFont?: any; nicknameEffect?: any; profileColor?: string } {
    try {
      const key = userId ? `aura_user_custom_${userId}` : 'aura_user_custom_current';
      const item = localStorage.getItem(key) || localStorage.getItem('aura_user_custom_current');
      return item ? JSON.parse(item) : {};
    } catch {
      return {};
    }
  }

  public saveLocalCustomization(userId: string | undefined, data: { nicknameFont?: any; nicknameEffect?: any; profileColor?: string }) {
    try {
      const existing = this.getLocalCustomization(userId);
      const updated = { ...existing, ...data };
      if (userId) {
        localStorage.setItem(`aura_user_custom_${userId}`, JSON.stringify(updated));
      }
      localStorage.setItem('aura_user_custom_current', JSON.stringify(updated));
    } catch {}
  }

  public async saveCloudCustomization(userId: string, data: Record<string, any>) {
    if (!userId || !this.isLoggedIn()) return;
    try {
      const existing = await this.pb.collection('playlists').getList(1, 1, {
        filter: `user = "${userId}" && name = "__aura_user_profile__"`
      });
      let currentData: Record<string, any> = {};
      if (existing.items.length > 0 && existing.items[0].tracks_json) {
        const tj = existing.items[0].tracks_json;
        currentData = (typeof tj === 'object' && !Array.isArray(tj)) ? tj : (Array.isArray(tj) && tj.length > 0 && typeof tj[0] === 'object' ? tj[0] : {});
      }
      const mergedData = { ...currentData, ...data };
      if (existing.items.length > 0) {
        await this.pb.collection('playlists').update(existing.items[0].id, {
          tracks_json: mergedData
        });
      } else {
        await this.pb.collection('playlists').create({
          user: userId,
          name: '__aura_user_profile__',
          tracks_json: mergedData,
          cover_url: ''
        });
      }
      this.cloudCustomizationCache.set(userId, { data: mergedData, timestamp: Date.now() });
    } catch (err) {
      console.warn('saveCloudCustomization error:', err);
    }
  }

  public async getCloudCustomization(userId: string): Promise<Record<string, any> | null> {
    if (!userId) return null;
    const cached = this.cloudCustomizationCache.get(userId);
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached.data;
    }
    try {
      const res = await this.pb.collection('playlists').getList(1, 1, {
        filter: `user = "${userId}" && name = "__aura_user_profile__"`
      });
      if (res.items.length > 0) {
        const tj = res.items[0].tracks_json;
        const data = (typeof tj === 'object' && !Array.isArray(tj)) ? tj : (Array.isArray(tj) && tj.length > 0 && typeof tj[0] === 'object' ? tj[0] : {});
        this.cloudCustomizationCache.set(userId, { data, timestamp: Date.now() });
        return data;
      }
    } catch (err) {
      console.warn('getCloudCustomization error:', err);
    }
    return null;
  }

  public formatUserRecord(record: any): CloudUser {
    const parseMedia = (val?: string) => {
      if (!val) return undefined;
      if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:') || val.startsWith('blob:')) {
        return val;
      }
      try {
        return this.pb.files.getURL(record, val);
      } catch {
        return val;
      }
    };

    const localCustom = this.getLocalCustomization(record.id);

    return {
      id: record.id,
      email: record.email,
      name: record.name || record.username,
      username: record.username || record.name,
      avatar: parseMedia(record.avatar),
      banner: parseMedia(record.banner),
      bgUrl: parseMedia(record.bg_url || record.bgUrl),
      status: record.status || undefined,
      bio: record.bio || undefined,
      profileColor: record.profile_color || record.profileColor || localCustom.profileColor || undefined,
      nicknameFont: (record.nickname_font || record.nicknameFont || localCustom.nicknameFont) || undefined,
      nicknameEffect: (record.nickname_effect || record.nicknameEffect || localCustom.nicknameEffect) || undefined,
      discord: record.discord || undefined,
      telegram: record.telegram || undefined,
      website: record.website || undefined,
      pinnedTrackId: record.pinned_track_id || record.pinnedTrackId || undefined,
      pinnedTrackTitle: record.pinned_track_title || record.pinnedTrackTitle || undefined,
      pinnedTrackArtist: record.pinned_track_artist || record.pinnedTrackArtist || undefined,
      pinnedTrackCover: record.pinned_track_cover || record.pinnedTrackCover || undefined,
      created: record.created,
      updated: record.updated,
      accountNumber: record.account_number || record.accountNumber || undefined,
      friendsCount: record.friends_count || record.friendsCount || undefined,
      subscribersCount: record.subscribers_count || record.subscribersCount || undefined
    };
  }

  constructor() {
    const url = useAuthStore.getState().serverUrl || 'http://31.77.15.175:8090';
    this.pb = new PocketBase(url);
    this.pb.autoCancellation(false);

    // Keep PocketBase authStore synchronized with localStorage and authStore
    this.pb.authStore.onChange((token, record) => {
      if (token && record) {
        localStorage.setItem('aura_pb_token', token);
        localStorage.setItem('aura_pb_user', JSON.stringify(record));
        useAuthStore.getState().setToken(token);
      }
    });

    // Ensure PocketBase authStore is in sync with localStorage tokens
    const savedToken = localStorage.getItem('aura_pb_token');
    const savedUser = localStorage.getItem('aura_pb_user');
    if (!this.pb.authStore.isValid && savedToken && savedUser) {
      try {
        const userObj = JSON.parse(savedUser);
        this.pb.authStore.save(savedToken, userObj);
      } catch (e) {
        console.warn('Failed to restore authStore:', e);
      }
    }

    const activeUid = this.getUserId();
    if (activeUid) {
      const record = this.pb.authStore.record || useAuthStore.getState().user;
      if (record) {
        const formatted = this.formatUserRecord(record);
        const currentUser = useAuthStore.getState().user;
        const localCustom = this.getLocalCustomization(activeUid);
        useAuthStore.getState().setUser({
          ...formatted,
          nicknameFont: formatted.nicknameFont || currentUser?.nicknameFont || localCustom.nicknameFont,
          nicknameEffect: formatted.nicknameEffect || currentUser?.nicknameEffect || localCustom.nicknameEffect,
          profileColor: formatted.profileColor || currentUser?.profileColor || localCustom.profileColor,
          avatar: formatted.avatar || currentUser?.avatar,
          banner: formatted.banner || currentUser?.banner,
          bgUrl: formatted.bgUrl || currentUser?.bgUrl,
          status: formatted.status || currentUser?.status,
          bio: formatted.bio || currentUser?.bio
        });
      }
      this.getCloudCustomization(activeUid).then(cloud => {
        if (cloud) {
          useAuthStore.getState().updateUser({
            ...(cloud.nicknameFont ? { nicknameFont: cloud.nicknameFont } : {}),
            ...(cloud.nicknameEffect ? { nicknameEffect: cloud.nicknameEffect } : {}),
            ...(cloud.profileColor ? { profileColor: cloud.profileColor } : {}),
            ...(cloud.status ? { status: cloud.status } : {}),
            ...(cloud.bio ? { bio: cloud.bio } : {}),
            ...(cloud.banner ? { banner: cloud.banner } : {}),
            ...(cloud.bgUrl ? { bgUrl: cloud.bgUrl } : {})
          });
          if (cloud.bgUrl) {
            useThemeStore.getState().setSlotMedia(0, {
              id: 'bg-cloud',
              name: 'Фон',
              url: cloud.bgUrl,
              type: 'image'
            });
          }
        }
      }).catch(() => {});
      this.refreshTokenIfNeeded().catch(() => {});
      this.subscribeRealtime();
      this.validateSession().catch(() => {});
      setTimeout(() => {
        this.syncAll().catch(err => console.warn('Startup syncAll error:', err));
        this.updateDevicePresence(null, 0, false);
      }, 500);
    }

    // Dynamic presence heartbeat: every 7s
    if (typeof window !== 'undefined') {
      setInterval(() => {
        if (this.isLoggedIn()) {
          const playerState = usePlayerStore.getState();
          const curTrack = playerState.currentTrackIndex >= 0 ? playerState.queue[playerState.currentTrackIndex] : null;
          this.updateDevicePresence(curTrack, playerState.progress || 0, playerState.isPlaying, playerState.playbackContext);
        }
      }, 7000);
    }

    // Auto-resync when connection is restored, window focused, or screen wakes on mobile
    if (typeof window !== 'undefined') {
      const handleWakeOrFocus = async () => {
        if (!this.isLoggedIn()) return;
        try {
          await this.refreshTokenIfNeeded();
          this.subscribeRealtime();
          await this.syncAll();
          const ps = usePlayerStore.getState();
          const curTrack = ps.currentTrackIndex >= 0 ? ps.queue[ps.currentTrackIndex] : null;
          this.updateDevicePresence(curTrack, ps.progress || 0, ps.isPlaying, ps.playbackContext);
        } catch {}
      };

      window.addEventListener('online', handleWakeOrFocus);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          handleWakeOrFocus();
        }
      });
      window.addEventListener('focus', handleWakeOrFocus);
      window.addEventListener('pageshow', handleWakeOrFocus);
    }

    // Register collection store sync listener
    setCollectionSyncListener({
      onTrackLiked: (track, isLiked) => this.onTrackLiked(track, isLiked),
      onPlaylistModified: (playlist) => this.onPlaylistModified(playlist),
      onPlaylistDeleted: (name) => this.onPlaylistDeleted(name)
    });

    // Immediate presence updates on play/pause or track change
    let lastPresenceTrackId: string | null = null;
    let lastPresencePlaying: boolean = false;
    let presenceDebounce: any = null;

    usePlayerStore.subscribe((state, prevState) => {
      // Sync history
      if (state.history !== prevState.history && !this.isInternalSync && !this.isSyncingHistory && this.isLoggedIn()) {
        this.pushHistory(state.history || []);
      }

      // Sync presence immediately on state change
      if (!this.isLoggedIn()) return;
      const curTrack = state.currentTrackIndex >= 0 ? state.queue[state.currentTrackIndex] : null;
      const curTrackId = curTrack?.id || null;
      const isPlaying = !!state.isPlaying;

      if (curTrackId !== lastPresenceTrackId || isPlaying !== lastPresencePlaying) {
        lastPresenceTrackId = curTrackId;
        lastPresencePlaying = isPlaying;
        if (presenceDebounce) clearTimeout(presenceDebounce);
        presenceDebounce = setTimeout(() => {
          this.updateDevicePresence(curTrack, state.progress || 0, isPlaying, state.playbackContext);
        }, 300);
      }
    });
  }

  public async refreshTokenIfNeeded(): Promise<boolean> {
    const token = this.pb.authStore.token || localStorage.getItem('aura_pb_token');
    if (!token) return false;
    try {
      await this.pb.collection('users').authRefresh({ requestKey: null });
      return true;
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 404) {
        console.warn('Session refresh invalid, validating session...');
        this.validateSession().catch(() => {});
        return false;
      }
      return true;
    }
  }

  public async validateSession(): Promise<boolean> {
    const userId = this.getUserId();
    if (!userId) return false;
    try {
      const userRecord = await this.pb.collection('users').getOne(userId, { requestKey: null });
      if (!userRecord || !userRecord.id) {
        throw { status: 404, message: 'User not found in PocketBase users collection' };
      }
      return true;
    } catch (err: any) {
      if (err?.status === 404) {
        console.warn('Account does not exist in database, logging out:', err?.message || err);
        this.logoutLocally();
        return false;
      }
      // Network errors (status 0, offline, timeouts) must NEVER log the user out!
      return true;
    }
  }

  public logoutLocally() {
    this.pb.authStore.clear();
    localStorage.removeItem('aura_pb_token');
    localStorage.removeItem('aura_pb_user');
    localStorage.removeItem('pocketbase_auth');
    useAuthStore.getState().logout();
    useFriendsStore.setState({ friends: [], incomingRequests: [], outgoingRequests: [] });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aura-auth-changed', { detail: { user: null } }));
    }
  }

  public onDevicesChanged(cb: () => void): () => void {
    this.deviceListeners.add(cb);
    return () => {
      this.deviceListeners.delete(cb);
    };
  }

  private notifyDeviceListeners() {
    this.deviceListeners.forEach(cb => {
      try { cb(); } catch {}
    });
  }

  public getClientDeviceId(): string {
    if (typeof window === 'undefined') return 'device_main';
    let id = localStorage.getItem('aura_client_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
      localStorage.setItem('aura_client_device_id', id);
    }
    return id;
  }

  public cleanDeviceName(rawName?: string): string {
    if (!rawName) return 'Устройство Aura';
    let name = rawName.split(':::')[0].trim();
    name = name.replace(/\s*\[id:[^\]]+\]\s*/g, '').trim();
    return name || 'Устройство Aura';
  }

  public isCurrentDevice(dev: any): boolean {
    if (!dev) return false;
    const savedId = typeof window !== 'undefined' ? localStorage.getItem('aura_my_device_record_id') : null;
    if (savedId && dev.id === savedId) return true;
    const myDeviceId = this.getClientDeviceId();
    if (dev.device_name && dev.device_name.includes(`[id:${myDeviceId}]`)) return true;
    const myCleanName = this.getDeviceName();
    return this.cleanDeviceName(dev.device_name) === myCleanName;
  }

  public getDeviceName(): string {
    if (isAndroid) return 'Android Устройство';
    if (isIOS) return 'iPhone / iPad';
    return 'Компьютер (ПК)';
  }

  public isLoggedIn(): boolean {
    return !!this.getUserId();
  }

  public getUserId(): string | null {
    return this.pb.authStore.record?.id || useAuthStore.getState().user?.id || null;
  }

  private userOrderCache: { list: string[]; timestamp: number } | null = null;

  public async getUserOrderNumber(_userCreated?: string, userId?: string): Promise<number> {
    const uid = userId || this.getUserId();
    if (!uid) return 1;

    try {
      const now = Date.now();
      if (!this.userOrderCache || now - this.userOrderCache.timestamp > 30000) {
        const records = await this.pb.collection('users').getFullList({
          sort: '+created',
          fields: 'id,created'
        });
        this.userOrderCache = {
          list: records.map(r => r.id),
          timestamp: now
        };
      }

      const idx = this.userOrderCache.list.indexOf(uid);
      if (idx !== -1) {
        return idx + 1;
      }
    } catch (e) {
      console.warn('getUserOrderNumber failed:', e);
    }

    return 1;
  }


  public async login(identity: string, pass: string) {
    try {
      useAuthStore.getState().setSyncStatus('Авторизация...');
      const cleanIdentity = identity.trim();
      let resolvedIdentity = cleanIdentity;
      const lower = cleanIdentity.toLowerCase();

      // Case-insensitive lookup for username or email
      try {
        const usersList = await this.pb.collection('users').getFullList({
          fields: 'id,username,email,name',
          requestKey: null
        });
        const matched = usersList.find(u => 
          (u.username && u.username.toLowerCase() === lower) ||
          (u.email && u.email.toLowerCase() === lower) ||
          (u.name && u.name.toLowerCase() === lower)
        );
        if (matched) {
          resolvedIdentity = matched.username || matched.email || cleanIdentity;
        }
      } catch (err) {
        console.warn('Case-insensitive login lookup fallback:', err);
      }

      const authData = await this.pb.collection('users').authWithPassword(resolvedIdentity, pass);
      const record = authData.record;
      const formatted = this.formatUserRecord(record);
      const currentUser = useAuthStore.getState().user;
      const localCustom = this.getLocalCustomization(record.id);
      useAuthStore.getState().setUser({
        ...formatted,
        nicknameFont: formatted.nicknameFont || currentUser?.nicknameFont || localCustom.nicknameFont,
        nicknameEffect: formatted.nicknameEffect || currentUser?.nicknameEffect || localCustom.nicknameEffect,
        profileColor: formatted.profileColor || currentUser?.profileColor || localCustom.profileColor,
        avatar: formatted.avatar || currentUser?.avatar,
        banner: formatted.banner || currentUser?.banner,
        status: formatted.status || currentUser?.status,
        bio: formatted.bio || currentUser?.bio
      });
      useAuthStore.getState().setToken(authData.token);
      useAuthStore.getState().setSyncStatus('Успешно');

      this.getCloudCustomization(record.id).then(cloud => {
        if (cloud) {
          useAuthStore.getState().updateUser({
            ...(cloud.nicknameFont ? { nicknameFont: cloud.nicknameFont } : {}),
            ...(cloud.nicknameEffect ? { nicknameEffect: cloud.nicknameEffect } : {}),
            ...(cloud.profileColor ? { profileColor: cloud.profileColor } : {}),
            ...(cloud.status ? { status: cloud.status } : {}),
            ...(cloud.bio ? { bio: cloud.bio } : {}),
            ...(cloud.banner ? { banner: cloud.banner } : {}),
            ...(cloud.bgUrl ? { bgUrl: cloud.bgUrl } : {})
          });
          if (cloud.bgUrl) {
            useThemeStore.getState().setSlotMedia(0, {
              id: 'bg-cloud',
              name: 'Фон',
              url: cloud.bgUrl,
              type: 'image'
            });
          }
        }
      }).catch(() => {});

      this.subscribeRealtime();
      await this.syncAll();
      this.updateDevicePresence(null, 0, false);
      this.publishUserCard(formatted);
      return { success: true };
    } catch (err: any) {
      console.error('PocketBase login error:', err);
      useAuthStore.getState().setSyncStatus('Ошибка входа');
      let msg = 'Ошибка входа';
      if (err?.status === 0 || (err?.name === 'ClientResponseError' && err?.status === 0)) {
        msg = 'Не удалось подключиться к серверу. Проверьте интернет или сетевое соединение.';
      } else if (err?.status === 400) {
        msg = 'Неверная почта/логин или пароль';
      } else if (err?.data?.message) {
        msg = err.data.message;
      } else if (err?.message) {
        msg = err.message;
      }
      return { success: false, error: msg };
    }
  }

  public async register(email: string, pass: string, passConfirm: string, name: string) {
    try {
      useAuthStore.getState().setSyncStatus('Регистрация...');
      const cleanName = name.trim();
      const cleanEmail = email.trim();
      const cleanUsername = cleanName.replace(/[^a-zA-Z0-9_]/g, '_');
      const lowerUsername = cleanUsername.toLowerCase();
      const lowerName = cleanName.toLowerCase();
      const lowerEmail = cleanEmail.toLowerCase();

      // Case-insensitive uniqueness check
      try {
        const existingUsers = await this.pb.collection('users').getFullList({
          fields: 'id,username,email,name',
          requestKey: null
        });

        const isUsernameTaken = existingUsers.some(u => 
          (u.username && u.username.toLowerCase() === lowerUsername) ||
          (u.name && u.name.toLowerCase() === lowerName) ||
          (u.username && u.username.toLowerCase() === lowerName)
        );

        if (isUsernameTaken) {
          useAuthStore.getState().setSyncStatus('Ошибка регистрации');
          return {
            success: false,
            error: `Имя пользователя «${cleanName}» уже занято. Пожалуйста, выберите другое.`
          };
        }

        const isEmailTaken = existingUsers.some(u => 
          u.email && u.email.toLowerCase() === lowerEmail
        );

        if (isEmailTaken) {
          useAuthStore.getState().setSyncStatus('Ошибка регистрации');
          return {
            success: false,
            error: `Почта «${cleanEmail}» уже зарегистрирована.`
          };
        }
      } catch (checkErr) {
        console.warn('Case-insensitive pre-check error:', checkErr);
      }

      await this.pb.collection('users').create({
        email: cleanEmail,
        password: pass,
        passwordConfirm: passConfirm,
        name: cleanName,
        username: cleanUsername || undefined,
      });
      return await this.login(cleanEmail, pass);
    } catch (err: any) {
      console.error('PocketBase register error:', err);
      useAuthStore.getState().setSyncStatus('Ошибка регистрации');
      let msg = 'Ошибка регистрации';
      if (err?.status === 0) {
        msg = 'Не удалось подключиться к серверу. Проверьте подключение к интернету.';
      } else if (err?.data?.email?.code === 'validation_not_unique') {
        msg = 'Пользователь с такой почтой уже зарегистрирован';
      } else if (err?.data?.name?.code === 'validation_not_unique') {
        msg = `Имя пользователя "${name}" уже занято. Придумайте другое`;
      } else if (err?.data?.passwordConfirm) {
        msg = 'Пароли не совпадают';
      } else if (err?.data?.password) {
        msg = 'Пароль должен содержать минимум 8 символов';
      } else if (err?.data?.email) {
        msg = 'Некорректный адрес электронной почты';
      } else if (err?.message && !err.message.includes('Something went wrong')) {
        msg = err.message;
      }
      return { success: false, error: msg };
    }
  }

  public async updateProfile(fields: {
    name?: string;
    username?: string;
    avatar?: string;
    banner?: string;
    bgUrl?: string;
    status?: string;
    bio?: string;
    profileColor?: string;
    nicknameFont?: 'default' | 'caveat' | 'spray' | 'beastly' | 'pixel' | 'retro';
    nicknameEffect?: 'none' | 'animated' | 'neon' | 'cartoon' | 'highlight' | '3d' | 'retro';
    discord?: string;
    telegram?: string;
    website?: string;
    pinnedTrackId?: string;
    pinnedTrackTitle?: string;
    pinnedTrackArtist?: string;
    pinnedTrackCover?: string;
    avatarBlob?: Blob;
    bannerBlob?: Blob;
  }) {
    const userId = this.getUserId();
    const currentSeq = ++this.profileUpdateSeq;

    // Cache customization locally immediately so it's never lost
    if (fields.nicknameFont !== undefined || fields.nicknameEffect !== undefined || fields.profileColor !== undefined) {
      this.saveLocalCustomization(userId || undefined, {
        ...(fields.nicknameFont !== undefined ? { nicknameFont: fields.nicknameFont } : {}),
        ...(fields.nicknameEffect !== undefined ? { nicknameEffect: fields.nicknameEffect } : {}),
        ...(fields.profileColor !== undefined ? { profileColor: fields.profileColor } : {})
      });
    }

    // 1. Immediately update client-side auth store & local storage
    useAuthStore.getState().updateUser({
      name: fields.name,
      avatar: fields.avatar,
      banner: fields.banner,
      bgUrl: fields.bgUrl,
      status: fields.status,
      bio: fields.bio,
      profileColor: fields.profileColor,
      nicknameFont: fields.nicknameFont,
      nicknameEffect: fields.nicknameEffect,
      discord: fields.discord,
      telegram: fields.telegram,
      website: fields.website,
      pinnedTrackId: fields.pinnedTrackId,
      pinnedTrackTitle: fields.pinnedTrackTitle,
      pinnedTrackArtist: fields.pinnedTrackArtist,
      pinnedTrackCover: fields.pinnedTrackCover
    });

    if (!userId || !this.isLoggedIn()) {
      return { success: true, localOnly: true };
    }

    // Asynchronously persist customizations to cloud profile in playlists collection (__aura_user_profile__)
    this.saveCloudCustomization(userId, {
      ...(fields.nicknameFont !== undefined ? { nicknameFont: fields.nicknameFont } : {}),
      ...(fields.nicknameEffect !== undefined ? { nicknameEffect: fields.nicknameEffect } : {}),
      ...(fields.profileColor !== undefined ? { profileColor: fields.profileColor } : {}),
      ...(fields.status !== undefined ? { status: fields.status } : {}),
      ...(fields.bio !== undefined ? { bio: fields.bio } : {}),
      ...(fields.banner !== undefined ? { banner: fields.banner } : {}),
      ...(fields.bgUrl !== undefined ? { bgUrl: fields.bgUrl } : {}),
      ...(fields.avatar !== undefined ? { avatar: fields.avatar } : {}),
      ...(fields.discord !== undefined ? { discord: fields.discord } : {}),
      ...(fields.telegram !== undefined ? { telegram: fields.telegram } : {}),
      ...(fields.website !== undefined ? { website: fields.website } : {})
    });

    try {
      // 2. Prepare FormData so PocketBase receives avatar as proper binary blob for users collection
      const formData = new FormData();
      if (fields.name) formData.append('name', fields.name);
      if (fields.username) formData.append('username', fields.username);

      // Only upload avatar if a binary blob is provided, or if fields.avatar is a new local/external file
      if (fields.avatarBlob) {
        formData.append('avatar', fields.avatarBlob, 'avatar.jpg');
      } else if (fields.avatar === '') {
        formData.append('avatar', '');
      } else if (fields.avatar) {
        const isPbFile = fields.avatar.includes('/api/files/') || (this.pb.baseUrl && fields.avatar.includes(this.pb.baseUrl));
        if (!isPbFile) {
          try {
            const blob = await getBlobWithTimeout(fields.avatar, 3000);
            if (blob) {
              formData.append('avatar', blob, 'avatar.jpg');
            }
          } catch (e) {
            console.warn('Avatar blob fetch error:', e);
          }
        }
      }

      try {
        const record = await this.pb.collection('users').update(userId, formData);
        if (currentSeq !== this.profileUpdateSeq) {
          return { success: true, record };
        }
        const formatted = this.formatUserRecord(record);
        const currentUser = useAuthStore.getState().user;
        const localCustom = this.getLocalCustomization(userId);
        const mergedUser = {
          ...formatted,
          nicknameFont: fields.nicknameFont || formatted.nicknameFont || currentUser?.nicknameFont || localCustom.nicknameFont,
          nicknameEffect: fields.nicknameEffect || formatted.nicknameEffect || currentUser?.nicknameEffect || localCustom.nicknameEffect,
          profileColor: fields.profileColor || formatted.profileColor || currentUser?.profileColor || localCustom.profileColor,
          avatar: fields.avatar === '' ? '' : (formatted.avatar || fields.avatar || currentUser?.avatar),
          banner: fields.banner === '' ? '' : (fields.banner || formatted.banner || currentUser?.banner),
          bgUrl: fields.bgUrl === '' ? '' : (fields.bgUrl || formatted.bgUrl || currentUser?.bgUrl)
        };
        useAuthStore.getState().updateUser(mergedUser);
        this.publishUserCard(mergedUser);
        return { success: true, record };
      } catch (err: any) {
        console.warn('FormData profile update failed, falling back to standard fields:', err);
        if (currentSeq !== this.profileUpdateSeq) {
          return { success: true };
        }
        const currentUser = useAuthStore.getState().user;
        const localCustom = this.getLocalCustomization(userId);
        const mergedUser = {
          nicknameFont: fields.nicknameFont || currentUser?.nicknameFont || localCustom.nicknameFont,
          nicknameEffect: fields.nicknameEffect || currentUser?.nicknameEffect || localCustom.nicknameEffect,
          profileColor: fields.profileColor || currentUser?.profileColor || localCustom.profileColor,
          banner: fields.banner || currentUser?.banner,
          bgUrl: fields.bgUrl || currentUser?.bgUrl
        };
        useAuthStore.getState().updateUser(mergedUser);
        const standardPayload: Record<string, any> = {};
        if (fields.name !== undefined) standardPayload.name = fields.name;
        if (fields.username !== undefined) standardPayload.username = fields.username;
        if (Object.keys(standardPayload).length > 0) {
          try {
            await this.pb.collection('users').update(userId, standardPayload);
          } catch {}
        }
        const currentFull = useAuthStore.getState().user;
        if (currentFull) this.publishUserCard(currentFull);
        return { success: true };
      }
    } catch (err) {
      console.warn('Failed to update PocketBase profile:', err);
      return { success: false, error: err };
    }
  }

  public async publishUserCard(user: CloudUser) {
    if (!user || !user.id || !this.isLoggedIn()) return;
    try {
      const cardPayload = {
        user: user.id,
        track_id: '__aura_user_card__',
        title: user.username || user.name || 'User',
        artist: user.name || user.username || 'User',
        device_info: JSON.stringify({
          id: user.id,
          username: user.username || user.name,
          name: user.name || user.username,
          avatar: user.avatar,
          banner: user.banner,
          profileColor: user.profileColor,
          nicknameFont: user.nicknameFont,
          nicknameEffect: user.nicknameEffect,
          status: user.status,
          bio: user.bio,
          discord: user.discord,
          telegram: user.telegram,
          website: user.website,
          pinnedTrackId: user.pinnedTrackId,
          pinnedTrackTitle: user.pinnedTrackTitle,
          pinnedTrackArtist: user.pinnedTrackArtist,
          pinnedTrackCover: user.pinnedTrackCover,
          created: user.created,
          accountNumber: user.accountNumber
        }),
        listened_seconds: 0,
        total_duration: 0,
        is_skipped: false,
        is_completed: false
      };

      try {
        await this.pb.collection('wave_analytics').create(cardPayload);
      } catch (err) {
        console.warn('publishUserCard create error:', err);
      }
    } catch (e) {
      console.warn('publishUserCard failed:', e);
    }
  }

  public async searchUsers(query: string): Promise<CloudUser[]> {
    const q = (query || '').trim().replace(/^@/, '');
    const resultsMap = new Map<string, CloudUser>();

    try {
      // 1. Search directly in PocketBase users collection
      const filter = q ? `username ~ "${q}" || name ~ "${q}"` : undefined;
      const records = await this.pb.collection('users').getList(1, 50, { 
        filter,
        sort: '+created',
        requestKey: null
      });

      // 2. Fetch all user IDs in registration order to calculate exact account number
      const allUsers = await this.pb.collection('users').getFullList({
        sort: '+created',
        fields: 'id',
        requestKey: null
      }).catch(() => []);
      const orderMap = new Map<string, number>();
      allUsers.forEach((u, idx) => orderMap.set(u.id, idx + 1));

      for (const r of records.items) {
        const u = this.formatUserRecord(r);
        u.accountNumber = orderMap.get(u.id) || 1;
        resultsMap.set(u.id, u);
      }
    } catch (err) {
      console.warn('Failed to query users from PocketBase:', err);
    }

    const users = Array.from(resultsMap.values());

    // 3. Enhance with real cloud profile customizations, presence & wave_analytics stats
    const enhancedUsers = await Promise.all(users.map(async (u) => {
      try {
        const [cloudCustom, presence, analyticsRes] = await Promise.all([
          this.getCloudCustomization(u.id),
          this.getUserPresence(u.id),
          this.pb.collection('wave_analytics').getList(1, 100, {
            filter: `user = "${u.id}" && track_id != "__aura_user_card__"`,
            requestKey: null
          }).catch(() => ({ totalItems: 0, items: [] }))
        ]);

        let plays = cloudCustom?.analytics?.totalPlays;
        let hours = cloudCustom?.analytics?.totalHoursFormatted;

        if (plays === undefined || hours === undefined) {
          const rawPlays = analyticsRes.totalItems || 0;
          let totalSec = 0;
          if (rawPlays > 0) {
            if (analyticsRes.items && analyticsRes.items.length > 0) {
              analyticsRes.items.forEach((it: any) => {
                const itemSec = (it.listened_seconds && it.listened_seconds >= 60)
                  ? it.listened_seconds
                  : (it.total_duration && it.total_duration > 30 ? it.total_duration : 175);
                totalSec += itemSec;
              });
              const avgSec = totalSec / analyticsRes.items.length;
              totalSec = Math.round(avgSec * rawPlays);
            } else {
              totalSec = rawPlays * 175;
            }
          }
          plays = rawPlays;
          hours = (Math.max(0.1, totalSec / 3600)).toFixed(1).replace('.', ',');
        }

        return {
          ...u,
          avatar: cloudCustom?.avatar || u.avatar,
          banner: cloudCustom?.banner || u.banner,
          profileColor: cloudCustom?.profileColor || u.profileColor,
          nicknameFont: cloudCustom?.nicknameFont || u.nicknameFont,
          nicknameEffect: cloudCustom?.nicknameEffect || u.nicknameEffect,
          status: cloudCustom?.status || u.status,
          bio: cloudCustom?.bio || u.bio,
          discord: cloudCustom?.discord || u.discord,
          telegram: cloudCustom?.telegram || u.telegram,
          website: cloudCustom?.website || u.website,
          pinnedTrackId: cloudCustom?.pinnedTrackId || u.pinnedTrackId,
          pinnedTrackTitle: cloudCustom?.pinnedTrackTitle || u.pinnedTrackTitle,
          pinnedTrackArtist: cloudCustom?.pinnedTrackArtist || u.pinnedTrackArtist,
          pinnedTrackCover: cloudCustom?.pinnedTrackCover || u.pinnedTrackCover,
          totalPlays: plays,
          totalHours: hours,
          activePresence: presence ? {
            isPlaying: presence.isPlaying,
            contextName: presence.contextName || (presence.isPlaying ? 'Моя волна' : ''),
            contextType: presence.contextType || 'playlist',
            contextCover: presence.contextCover,
            trackTitle: presence.trackTitle || '',
            trackArtist: presence.trackArtist || '',
            trackCover: presence.coverUrl,
            trackId: presence.trackId,
            duration: presence.duration,
            filePath: presence.filePath
          } : undefined,
          lastActive: presence?.lastActive || u.updated || u.created
        };
      } catch {
        return u;
      }
    }));

    return enhancedUsers;
  }

  public async getUserProfile(idOrUsername: string): Promise<CloudUser | null> {
    try {
      const target = idOrUsername.trim().replace(/^@/, '');
      let record: any = null;

      try {
        record = await this.pb.collection('users').getOne(target, { requestKey: null });
      } catch {}

      if (!record) {
        try {
          const allUsers = await this.pb.collection('users').getFullList({ requestKey: null });
          const targetLower = target.toLowerCase();
          record = allUsers.find(u => 
            (u.username && u.username.toLowerCase() === targetLower) ||
            (u.name && u.name.toLowerCase() === targetLower) ||
            (u.id === target)
          );
        } catch {}
      }

      if (!record) return null;

      const baseUser: CloudUser = this.formatUserRecord(record);

      const [cloudCustom, presence, orderNum, analyticsRes] = await Promise.all([
        this.getCloudCustomization(baseUser.id),
        this.getUserPresence(baseUser.id),
        this.getUserOrderNumber(baseUser.created, baseUser.id),
        this.pb.collection('wave_analytics').getList(1, 100, {
          filter: `user = "${baseUser.id}" && track_id != "__aura_user_card__"`
        }).catch(() => ({ totalItems: 0, items: [] }))
      ]);

      let plays = cloudCustom?.analytics?.totalPlays;
      let hours = cloudCustom?.analytics?.totalHoursFormatted;

      if (plays === undefined || hours === undefined) {
        const rawPlays = analyticsRes.totalItems || 0;
        let totalSec = 0;
        if (rawPlays > 0) {
          if (analyticsRes.items && analyticsRes.items.length > 0) {
            analyticsRes.items.forEach((it: any) => {
              const itemSec = (it.listened_seconds && it.listened_seconds >= 60)
                ? it.listened_seconds
                : (it.total_duration && it.total_duration > 30 ? it.total_duration : 175);
              totalSec += itemSec;
            });
            const avgSec = totalSec / analyticsRes.items.length;
            totalSec = Math.round(avgSec * rawPlays);
          } else {
            totalSec = rawPlays * 175;
          }
        }
        plays = rawPlays;
        hours = (Math.max(0.1, totalSec / 3600)).toFixed(1).replace('.', ',');
      }

      return {
        ...baseUser,
        accountNumber: orderNum,
        totalPlays: plays,
        totalHours: hours,
        avatar: cloudCustom?.avatar || baseUser.avatar,
        banner: cloudCustom?.banner || baseUser.banner,
        profileColor: cloudCustom?.profileColor || baseUser.profileColor,
        nicknameFont: cloudCustom?.nicknameFont || baseUser.nicknameFont,
        nicknameEffect: cloudCustom?.nicknameEffect || baseUser.nicknameEffect,
        status: cloudCustom?.status || baseUser.status,
        bio: cloudCustom?.bio || baseUser.bio,
        bgUrl: cloudCustom?.bgUrl || (baseUser as any).bgUrl,
        discord: cloudCustom?.discord || baseUser.discord,
        telegram: cloudCustom?.telegram || baseUser.telegram,
        website: cloudCustom?.website || baseUser.website,
        pinnedTrackId: cloudCustom?.pinnedTrackId || baseUser.pinnedTrackId,
        pinnedTrackTitle: cloudCustom?.pinnedTrackTitle || baseUser.pinnedTrackTitle,
        pinnedTrackArtist: cloudCustom?.pinnedTrackArtist || baseUser.pinnedTrackArtist,
        pinnedTrackCover: cloudCustom?.pinnedTrackCover || baseUser.pinnedTrackCover,
        activePresence: presence ? {
          isPlaying: presence.isPlaying,
          contextName: presence.contextName || (presence.isPlaying ? 'Моя волна' : ''),
          contextType: presence.contextType || 'playlist',
          contextCover: presence.contextCover,
          trackTitle: presence.trackTitle || '',
          trackArtist: presence.trackArtist || '',
          trackCover: presence.coverUrl,
          trackId: presence.trackId,
          duration: presence.duration,
          filePath: presence.filePath
        } : undefined,
        lastActive: presence?.lastActive || baseUser.updated || baseUser.created
      };
    } catch (e) {
      console.warn('getUserProfile error:', e);
      return null;
    }
  }

  /**
   * Complete analysis of tracks from users currently active in the application.
   * Gathers live data from device_sync and playlists to discover trending songs and artists.
   */
  public async getCommunityListeningTrends(): Promise<{
    trendingTracks: Track[];
    activeUsersCount: number;
    popularArtists: string[];
  }> {
    try {
      const records = await this.pb.collection('device_sync').getFullList({
        sort: '-updated',
        limit: 100
      });

      const activeUsers = new Set<string>();
      const artistCounts: Record<string, number> = {};
      const trackMap = new Map<string, { track: Track; count: number }>();

      for (const rec of records) {
        if (rec.user) activeUsers.add(rec.user);
        if (rec.title && rec.artist) {
          const trackKey = `${rec.title.toLowerCase()} - ${rec.artist.toLowerCase()}`;
          const existing = trackMap.get(trackKey);
          const t: Track = {
            id: rec.track_id || `comm_${Math.random().toString(36).substring(7)}`,
            title: rec.title,
            artist: rec.artist,
            album: '',
            duration: rec.duration || 0,
            originalCoverUrl: rec.cover_url || null,
            customCoverPath: null,
            filePath: rec.file_path || (rec.track_id?.startsWith('ya_') ? `yandex:${rec.track_id.substring(3)}` : '')
          };

          if (existing) {
            existing.count += 1;
          } else {
            trackMap.set(trackKey, { track: t, count: 1 });
          }

          const primaryArtist = rec.artist.split(/[,&/]|feat\.?|ft\.?/i)[0].trim();
          if (primaryArtist) {
            artistCounts[primaryArtist] = (artistCounts[primaryArtist] || 0) + 1;
          }
        }
      }

      const sortedTracks = Array.from(trackMap.values())
        .sort((a, b) => b.count - a.count)
        .map(item => item.track);

      const popularArtists = Object.entries(artistCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name]) => name);

      return {
        trendingTracks: sortedTracks,
        activeUsersCount: Math.max(1, activeUsers.size),
        popularArtists
      };
    } catch (err) {
      console.warn('Community trends fetch skipped:', err);
      return { trendingTracks: [], activeUsersCount: 1, popularArtists: [] };
    }
  }

  public logout() {
    if (this.unsubscribeFavorites) {
      this.unsubscribeFavorites();
      this.unsubscribeFavorites = null;
    }
    if (this.unsubscribePlaylists) {
      this.unsubscribePlaylists();
      this.unsubscribePlaylists = null;
    }
    if (this.unsubscribeDevices) {
      this.unsubscribeDevices();
      this.unsubscribeDevices = null;
    }
    if (this.unsubscribeUser) {
      this.unsubscribeUser();
      this.unsubscribeUser = null;
    }
    if (this.unsubscribeHistory) {
      this.unsubscribeHistory();
      this.unsubscribeHistory = null;
    }
    if (this.unsubscribeForYou) {
      this.unsubscribeForYou();
      this.unsubscribeForYou = null;
    }
    if (this.unsubscribeFriendRequests) {
      this.unsubscribeFriendRequests();
      this.unsubscribeFriendRequests = null;
    }
    this.pb.authStore.clear();
    useAuthStore.getState().logout();
  }

  public async syncAll() {
    if (!this.isLoggedIn()) {
      useAuthStore.getState().setSyncStatus('Войдите в аккаунт');
      return;
    }
    useAuthStore.getState().setSyncing(true);
    useAuthStore.getState().setSyncStatus('Синхронизация...');
    try {
      await Promise.allSettled([
        this.syncFavorites(),
        this.syncPlaylists(),
        this.syncHistory(),
        this.syncForYou()
      ]);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aura-sync-all-complete'));
        window.dispatchEvent(new CustomEvent('aura-friends-changed'));
      }
      useAuthStore.getState().setLastSyncTime(Date.now());
      useAuthStore.getState().setSyncStatus('Синхронизировано');
    } catch (err) {
      console.error('PocketBase sync error:', err);
      useAuthStore.getState().setSyncStatus('Ошибка синхронизации');
    } finally {
      useAuthStore.getState().setSyncing(false);
    }
  }

  public async syncFavorites() {
    const userId = this.getUserId();
    if (!userId || this.isSyncingFavorites) return;
    this.isSyncingFavorites = true;

    try {
      const records = await this.pb.collection('favorites').getFullList({
        filter: `user = "${userId}"`,
        requestKey: null
      });

      const serverTracks: Track[] = records.map(r => ({
        id: r.track_id,
        title: r.title,
        artist: r.artist,
        album: r.album || '',
        duration: r.duration || 0,
        originalCoverUrl: r.cover_url || null,
        customCoverPath: null,
        filePath: r.file_path || ''
      }));

      const collectionStore = useCollectionStore.getState();
      const localLiked = collectionStore.likedTracks;
      const serverMap = new Map(serverTracks.map(t => [t.id, t]));

      const favSyncKey = `aura_synced_favs_${userId}`;
      const previouslySynced = new Set<string>(
        JSON.parse(localStorage.getItem(favSyncKey) || '[]')
      );

      // Only detect tracks deleted on other devices if the server actually returned tracks
      const deletedRemotely = new Set<string>();
      if (previouslySynced.size > 0 && serverTracks.length > 0) {
        for (const id of previouslySynced) {
          if (!serverMap.has(id)) {
            deletedRemotely.add(id);
          }
        }
      }

      // 1. Upload local favorites that are NOT on server and NOT deleted remotely
      for (const track of localLiked) {
        if (deletedRemotely.has(track.id)) continue;
        if (!serverMap.has(track.id)) {
          try {
            await this.pb.collection('favorites').create({
              user: userId,
              track_id: track.id,
              title: track.title,
              artist: track.artist,
              album: track.album || '',
              cover_url: track.originalCoverUrl || '',
              duration: track.duration || 0,
              file_path: track.filePath || ''
            }, { requestKey: null });
            serverMap.set(track.id, track);
          } catch (e) {
            console.warn('Failed to upload favorite to cloud:', e);
          }
        }
      }

      // 2. Keep local tracks that were not deleted remotely, and merge in server tracks
      const filteredLocal = localLiked.filter(t => !deletedRemotely.has(t.id));
      const filteredLocalMap = new Map(filteredLocal.map(t => [t.id, t]));
      const merged: Track[] = [...filteredLocal];
      for (const track of serverTracks) {
        if (!filteredLocalMap.has(track.id)) {
          merged.push(track);
        }
      }

      if (merged.length !== localLiked.length || merged.some((t, i) => localLiked[i]?.id !== t.id)) {
        this.isInternalSync = true;
        collectionStore.reorderLikedTracks(merged);
        this.isInternalSync = false;
      }

      // Save state of synced IDs
      localStorage.setItem(favSyncKey, JSON.stringify(Array.from(serverMap.keys())));
    } catch (err) {
      console.error('syncFavorites error:', err);
    } finally {
      this.isSyncingFavorites = false;
    }
  }

  public async onTrackLiked(track: Track, isLiked: boolean) {
    const userId = this.getUserId();
    if (!userId || this.isInternalSync || this.isSyncingFavorites) return;

    const favSyncKey = `aura_synced_favs_${userId}`;
    const synced = new Set<string>(JSON.parse(localStorage.getItem(favSyncKey) || '[]'));

    try {
      if (isLiked) {
        synced.add(track.id);
        localStorage.setItem(favSyncKey, JSON.stringify(Array.from(synced)));

        const existing = await this.pb.collection('favorites').getList(1, 1, {
          filter: `user = "${userId}" && track_id = "${track.id}"`,
          requestKey: null
        });
        if (existing.totalItems === 0) {
          await this.pb.collection('favorites').create({
            user: userId,
            track_id: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album || '',
            cover_url: track.originalCoverUrl || '',
            duration: track.duration || 0,
            file_path: track.filePath || ''
          }, { requestKey: null });
        }
      } else {
        synced.delete(track.id);
        localStorage.setItem(favSyncKey, JSON.stringify(Array.from(synced)));

        const existing = await this.pb.collection('favorites').getList(1, 1, {
          filter: `user = "${userId}" && track_id = "${track.id}"`,
          requestKey: null
        });
        if (existing.items.length > 0) {
          await this.pb.collection('favorites').delete(existing.items[0].id, { requestKey: null });
        }
      }
    } catch (err) {
      console.warn('onTrackLiked sync error:', err);
    }
  }

  public async syncPlaylists() {
    const userId = this.getUserId();
    if (!userId || this.isSyncingPlaylists) return;
    this.isSyncingPlaylists = true;

    try {
      const records = await this.pb.collection('playlists').getFullList({
        filter: `user = "${userId}"`,
        requestKey: null
      });

      const serverPlaylists = records
        .filter(r => r.name !== '__aura_user_profile__')
        .map(r => ({
          id: r.id,
          name: r.name,
          coverUrl: r.cover_url || undefined,
          tracks: Array.isArray(r.tracks_json) ? r.tracks_json : [],
          cloudId: r.id
        }));

      const collectionStore = useCollectionStore.getState();
      const localPlaylists = [...collectionStore.playlists];

      const serverByName = new Map<string, typeof serverPlaylists[0]>();
      const serverById = new Map<string, typeof serverPlaylists[0]>();
      for (const sp of serverPlaylists) {
        serverByName.set(sp.name.trim().toLowerCase(), sp);
        serverById.set(sp.id, sp);
      }

      const plSyncKey = `aura_synced_pls_${userId}`;
      const previouslySyncedPls = new Set<string>(
        JSON.parse(localStorage.getItem(plSyncKey) || '[]')
      );

      // Detect playlists deleted on other devices only if server returned items
      const deletedPlsRemotely = new Set<string>();
      if (previouslySyncedPls.size > 0 && serverPlaylists.length > 0) {
        for (const cloudId of previouslySyncedPls) {
          if (!serverById.has(cloudId)) {
            deletedPlsRemotely.add(cloudId);
          }
        }
      }

      // Filter out playlists deleted remotely
      let workingLocalPlaylists = localPlaylists.filter(p => !p.cloudId || !deletedPlsRemotely.has(p.cloudId));

      // 1. Merge server playlists into local store
      for (const serverPl of serverPlaylists) {
        const key = serverPl.name.trim().toLowerCase();
        const localPl = workingLocalPlaylists.find(p => (p.cloudId && p.cloudId === serverPl.id) || p.name.trim().toLowerCase() === key);
        const serverTracks = Array.isArray(serverPl.tracks) ? serverPl.tracks : [];

        if (localPl) {
          localPl.cloudId = serverPl.id;

          // Merge cover: if server has cover and local doesn't, take it
          if (serverPl.coverUrl && !localPl.coverUrl) {
            localPl.coverUrl = serverPl.coverUrl;
          }

          // Merge tracks without duplicates
          const trackMap = new Map<string, Track>();
          for (const t of localPl.tracks) if (t?.id) trackMap.set(t.id, t);
          for (const t of serverTracks) if (t?.id) trackMap.set(t.id, t);

          // If server has more or equal tracks, adopt server ordering
          if (serverTracks.length >= localPl.tracks.length) {
            localPl.tracks = serverTracks;
          } else {
            localPl.tracks = Array.from(trackMap.values());
          }

          // If local has extra tracks or cover not yet on server, update server record
          const needServerUpdate = (localPl.coverUrl && !serverPl.coverUrl) || (localPl.tracks.length > serverTracks.length);
          if (needServerUpdate) {
            try {
              const portableCover = await makePortableCover(localPl.coverUrl);
              await this.pb.collection('playlists').update(serverPl.id, {
                tracks_json: localPl.tracks,
                cover_url: portableCover || serverPl.coverUrl || ''
              }, { requestKey: null });
            } catch (err) {
              console.warn('Failed to update server playlist:', err);
            }
          }
        } else {
          // New playlist from server: add to local
          const newLocalPl: Playlist = {
            id: 'pl_' + serverPl.id,
            name: serverPl.name,
            coverUrl: serverPl.coverUrl || undefined,
            tracks: serverTracks,
            cloudId: serverPl.id
          };
          workingLocalPlaylists.push(newLocalPl);
        }
      }

      // 2. Upload any local playlists not present on server and not remotely deleted
      for (const localPl of workingLocalPlaylists) {
        if (localPl.name === '__aura_user_profile__') continue;
        const key = localPl.name.trim().toLowerCase();
        if (!serverByName.has(key) && !localPl.cloudId) {
          try {
            const portableCover = await makePortableCover(localPl.coverUrl);
            const created = await this.pb.collection('playlists').create({
              user: userId,
              name: localPl.name,
              tracks_json: localPl.tracks || [],
              cover_url: portableCover || ''
            }, { requestKey: null });
            localPl.cloudId = created.id;
            serverByName.set(key, {
              id: created.id,
              name: localPl.name,
              coverUrl: portableCover || localPl.coverUrl,
              tracks: localPl.tracks,
              cloudId: created.id
            });
          } catch (e) {
            console.warn('Failed to create playlist on server:', e);
          }
        }
      }

      // Save synced cloud IDs
      const allCloudIds = workingLocalPlaylists.map(p => p.cloudId).filter(Boolean) as string[];
      localStorage.setItem(plSyncKey, JSON.stringify(allCloudIds));

      this.isInternalSync = true;
      collectionStore.setPlaylists(workingLocalPlaylists);
      this.isInternalSync = false;
    } catch (err) {
      console.error('syncPlaylists error:', err);
    } finally {
      this.isSyncingPlaylists = false;
    }
  }

  private playlistDebounceTimers = new Map<string, any>();

  public onPlaylistModified(playlist: Playlist) {
    const userId = this.getUserId();
    if (!userId || this.isInternalSync || this.isSyncingPlaylists || playlist.name === '__aura_user_profile__') return;

    if (this.playlistDebounceTimers.has(playlist.id)) {
      clearTimeout(this.playlistDebounceTimers.get(playlist.id));
    }

    const timer = setTimeout(async () => {
      this.playlistDebounceTimers.delete(playlist.id);
      try {
        let recordId = playlist.cloudId;
        if (!recordId) {
          const safeName = playlist.name.replace(/["\\]/g, '');
          const existing = await this.pb.collection('playlists').getList(1, 1, {
            filter: `user = "${userId}" && name = "${safeName}"`
          });
          if (existing.items.length > 0) {
            recordId = existing.items[0].id;
            playlist.cloudId = recordId;
          }
        }

        const portableCover = await makePortableCover(playlist.coverUrl);
        const payload = {
          user: userId,
          name: playlist.name,
          tracks_json: playlist.tracks || [],
          cover_url: portableCover || ''
        };

        if (recordId) {
          await this.pb.collection('playlists').update(recordId, payload);
        } else {
          const created = await this.pb.collection('playlists').create(payload);
          playlist.cloudId = created.id;
          const plSyncKey = `aura_synced_pls_${userId}`;
          const current = new Set<string>(JSON.parse(localStorage.getItem(plSyncKey) || '[]'));
          current.add(created.id);
          localStorage.setItem(plSyncKey, JSON.stringify(Array.from(current)));
        }
      } catch (err) {
        console.warn('onPlaylistModified error:', err);
      }
    }, 600);

    this.playlistDebounceTimers.set(playlist.id, timer);
  }

  public async onPlaylistDeleted(name: string) {
    const userId = this.getUserId();
    if (!userId || this.isInternalSync || name === '__aura_user_profile__') return;

    try {
      const safeName = name.replace(/["\\]/g, '');
      const existing = await this.pb.collection('playlists').getList(1, 1, {
        filter: `user = "${userId}" && name = "${safeName}"`
      });
      if (existing.items.length > 0) {
        const deletedId = existing.items[0].id;
        await this.pb.collection('playlists').delete(deletedId);
        const plSyncKey = `aura_synced_pls_${userId}`;
        const current = new Set<string>(JSON.parse(localStorage.getItem(plSyncKey) || '[]'));
        current.delete(deletedId);
        localStorage.setItem(plSyncKey, JSON.stringify(Array.from(current)));
      }
    } catch (err) {
      console.warn('onPlaylistDeleted error:', err);
    }
  }

  public async syncHistory() {
    const userId = this.getUserId();
    if (!userId || this.isSyncingHistory) return;
    this.isSyncingHistory = true;

    try {
      const records = await this.pb.collection('history').getList(1, 1, {
        filter: `user = "${userId}"`
      });

      const playerStore = usePlayerStore.getState();
      const localHistory: Track[] = playerStore.history || [];

      if (records.items.length > 0) {
        const record = records.items[0];
        const serverTracks: Track[] = Array.isArray(record.tracks_json) ? record.tracks_json : [];

        const trackMap = new Map<string, Track>();
        const merged: Track[] = [];

        for (const t of localHistory) {
          if (!t || !t.id) continue;
          const key = (t.filePath || t.id).toLowerCase();
          if (!trackMap.has(key)) {
            trackMap.set(key, t);
            merged.push(t);
          }
        }

        for (const t of serverTracks) {
          if (!t || !t.id) continue;
          const key = (t.filePath || t.id).toLowerCase();
          if (!trackMap.has(key)) {
            trackMap.set(key, t);
            merged.push(t);
          }
        }

        const finalHistory = merged.slice(0, 50);

        if (JSON.stringify(finalHistory) !== JSON.stringify(localHistory)) {
          this.isInternalSync = true;
          usePlayerStore.setState({ history: finalHistory });
          this.isInternalSync = false;
        }

        if (localHistory.length > 0 && JSON.stringify(finalHistory) !== JSON.stringify(serverTracks)) {
          await this.pb.collection('history').update(record.id, {
            tracks_json: finalHistory
          });
        }
      } else if (localHistory.length > 0) {
        await this.pb.collection('history').create({
          user: userId,
          tracks_json: localHistory.slice(0, 50)
        });
      }
    } catch (err) {
      console.warn('syncHistory error:', err);
    } finally {
      this.isSyncingHistory = false;
    }
  }

  public pushHistory(tracks: Track[]) {
    const userId = this.getUserId();
    if (!userId || this.isInternalSync || this.isSyncingHistory) return;

    if (this.historyDebounceTimer) {
      clearTimeout(this.historyDebounceTimer);
    }

    this.historyDebounceTimer = setTimeout(async () => {
      try {
        const records = await this.pb.collection('history').getList(1, 1, {
          filter: `user = "${userId}"`
        });
        const cleanTracks = tracks.slice(0, 50);
        if (records.items.length > 0) {
          await this.pb.collection('history').update(records.items[0].id, {
            tracks_json: cleanTracks
          });
        } else {
          await this.pb.collection('history').create({
            user: userId,
            tracks_json: cleanTracks
          });
        }
      } catch (err) {
        console.warn('pushHistory error:', err);
      }
    }, 1200);
  }

  public async syncForYou() {
    const userId = this.getUserId();
    if (!userId || this.isSyncingForYou) return;
    this.isSyncingForYou = true;

    try {
      const records = await this.pb.collection('for_you').getList(1, 1, {
        filter: `user = "${userId}"`
      });

      const localMixRaw = localStorage.getItem('aura_for_you_mix');
      const localMix: Track[] = localMixRaw ? JSON.parse(localMixRaw) : [];
      const localTitle = localStorage.getItem('aura_for_you_mix_title') || '';
      const localRecsRaw = localStorage.getItem('aura_for_you_recs');
      const localRecs: Track[] = localRecsRaw ? JSON.parse(localRecsRaw) : [];

      if (records.items.length > 0) {
        const rec = records.items[0];
        const serverMix: Track[] = Array.isArray(rec.mix_tracks_json) ? rec.mix_tracks_json : [];
        const serverTitle: string = rec.title || '';
        const serverRecs: Track[] = Array.isArray(rec.rec_tracks_json) ? rec.rec_tracks_json : [];

        if (serverMix.length > 0) {
          localStorage.setItem('aura_for_you_mix', JSON.stringify(serverMix));
          if (serverTitle) localStorage.setItem('aura_for_you_mix_title', serverTitle);
          if (serverRecs.length > 0) localStorage.setItem('aura_for_you_recs', JSON.stringify(serverRecs));

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('aura-foryou-synced', {
              detail: { mix: serverMix, title: serverTitle, recs: serverRecs }
            }));
          }
        } else if (localMix.length > 0) {
          await this.pb.collection('for_you').update(rec.id, {
            title: localTitle,
            mix_tracks_json: localMix,
            rec_tracks_json: localRecs
          });
        }
      } else if (localMix.length > 0) {
        await this.pb.collection('for_you').create({
          user: userId,
          title: localTitle,
          mix_tracks_json: localMix,
          rec_tracks_json: localRecs
        });
      }
    } catch (err) {
      console.warn('syncForYou error:', err);
    } finally {
      this.isSyncingForYou = false;
    }
  }

  public pushForYou(mix: Track[], title: string, recs: Track[]) {
    const userId = this.getUserId();
    if (!userId || this.isInternalSync || this.isSyncingForYou) return;

    if (this.forYouDebounceTimer) {
      clearTimeout(this.forYouDebounceTimer);
    }

    this.forYouDebounceTimer = setTimeout(async () => {
      try {
        const records = await this.pb.collection('for_you').getList(1, 1, {
          filter: `user = "${userId}"`
        });
        const payload = {
          user: userId,
          title: title || '',
          mix_tracks_json: mix || [],
          rec_tracks_json: recs || []
        };
        if (records.items.length > 0) {
          await this.pb.collection('for_you').update(records.items[0].id, payload);
        } else {
          await this.pb.collection('for_you').create(payload);
        }
      } catch (err) {
        console.warn('pushForYou error:', err);
      }
    }, 1500);
  }

  public async subscribeRealtime() {
    const userId = this.getUserId();
    if (!userId) return;

    try {
      // Clean up previous subscriptions before establishing fresh SSE
      if (this.unsubscribeFavorites) {
        try { this.unsubscribeFavorites(); } catch {}
        this.unsubscribeFavorites = null;
      }
      if (this.unsubscribePlaylists) {
        try { this.unsubscribePlaylists(); } catch {}
        this.unsubscribePlaylists = null;
      }
      if (this.unsubscribeDevices) {
        try { this.unsubscribeDevices(); } catch {}
        this.unsubscribeDevices = null;
      }
      if (this.unsubscribeUser) {
        try { this.unsubscribeUser(); } catch {}
        this.unsubscribeUser = null;
      }
      if (this.unsubscribeHistory) {
        try { this.unsubscribeHistory(); } catch {}
        this.unsubscribeHistory = null;
      }
      if (this.unsubscribeForYou) {
        try { this.unsubscribeForYou(); } catch {}
        this.unsubscribeForYou = null;
      }
      if (this.unsubscribeFriendRequests) {
        try { this.unsubscribeFriendRequests(); } catch {}
        this.unsubscribeFriendRequests = null;
      }

      // 1. Subscribe to favorites
      this.pb.collection('favorites').subscribe('*', (e) => {
        if (this.isSyncingFavorites || this.isInternalSync) return;
        if (!e.record || e.record.user !== userId) return;

        const collectionStore = useCollectionStore.getState();
        if (e.action === 'create') {
          const newTrack: Track = {
            id: e.record.track_id,
            title: e.record.title,
            artist: e.record.artist,
            album: e.record.album || '',
            duration: e.record.duration || 0,
            originalCoverUrl: e.record.cover_url || null,
            customCoverPath: null,
            filePath: e.record.file_path || ''
          };
          if (!collectionStore.isLiked(newTrack.id)) {
            this.isInternalSync = true;
            collectionStore.reorderLikedTracks([newTrack, ...collectionStore.likedTracks]);
            this.isInternalSync = false;
          }
        } else if (e.action === 'delete') {
          const trackId = e.record.track_id;
          if (trackId && collectionStore.isLiked(trackId)) {
            this.isInternalSync = true;
            const filtered = collectionStore.likedTracks.filter(t => t.id !== trackId);
            collectionStore.reorderLikedTracks(filtered);
            this.isInternalSync = false;
          }
        }
      }).then(unsub => {
        this.unsubscribeFavorites = unsub;
      }).catch(err => {
        console.warn('Realtime favorites subscribe error:', err);
      });

      // 2. Subscribe to playlists
      this.pb.collection('playlists').subscribe('*', (e) => {
        if (this.isSyncingPlaylists || this.isInternalSync) return;
        if (!e.record || e.record.user !== userId) return;

        if (e.record.name === '__aura_user_profile__') {
          if (e.action === 'create' || e.action === 'update') {
            const tj = e.record.tracks_json;
            const custom = (typeof tj === 'object' && !Array.isArray(tj)) ? tj : (Array.isArray(tj) && tj.length > 0 && typeof tj[0] === 'object' ? tj[0] : {});
            if (custom && Object.keys(custom).length > 0) {
              this.saveLocalCustomization(userId, custom);
              useAuthStore.getState().updateUser({
                ...(custom.nicknameFont ? { nicknameFont: custom.nicknameFont } : {}),
                ...(custom.nicknameEffect ? { nicknameEffect: custom.nicknameEffect } : {}),
                ...(custom.profileColor ? { profileColor: custom.profileColor } : {}),
                ...(custom.status ? { status: custom.status } : {}),
                ...(custom.bio ? { bio: custom.bio } : {}),
                ...(custom.banner ? { banner: custom.banner } : {}),
                ...(custom.discord ? { discord: custom.discord } : {}),
                ...(custom.telegram ? { telegram: custom.telegram } : {}),
                ...(custom.website ? { website: custom.website } : {})
              });
            }
          }
          return;
        }

        const collectionStore = useCollectionStore.getState();
        const currentPlaylists = [...collectionStore.playlists];
        const record = e.record;

        if (e.action === 'create' || e.action === 'update') {
          const idx = currentPlaylists.findIndex(p => 
            (p.cloudId && p.cloudId === record.id) || 
            p.name.trim().toLowerCase() === record.name.trim().toLowerCase()
          );

          const updatedPlaylist: Playlist = {
            id: idx >= 0 ? currentPlaylists[idx].id : ('pl_' + record.id),
            name: record.name,
            coverUrl: record.cover_url || undefined,
            tracks: Array.isArray(record.tracks_json) ? record.tracks_json : [],
            cloudId: record.id
          };

          if (idx >= 0) {
            currentPlaylists[idx] = updatedPlaylist;
          } else {
            currentPlaylists.push(updatedPlaylist);
          }

          this.isInternalSync = true;
          collectionStore.setPlaylists(currentPlaylists);
          this.isInternalSync = false;
        } else if (e.action === 'delete') {
          const filtered = currentPlaylists.filter(p => 
            p.cloudId !== record.id && p.name !== record.name
          );
          if (filtered.length !== currentPlaylists.length) {
            this.isInternalSync = true;
            collectionStore.setPlaylists(filtered);
            this.isInternalSync = false;
          }
        }
      }).then(unsub => {
        this.unsubscribePlaylists = unsub;
      }).catch(err => {
        console.warn('Realtime playlists subscribe error:', err);
      });

      // 3. Subscribe to active devices presence
      this.pb.collection('device_sync').subscribe('*', (e) => {
        if (!e.record || e.record.user !== userId) return;
        this.notifyDeviceListeners();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('aura-device-playback-updated', { detail: e.record }));
        }
      }).then(unsub => {
        this.unsubscribeDevices = unsub;
      }).catch(err => {
        console.warn('Realtime devices subscribe error:', err);
      });

      // 4. Subscribe to user profile updates (realtime sync between phone/desktop)
      this.pb.collection('users').subscribe(userId, (e) => {
        if (e.action === 'update' && e.record) {
          const formatted = this.formatUserRecord(e.record);
          const currentUser = useAuthStore.getState().user;
          const localCustom = this.getLocalCustomization(userId);
          useAuthStore.getState().updateUser({
            ...formatted,
            nicknameFont: formatted.nicknameFont || currentUser?.nicknameFont || localCustom.nicknameFont,
            nicknameEffect: formatted.nicknameEffect || currentUser?.nicknameEffect || localCustom.nicknameEffect,
            profileColor: formatted.profileColor || currentUser?.profileColor || localCustom.profileColor,
            avatar: formatted.avatar || currentUser?.avatar,
            banner: formatted.banner || currentUser?.banner,
            status: formatted.status || currentUser?.status,
            bio: formatted.bio || currentUser?.bio
          });
        }
      }).then(unsub => {
        this.unsubscribeUser = unsub;
      }).catch(err => {
        console.warn('Realtime user profile subscribe error:', err);
      });

      // 5. Subscribe to listening history
      this.pb.collection('history').subscribe('*', (e) => {
        if (this.isSyncingHistory || this.isInternalSync) return;
        if (!e.record || e.record.user !== userId) return;

        if (e.action === 'create' || e.action === 'update') {
          const serverTracks = Array.isArray(e.record.tracks_json) ? e.record.tracks_json : [];
          if (serverTracks.length > 0) {
            this.isInternalSync = true;
            usePlayerStore.setState({ history: serverTracks });
            this.isInternalSync = false;
          }
        }
      }).then(unsub => {
        this.unsubscribeHistory = unsub;
      }).catch(err => {
        console.warn('Realtime history subscribe error:', err);
      });

      // 6. Subscribe to For You mix & recommendations
      this.pb.collection('for_you').subscribe('*', (e) => {
        if (this.isSyncingForYou || this.isInternalSync) return;
        if (!e.record || e.record.user !== userId) return;

        if (e.action === 'create' || e.action === 'update') {
          const serverMix = Array.isArray(e.record.mix_tracks_json) ? e.record.mix_tracks_json : [];
          const serverTitle = e.record.title || '';
          const serverRecs = Array.isArray(e.record.rec_tracks_json) ? e.record.rec_tracks_json : [];

          if (serverMix.length > 0) {
            localStorage.setItem('aura_for_you_mix', JSON.stringify(serverMix));
            if (serverTitle) localStorage.setItem('aura_for_you_mix_title', serverTitle);
            if (serverRecs.length > 0) localStorage.setItem('aura_for_you_recs', JSON.stringify(serverRecs));

            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('aura-foryou-synced', {
                detail: { mix: serverMix, title: serverTitle, recs: serverRecs }
              }));
            }
          }
        }
      }).then(unsub => {
        this.unsubscribeForYou = unsub;
      }).catch(err => {
        console.warn('Realtime for_you subscribe error:', err);
      });

      // 7. Subscribe to friend requests & friendships
      this.pb.collection('friend_requests').subscribe('*', () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('aura-friends-changed'));
        }
      }).then(unsub => {
        this.unsubscribeFriendRequests = unsub;
      }).catch(err => {
        console.warn('Realtime friend_requests subscribe error:', err);
      });
    } catch (e) {
      console.warn('PocketBase realtime subscribe error:', e);
    }
  }

  public async updateDevicePresence(
    track: Track | null, 
    progress: number, 
    isPlaying: boolean,
    contextInfo?: { title?: string; type?: string; coverUrl?: string }
  ) {
    const userId = this.getUserId();
    if (!userId) return;

    try {
      const baseDeviceName = this.getDeviceName();
      const clientDeviceId = this.getClientDeviceId();
      const ctxTitle = contextInfo?.title || (track?.id?.startsWith('vibe_') ? 'Моя волна' : '');
      const ctxCover = contextInfo?.coverUrl || '';
      const ctxType = contextInfo?.type || (track?.id?.startsWith('vibe_') ? 'wave' : 'playlist');

      // Encode context & client id cleanly
      const fullDeviceName = `${baseDeviceName} [id:${clientDeviceId}]${ctxTitle ? `:::${ctxTitle}:::${ctxCover}:::${ctxType}` : ''}`;

      const payload = {
        user: userId,
        device_name: fullDeviceName,
        track_id: track?.id || '',
        title: track?.title || '',
        artist: track?.artist || '',
        cover_url: track?.originalCoverUrl || '',
        file_path: track?.filePath || '',
        duration: track?.duration || 0,
        progress: Math.round(progress || 0),
        is_playing: !!isPlaying
      };

      const savedRecordId = typeof window !== 'undefined' ? localStorage.getItem('aura_my_device_record_id') : null;
      let recordUpdated = false;

      if (savedRecordId) {
        try {
          await this.pb.collection('device_sync').update(savedRecordId, payload, { requestKey: null });
          recordUpdated = true;
        } catch (e: any) {
          if (e?.status === 404) {
            localStorage.removeItem('aura_my_device_record_id');
          }
        }
      }

      if (!recordUpdated) {
        const existing = await this.pb.collection('device_sync').getList(1, 10, {
          filter: `user = "${userId}"`,
          sort: '-updated',
          requestKey: null
        });

        const myRecord = existing.items.find((item: any) => 
          item.device_name?.includes(`[id:${clientDeviceId}]`) ||
          this.cleanDeviceName(item.device_name) === baseDeviceName
        );

        if (myRecord) {
          await this.pb.collection('device_sync').update(myRecord.id, payload, { requestKey: null });
          localStorage.setItem('aura_my_device_record_id', myRecord.id);
        } else {
          const created = await this.pb.collection('device_sync').create(payload, { requestKey: null });
          localStorage.setItem('aura_my_device_record_id', created.id);
        }
      }
    } catch {
      // Presence updates are silent
    }
  }

  public async getUserPresence(userId: string): Promise<{
    isPlaying: boolean;
    trackTitle?: string;
    trackArtist?: string;
    coverUrl?: string;
    trackId?: string;
    duration?: number;
    filePath?: string;
    contextName?: string;
    contextType?: 'wave' | 'playlist' | 'collection';
    contextCover?: string;
    lastActive?: string;
  } | null> {
    try {
      const records = await this.pb.collection('device_sync').getList(1, 1, {
        filter: `user = "${userId}"`,
        sort: '-updated',
        requestKey: null
      });
      if (records.items.length > 0) {
        const item: any = records.items[0];
        let contextName = '';
        let contextCover = '';
        let contextType: 'wave' | 'playlist' | 'collection' = 'playlist';

        if (item.device_name && item.device_name.includes(':::')) {
          const parts = item.device_name.split(':::');
          contextName = parts[1] || '';
          contextCover = parts[2] || '';
          if (parts[3] === 'wave' || parts[3] === 'playlist' || parts[3] === 'collection') {
            contextType = parts[3];
          }
        }
        if (!contextName && item.track_id && item.track_id.startsWith('vibe_')) {
          contextName = 'Моя волна';
          contextType = 'wave';
        }

        const isRecentlyActive = (Date.now() - new Date(item.updated).getTime()) < 3 * 60 * 1000;
        const isPlaying = !!item.is_playing && isRecentlyActive;

        return {
          isPlaying,
          trackTitle: item.title,
          trackArtist: item.artist,
          coverUrl: item.cover_url,
          trackId: item.track_id,
          duration: item.duration,
          filePath: item.file_path,
          contextName: contextName || (isPlaying ? 'Моя волна' : undefined),
          contextType,
          contextCover: contextCover || item.cover_url,
          lastActive: item.updated
        };
      }
    } catch {
      // ignore
    }
    return null;
  }

  public async getActiveDevices() {
    const userId = this.getUserId();
    if (!userId) return [];

    try {
      const records = await this.pb.collection('device_sync').getFullList({
        filter: `user = "${userId}"`,
        sort: '-updated',
        requestKey: null
      });

      // Filter out ancient records (older than 5 days if not playing) and deduplicate by cleaned device name
      const seen = new Set<string>();
      const result: any[] = [];
      const now = Date.now();
      const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

      for (const rec of records) {
        const updatedTime = new Date(rec.updated).getTime();
        if (!rec.is_playing && (now - updatedTime > FIVE_DAYS_MS)) {
          continue;
        }

        const cleanName = this.cleanDeviceName(rec.device_name);
        if (!seen.has(cleanName)) {
          seen.add(cleanName);
          result.push(rec);
        }
      }

      // Ensure this current device is represented in the list
      const myCleanName = this.getDeviceName();
      const hasMe = result.some(d => this.isCurrentDevice(d) || this.cleanDeviceName(d.device_name) === myCleanName);
      if (!hasMe) {
        const pState = usePlayerStore.getState();
        const curTrack = pState.currentTrackIndex >= 0 ? pState.queue[pState.currentTrackIndex] : null;
        result.unshift({
          id: localStorage.getItem('aura_my_device_record_id') || 'local_current',
          device_name: myCleanName,
          title: curTrack?.title || '',
          artist: curTrack?.artist || '',
          is_playing: pState.isPlaying,
          track_id: curTrack?.id || '',
          progress: pState.progress || 0,
          duration: curTrack?.duration || 0,
          updated: new Date().toISOString()
        });
      }

      return result;
    } catch (err) {
      console.warn('getActiveDevices error:', err);
      return [];
    }
  }

  public async transferPlaybackFromDevice(dev: any) {
    if (!dev || !dev.track_id) return;

    const trackToPlay: Track = {
      id: dev.track_id,
      title: dev.title || 'Трек',
      artist: dev.artist || 'Неизвестный исполнитель',
      album: '',
      duration: dev.duration || 0,
      originalCoverUrl: dev.cover_url || null,
      customCoverPath: null,
      filePath: dev.file_path || (dev.track_id.startsWith('ya_') ? 'yandex:' + dev.track_id.substring(3) : '')
    };

    usePlayerStore.getState().playContext([trackToPlay], 0);
    if (typeof dev.progress === 'number' && dev.progress > 0) {
      setTimeout(() => {
        usePlayerStore.getState().setProgress(dev.progress);
      }, 150);
    }

    // Immediately notify cloud of current device presence
    this.updateDevicePresence(trackToPlay, dev.progress || 0, true);
  }

  // ===================== FRIEND REQUESTS & SOCIAL CLOUD =====================

  public async sendFriendRequest(receiverId: string): Promise<boolean> {
    const senderId = this.getUserId();
    if (!senderId || !receiverId || senderId === receiverId) return false;

    try {
      // Check if request already exists in either direction
      const existing = await this.pb.collection('friend_requests').getList(1, 1, {
        filter: `(sender = "${senderId}" && receiver = "${receiverId}") || (sender = "${receiverId}" && receiver = "${senderId}")`
      });

      if (existing.items.length > 0) {
        const item = existing.items[0];
        // If the other user already sent a pending request to us, auto-accept it!
        if (item.sender === receiverId && item.status === 'pending') {
          await this.pb.collection('friend_requests').update(item.id, { status: 'accepted' });
          return true;
        }
        return true;
      }

      await this.pb.collection('friend_requests').create({
        sender: senderId,
        receiver: receiverId,
        status: 'pending'
      });
      return true;
    } catch (err) {
      console.warn('sendFriendRequest error:', err);
      return false;
    }
  }

  public async acceptFriendRequest(senderId: string): Promise<boolean> {
    const currentUserId = this.getUserId();
    if (!currentUserId || !senderId) return false;

    try {
      const existing = await this.pb.collection('friend_requests').getList(1, 1, {
        filter: `sender = "${senderId}" && receiver = "${currentUserId}" && status = "pending"`
      });
      if (existing.items.length > 0) {
        await this.pb.collection('friend_requests').update(existing.items[0].id, {
          status: 'accepted'
        });
        return true;
      }
    } catch (err) {
      console.warn('acceptFriendRequest error:', err);
    }
    return false;
  }

  public async rejectFriendRequest(senderId: string): Promise<boolean> {
    const currentUserId = this.getUserId();
    if (!currentUserId || !senderId) return false;

    try {
      const existing = await this.pb.collection('friend_requests').getList(1, 1, {
        filter: `sender = "${senderId}" && receiver = "${currentUserId}"`
      });
      if (existing.items.length > 0) {
        await this.pb.collection('friend_requests').delete(existing.items[0].id);
        return true;
      }
    } catch (err) {
      console.warn('rejectFriendRequest error:', err);
    }
    return false;
  }

  public async cancelOutgoingRequest(receiverId: string): Promise<boolean> {
    const currentUserId = this.getUserId();
    if (!currentUserId || !receiverId) return false;

    try {
      const existing = await this.pb.collection('friend_requests').getList(1, 1, {
        filter: `sender = "${currentUserId}" && receiver = "${receiverId}" && status = "pending"`
      });
      if (existing.items.length > 0) {
        await this.pb.collection('friend_requests').delete(existing.items[0].id);
        return true;
      }
    } catch (err) {
      console.warn('cancelOutgoingRequest error:', err);
    }
    return false;
  }

  public async removeFriend(friendId: string): Promise<boolean> {
    const currentUserId = this.getUserId();
    if (!currentUserId || !friendId) return false;

    try {
      const existing = await this.pb.collection('friend_requests').getList(1, 1, {
        filter: `(sender = "${currentUserId}" && receiver = "${friendId}") || (sender = "${friendId}" && receiver = "${currentUserId}")`
      });
      if (existing.items.length > 0) {
        await this.pb.collection('friend_requests').delete(existing.items[0].id);
        return true;
      }
    } catch (err) {
      console.warn('removeFriend error:', err);
    }
    return false;
  }

  public async getCloudFriendships(): Promise<{
    friends: CloudUser[];
    incoming: CloudUser[];
    outgoing: CloudUser[];
  }> {
    const currentUserId = this.getUserId();
    if (!currentUserId) {
      return { friends: [], incoming: [], outgoing: [] };
    }

    try {
      const list = await this.pb.collection('friend_requests').getFullList({
        filter: `sender = "${currentUserId}" || receiver = "${currentUserId}"`
      });

      const friendUserIds: string[] = [];
      const incomingUserIds: string[] = [];
      const outgoingUserIds: string[] = [];

      for (const req of list) {
        if (req.status === 'accepted') {
          const otherId = req.sender === currentUserId ? req.receiver : req.sender;
          if (otherId && !friendUserIds.includes(otherId)) friendUserIds.push(otherId);
        } else if (req.status === 'pending') {
          if (req.receiver === currentUserId) {
            if (!incomingUserIds.includes(req.sender)) incomingUserIds.push(req.sender);
          } else if (req.sender === currentUserId) {
            if (!outgoingUserIds.includes(req.receiver)) outgoingUserIds.push(req.receiver);
          }
        }
      }

      // Mutual exclusion: friends cannot be simultaneously pending
      const cleanIncomingIds = incomingUserIds.filter(id => !friendUserIds.includes(id));
      const cleanOutgoingIds = outgoingUserIds.filter(id => !friendUserIds.includes(id));

      // Fetch user profiles for all involved IDs
      const allIds = Array.from(new Set([...friendUserIds, ...cleanIncomingIds, ...cleanOutgoingIds]));
      const userMap = new Map<string, CloudUser>();
      await Promise.all(allIds.map(async (id) => {
        try {
          let u = await this.getUserProfile(id);
          if (!u) {
            const rawRec = await this.pb.collection('users').getOne(id).catch(() => null);
            if (rawRec) u = this.formatUserRecord(rawRec);
          }
          if (u) userMap.set(id, u);
        } catch {
          try {
            const rawRec = await this.pb.collection('users').getOne(id).catch(() => null);
            if (rawRec) userMap.set(id, this.formatUserRecord(rawRec));
          } catch {}
        }
      }));

      // Automatically clean up orphaned friend_requests where the other user was deleted from the database
      for (const req of list) {
        const otherId = req.sender === currentUserId ? req.receiver : req.sender;
        if (otherId && !userMap.has(otherId)) {
          this.pb.collection('friend_requests').delete(req.id).catch(() => {});
        }
      }

      const friends = friendUserIds.map(id => userMap.get(id)).filter(Boolean) as CloudUser[];
      const incoming = cleanIncomingIds.map(id => userMap.get(id)).filter(Boolean) as CloudUser[];
      const outgoing = cleanOutgoingIds.map(id => userMap.get(id)).filter(Boolean) as CloudUser[];

      return { friends, incoming, outgoing };
    } catch (err) {
      console.warn('getCloudFriendships error:', err);
      return { friends: [], incoming: [], outgoing: [] };
    }
  }

  public async getUserFriends(userId: string): Promise<CloudUser[]> {
    if (!userId) return [];
    try {
      const list = await this.pb.collection('friend_requests').getFullList({
        filter: `(sender = "${userId}" || receiver = "${userId}") && status = "accepted"`
      });

      const friendUserIds: string[] = [];
      const reqMap = new Map<string, string>();
      for (const req of list) {
        const otherId = req.sender === userId ? req.receiver : req.sender;
        if (otherId && !friendUserIds.includes(otherId)) {
          friendUserIds.push(otherId);
          reqMap.set(otherId, req.id);
        }
      }

      const friends: CloudUser[] = [];
      await Promise.all(friendUserIds.map(async (fid) => {
        try {
          const profile = await this.getUserProfile(fid);
          if (profile) {
            friends.push(profile);
          } else {
            // User was deleted from database! Purge orphaned friend_requests
            const reqId = reqMap.get(fid);
            if (reqId) this.pb.collection('friend_requests').delete(reqId).catch(() => {});
          }
        } catch {
          const reqId = reqMap.get(fid);
          if (reqId) this.pb.collection('friend_requests').delete(reqId).catch(() => {});
        }
      }));

      return friends;
    } catch (err) {
      console.warn('getUserFriends error:', err);
      return [];
    }
  }
}

export const pocketBaseService = new PocketBaseService();
