import PocketBase from 'pocketbase';
import { readFile } from '@tauri-apps/plugin-fs';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useAuthStore, CloudUser } from '../store/useAuthStore';
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
    let blob: Blob | null = null;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
      const res = await fetch(url);
      blob = await res.blob();
    } else {
      // Local file path (e.g. C:\... or /storage/... or file:// or asset://)
      try {
        const cleanPath = url.replace(/^file:\/\//, '');
        const data = await readFile(cleanPath);
        const ext = cleanPath.split('.').pop()?.toLowerCase() || 'jpg';
        const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        blob = new Blob([data], { type: mime });
      } catch {
        try {
          const res = await fetch(convertFileSrc(url));
          blob = await res.blob();
        } catch {
          blob = null;
        }
      }
    }

    if (!blob) return url;

    return new Promise<string>((resolve) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(blob!);
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
  private isSyncingFavorites: boolean = false;
  private isSyncingPlaylists: boolean = false;
  private isSyncingHistory: boolean = false;
  private isSyncingForYou: boolean = false;
  private isInternalSync: boolean = false;
  private historyDebounceTimer: any = null;
  private forYouDebounceTimer: any = null;
  private deviceListeners = new Set<() => void>();

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

    return {
      id: record.id,
      email: record.email,
      name: record.name || record.username,
      username: record.username || record.name,
      avatar: parseMedia(record.avatar),
      banner: parseMedia(record.banner),
      status: record.status || undefined,
      bio: record.bio || undefined
    };
  }

  constructor() {
    const url = useAuthStore.getState().serverUrl || 'http://31.77.15.175:8090';
    this.pb = new PocketBase(url);
    this.pb.autoCancellation(false);

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

    if (this.pb.authStore.isValid && this.pb.authStore.record) {
      const record = this.pb.authStore.record;
      const formatted = this.formatUserRecord(record);
      const currentUser = useAuthStore.getState().user;
      useAuthStore.getState().setUser({
        ...formatted,
        avatar: formatted.avatar || currentUser?.avatar,
        banner: formatted.banner || currentUser?.banner,
        status: formatted.status || currentUser?.status,
        bio: formatted.bio || currentUser?.bio
      });
      useAuthStore.getState().setToken(this.pb.authStore.token);
      this.subscribeRealtime();
      setTimeout(() => {
        this.syncAll().catch(err => console.warn('Startup syncAll error:', err));
      }, 500);
    }

    // Auto-resync when connection is restored
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.isLoggedIn()) {
          this.subscribeRealtime();
          this.syncAll().catch(() => {});
        }
      });
    }

    // Register collection store sync listener
    setCollectionSyncListener({
      onTrackLiked: (track, isLiked) => this.onTrackLiked(track, isLiked),
      onPlaylistModified: (playlist) => this.onPlaylistModified(playlist),
      onPlaylistDeleted: (name) => this.onPlaylistDeleted(name)
    });

    // Register player store history sync listener
    usePlayerStore.subscribe((state, prevState) => {
      if (state.history !== prevState.history && !this.isInternalSync && !this.isSyncingHistory && this.isLoggedIn()) {
        this.pushHistory(state.history || []);
      }
    });
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

  public getDeviceName(): string {
    if (isAndroid) return 'Android Устройство';
    if (isIOS) return 'iPhone / iPad';
    return 'Компьютер (ПК)';
  }

  public isLoggedIn(): boolean {
    return this.pb.authStore.isValid && !!this.pb.authStore.record?.id;
  }

  public getUserId(): string | null {
    return this.pb.authStore.record?.id || null;
  }

  public async login(identity: string, pass: string) {
    try {
      useAuthStore.getState().setSyncStatus('Авторизация...');
      const authData = await this.pb.collection('users').authWithPassword(identity.trim(), pass);
      const record = authData.record;
      const formatted = this.formatUserRecord(record);
      const currentUser = useAuthStore.getState().user;
      useAuthStore.getState().setUser({
        ...formatted,
        avatar: formatted.avatar || currentUser?.avatar,
        banner: formatted.banner || currentUser?.banner,
        status: formatted.status || currentUser?.status,
        bio: formatted.bio || currentUser?.bio
      });
      useAuthStore.getState().setToken(authData.token);
      useAuthStore.getState().setSyncStatus('Успешно');

      this.subscribeRealtime();
      await this.syncAll();
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
    status?: string;
    bio?: string;
    avatarBlob?: Blob;
    bannerBlob?: Blob;
  }) {
    // 1. Immediately update client-side auth store & local storage
    useAuthStore.getState().updateUser({
      name: fields.name,
      avatar: fields.avatar,
      banner: fields.banner,
      status: fields.status,
      bio: fields.bio
    });

    const userId = this.getUserId();
    if (!userId || !this.isLoggedIn()) {
      return { success: true, localOnly: true };
    }

    try {
      // 2. Prepare FormData so PocketBase receives files as proper binary blobs for 'file' type fields
      const formData = new FormData();
      if (fields.name) formData.append('name', fields.name);
      if (fields.username) formData.append('username', fields.username);
      if (fields.status !== undefined) formData.append('status', fields.status);
      if (fields.bio !== undefined) formData.append('bio', fields.bio);

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

      // Same for banner
      if (fields.bannerBlob) {
        formData.append('banner', fields.bannerBlob, 'banner.jpg');
      } else if (fields.banner === '') {
        formData.append('banner', '');
      } else if (fields.banner) {
        const isPbFile = fields.banner.includes('/api/files/') || (this.pb.baseUrl && fields.banner.includes(this.pb.baseUrl));
        if (!isPbFile) {
          try {
            const blob = await getBlobWithTimeout(fields.banner, 3000);
            if (blob) {
              formData.append('banner', blob, 'banner.jpg');
            }
          } catch (e) {
            console.warn('Banner blob fetch error:', e);
          }
        }
      }

      try {
        const record = await this.pb.collection('users').update(userId, formData);
        const formatted = this.formatUserRecord(record);
        useAuthStore.getState().updateUser({
          ...formatted,
          avatar: fields.avatar === '' ? '' : (formatted.avatar || fields.avatar),
          banner: fields.banner === '' ? '' : (formatted.banner || fields.banner)
        });
        return { success: true, record };
      } catch (err: any) {
        console.warn('FormData profile update failed, falling back to standard fields:', err);
        const standardPayload: Record<string, any> = {};
        if (fields.name !== undefined) standardPayload.name = fields.name;
        if (fields.username !== undefined) standardPayload.username = fields.username;
        if (Object.keys(standardPayload).length > 0) {
          try {
            await this.pb.collection('users').update(userId, standardPayload);
          } catch {}
        }
        return { success: true };
      }
    } catch (err) {
      console.warn('Failed to update PocketBase profile:', err);
      return { success: false, error: err };
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
      await Promise.all([
        this.syncFavorites(),
        this.syncPlaylists(),
        this.syncHistory(),
        this.syncForYou()
      ]);
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
        filter: `user = "${userId}"`
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

      // Detect tracks deleted on other devices
      const deletedRemotely = new Set<string>();
      if (previouslySynced.size > 0) {
        for (const id of previouslySynced) {
          if (!serverMap.has(id)) {
            deletedRemotely.add(id);
          }
        }
      }

      // 1. Upload local favorites that are NOT on server and NOT deleted remotely
      for (const track of localLiked) {
        if (deletedRemotely.has(track.id)) continue;
        if (!serverMap.has(track.id) && !previouslySynced.has(track.id)) {
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
            });
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

      if (merged.length !== localLiked.length) {
        collectionStore.reorderLikedTracks(merged);
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
    if (!userId) return;

    const favSyncKey = `aura_synced_favs_${userId}`;
    const synced = new Set<string>(JSON.parse(localStorage.getItem(favSyncKey) || '[]'));

    try {
      if (isLiked) {
        synced.add(track.id);
        localStorage.setItem(favSyncKey, JSON.stringify(Array.from(synced)));

        const existing = await this.pb.collection('favorites').getList(1, 1, {
          filter: `user = "${userId}" && track_id = "${track.id}"`
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
          });
        }
      } else {
        synced.delete(track.id);
        localStorage.setItem(favSyncKey, JSON.stringify(Array.from(synced)));

        const existing = await this.pb.collection('favorites').getList(1, 1, {
          filter: `user = "${userId}" && track_id = "${track.id}"`
        });
        if (existing.items.length > 0) {
          await this.pb.collection('favorites').delete(existing.items[0].id);
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
        filter: `user = "${userId}"`
      });

      const serverPlaylists = records.map(r => ({
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

      const localByName = new Map<string, Playlist>();
      const localByCloudId = new Map<string, Playlist>();
      for (const lp of localPlaylists) {
        localByName.set(lp.name.trim().toLowerCase(), lp);
        if (lp.cloudId) localByCloudId.set(lp.cloudId, lp);
      }

      const plSyncKey = `aura_synced_pls_${userId}`;
      const previouslySyncedPls = new Set<string>(
        JSON.parse(localStorage.getItem(plSyncKey) || '[]')
      );

      // Detect playlists deleted on other devices
      const deletedPlsRemotely = new Set<string>();
      if (previouslySyncedPls.size > 0) {
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

          // Merge cover: if server has cover, take it
          if (serverPl.coverUrl) {
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
              });
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
        const key = localPl.name.trim().toLowerCase();
        if (!serverByName.has(key) && !localPl.cloudId) {
          try {
            const portableCover = await makePortableCover(localPl.coverUrl);
            const created = await this.pb.collection('playlists').create({
              user: userId,
              name: localPl.name,
              tracks_json: localPl.tracks || [],
              cover_url: portableCover || ''
            });
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
      throw err;
    } finally {
      this.isSyncingPlaylists = false;
    }
  }

  private playlistDebounceTimers = new Map<string, any>();

  public onPlaylistModified(playlist: Playlist) {
    const userId = this.getUserId();
    if (!userId || this.isInternalSync || this.isSyncingPlaylists) return;

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
    if (!userId || this.isInternalSync) return;

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

  public subscribeRealtime() {
    const userId = this.getUserId();
    if (!userId) return;

    try {
      // 1. Subscribe to favorites
      this.pb.collection('favorites').subscribe('*', (e) => {
        if (this.isSyncingFavorites || this.isInternalSync) return;
        const collectionStore = useCollectionStore.getState();
        if (e.action === 'create' && e.record.user === userId) {
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
            collectionStore.reorderLikedTracks([newTrack, ...collectionStore.likedTracks]);
          }
        } else if (e.action === 'delete') {
          const trackId = e.record.track_id;
          if (trackId && collectionStore.isLiked(trackId)) {
            const filtered = collectionStore.likedTracks.filter(t => t.id !== trackId);
            collectionStore.reorderLikedTracks(filtered);
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
        if (e.record.user !== userId) return;

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
        if (e.record.user !== userId) return;
        this.notifyDeviceListeners();
      }).then(unsub => {
        this.unsubscribeDevices = unsub;
      }).catch(err => {
        console.warn('Realtime devices subscribe error:', err);
      });

      // 4. Subscribe to user profile updates (realtime sync between phone/desktop)
      if (this.unsubscribeUser) {
        this.unsubscribeUser();
        this.unsubscribeUser = null;
      }
      this.pb.collection('users').subscribe(userId, (e) => {
        if (e.action === 'update' && e.record) {
          const formatted = this.formatUserRecord(e.record);
          const currentUser = useAuthStore.getState().user;
          useAuthStore.getState().updateUser({
            ...formatted,
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
      if (this.unsubscribeHistory) {
        this.unsubscribeHistory();
        this.unsubscribeHistory = null;
      }
      this.pb.collection('history').subscribe('*', (e) => {
        if (this.isSyncingHistory || this.isInternalSync) return;
        if (e.record.user !== userId) return;

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
      if (this.unsubscribeForYou) {
        this.unsubscribeForYou();
        this.unsubscribeForYou = null;
      }
      this.pb.collection('for_you').subscribe('*', (e) => {
        if (this.isSyncingForYou || this.isInternalSync) return;
        if (e.record.user !== userId) return;

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
    } catch (e) {
      console.warn('PocketBase realtime subscribe error:', e);
    }
  }

  public async updateDevicePresence(track: Track | null, progress: number, isPlaying: boolean) {
    const userId = this.getUserId();
    if (!userId || !track) return;

    try {
      const deviceName = this.getDeviceName();
      const existing = await this.pb.collection('device_sync').getList(1, 1, {
        filter: `user = "${userId}" && device_name = "${deviceName}"`
      });

      const payload = {
        user: userId,
        device_name: deviceName,
        track_id: track.id,
        title: track.title,
        artist: track.artist,
        cover_url: track.originalCoverUrl || '',
        file_path: track.filePath || '',
        duration: track.duration || 0,
        progress: Math.round(progress),
        is_playing: isPlaying
      };

      if (existing.items.length > 0) {
        await this.pb.collection('device_sync').update(existing.items[0].id, payload);
      } else {
        await this.pb.collection('device_sync').create(payload);
      }
    } catch {
      // Presence updates are silent
    }
  }

  public async getActiveDevices() {
    const userId = this.getUserId();
    if (!userId) return [];

    try {
      return await this.pb.collection('device_sync').getFullList({
        filter: `user = "${userId}"`,
        sort: '-updated'
      });
    } catch {
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
}

export const pocketBaseService = new PocketBaseService();
