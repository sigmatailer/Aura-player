import PocketBase from 'pocketbase';
import { useAuthStore } from '../store/useAuthStore';
import { useCollectionStore, Playlist, setCollectionSyncListener } from '../store/useCollectionStore';
import { Track } from '../types';

const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

class PocketBaseService {
  public pb: PocketBase;
  private unsubscribeFavorites: (() => void) | null = null;
  private unsubscribePlaylists: (() => void) | null = null;
  private isSyncingFavorites: boolean = false;
  private isSyncingPlaylists: boolean = false;
  private isInternalSync: boolean = false;

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
      useAuthStore.getState().setUser({
        id: record.id,
        email: record.email,
        name: record.name || record.username,
        avatar: record.avatar ? this.pb.files.getURL(record, record.avatar) : undefined
      });
      useAuthStore.getState().setToken(this.pb.authStore.token);
      this.subscribeRealtime();
      setTimeout(() => {
        this.syncAll().catch(err => console.warn('Startup syncAll error:', err));
      }, 500);
    }

    // Register collection store sync listener
    setCollectionSyncListener({
      onTrackLiked: (track, isLiked) => this.onTrackLiked(track, isLiked),
      onPlaylistModified: (playlist) => this.onPlaylistModified(playlist),
      onPlaylistDeleted: (name) => this.onPlaylistDeleted(name)
    });
  }

  public getDeviceName(): string {
    if (isAndroid) return 'Android Устройство';
    if (isIOS) return 'iPhone / iPad';
    return 'Компьютер (Desktop)';
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
      useAuthStore.getState().setUser({
        id: record.id,
        email: record.email,
        name: record.name || record.username,
        avatar: record.avatar ? this.pb.files.getURL(record, record.avatar) : undefined
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
      await this.pb.collection('users').create({
        email: cleanEmail,
        password: pass,
        passwordConfirm: passConfirm,
        name: cleanName,
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

  public logout() {
    if (this.unsubscribeFavorites) {
      this.unsubscribeFavorites();
      this.unsubscribeFavorites = null;
    }
    if (this.unsubscribePlaylists) {
      this.unsubscribePlaylists();
      this.unsubscribePlaylists = null;
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
      await Promise.all([this.syncFavorites(), this.syncPlaylists()]);
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
      const localMap = new Map(localLiked.map(t => [t.id, t]));

      // 1. Upload local favorites that are NOT on server
      for (const track of localLiked) {
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
            });
            serverMap.set(track.id, track);
          } catch (e) {
            console.warn('Failed to upload favorite to cloud:', e);
          }
        }
      }

      // 2. Add server favorites to local store if missing
      const merged: Track[] = [...localLiked];
      for (const track of serverTracks) {
        if (!localMap.has(track.id)) {
          merged.push(track);
        }
      }

      if (merged.length !== localLiked.length) {
        collectionStore.reorderLikedTracks(merged);
      }
    } catch (err) {
      console.error('syncFavorites error:', err);
    } finally {
      this.isSyncingFavorites = false;
    }
  }

  public async onTrackLiked(track: Track, isLiked: boolean) {
    const userId = this.getUserId();
    if (!userId) return;

    try {
      if (isLiked) {
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

      // 1. Merge server playlists into local store
      for (const serverPl of serverPlaylists) {
        const key = serverPl.name.trim().toLowerCase();
        const localPl = localByCloudId.get(serverPl.id) || localByName.get(key);
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
              await this.pb.collection('playlists').update(serverPl.id, {
                tracks_json: localPl.tracks,
                cover_url: localPl.coverUrl || serverPl.coverUrl || ''
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
          localPlaylists.push(newLocalPl);
          localByName.set(key, newLocalPl);
        }
      }

      // 2. Upload any local playlists not present on server
      for (const localPl of localPlaylists) {
        const key = localPl.name.trim().toLowerCase();
        if (!serverByName.has(key) && !localPl.cloudId) {
          try {
            const created = await this.pb.collection('playlists').create({
              user: userId,
              name: localPl.name,
              tracks_json: localPl.tracks || [],
              cover_url: localPl.coverUrl || ''
            });
            localPl.cloudId = created.id;
            serverByName.set(key, {
              id: created.id,
              name: localPl.name,
              coverUrl: localPl.coverUrl,
              tracks: localPl.tracks,
              cloudId: created.id
            });
          } catch (e) {
            console.warn('Failed to create playlist on server:', e);
          }
        }
      }

      this.isInternalSync = true;
      collectionStore.setPlaylists(localPlaylists);
      this.isInternalSync = false;
    } catch (err) {
      console.error('syncPlaylists error:', err);
      throw err;
    } finally {
      this.isSyncingPlaylists = false;
    }
  }

  public async onPlaylistModified(playlist: Playlist) {
    const userId = this.getUserId();
    if (!userId || this.isInternalSync || this.isSyncingPlaylists) return;

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

      const payload = {
        user: userId,
        name: playlist.name,
        tracks_json: playlist.tracks || [],
        cover_url: playlist.coverUrl || ''
      };

      if (recordId) {
        await this.pb.collection('playlists').update(recordId, payload);
      } else {
        const created = await this.pb.collection('playlists').create(payload);
        playlist.cloudId = created.id;
      }
    } catch (err) {
      console.warn('onPlaylistModified error:', err);
    }
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
        await this.pb.collection('playlists').delete(existing.items[0].id);
      }
    } catch (err) {
      console.warn('onPlaylistDeleted error:', err);
    }
  }

  public subscribeRealtime() {
    const userId = this.getUserId();
    if (!userId) return;

    try {
      // Subscribe to favorites
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
          if (collectionStore.isLiked(trackId)) {
            const filtered = collectionStore.likedTracks.filter(t => t.id !== trackId);
            collectionStore.reorderLikedTracks(filtered);
          }
        }
      }).then(unsub => {
        this.unsubscribeFavorites = unsub;
      }).catch(err => {
        console.warn('Realtime favorites subscribe error:', err);
      });

      // Subscribe to playlists
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
        filter: `user = "${userId}"`
      });
    } catch {
      return [];
    }
  }
}

export const pocketBaseService = new PocketBaseService();
