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

    // Initial check
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
      // Auto sync in background on app start
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
    return this.pb.authStore.isValid;
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
    if (!this.isLoggedIn()) return;
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
      const storedSynced = localStorage.getItem('synced_favorite_ids');
      const syncedIds = new Set<string>(storedSynced ? JSON.parse(storedSynced) : []);

      const records = await this.pb.collection('favorites').getFullList({
        filter: `user = "${userId}"`,
        sort: '-created'
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

      // 1. Upload local favorites that are NOT on server AND NOT previously synced
      for (const track of localLiked) {
        if (!serverMap.has(track.id)) {
          if (!syncedIds.has(track.id)) {
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
      }

      // 2. Assemble final liked list: keep tracks on server or newly added local ones
      const finalLiked: Track[] = [];
      const addedIds = new Set<string>();

      for (const track of localLiked) {
        if (serverMap.has(track.id) || !syncedIds.has(track.id)) {
          finalLiked.push(track);
          addedIds.add(track.id);
        }
      }

      for (const track of serverTracks) {
        if (!addedIds.has(track.id)) {
          finalLiked.push(track);
          addedIds.add(track.id);
        }
      }

      collectionStore.reorderLikedTracks(finalLiked);
      const newSyncedIds = finalLiked.map(t => t.id);
      try {
        localStorage.setItem('synced_favorite_ids', JSON.stringify(newSyncedIds));
      } catch (e) {
        console.warn('Failed to save synced_favorite_ids:', e);
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
      const storedSynced = localStorage.getItem('synced_favorite_ids');
      const syncedIds = new Set<string>(storedSynced ? JSON.parse(storedSynced) : []);

      if (isLiked) {
        syncedIds.add(track.id);
        try {
          localStorage.setItem('synced_favorite_ids', JSON.stringify(Array.from(syncedIds)));
        } catch {}

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
        syncedIds.delete(track.id);
        try {
          localStorage.setItem('synced_favorite_ids', JSON.stringify(Array.from(syncedIds)));
        } catch {}

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
        filter: `user = "${userId}"`,
        sort: '-updated'
      });

      const serverPlaylists = records.map(r => ({
        id: r.id,
        name: r.name,
        coverUrl: r.cover_url || undefined,
        tracks: Array.isArray(r.tracks_json) ? r.tracks_json : [],
        cloudId: r.id,
        updatedAt: new Date(r.updated).getTime()
      }));

      const collectionStore = useCollectionStore.getState();
      const localPlaylists = [...collectionStore.playlists];

      const serverById = new Map(serverPlaylists.map(p => [p.id, p]));
      const serverByName = new Map(serverPlaylists.map(p => [p.name.trim().toLowerCase(), p]));

      const localByCloudId = new Map(localPlaylists.filter(p => p.cloudId).map(p => [p.cloudId!, p]));
      const localByName = new Map(localPlaylists.map(p => [p.name.trim().toLowerCase(), p]));

      // 1. Process server playlists: merge into local
      for (const serverPl of serverPlaylists) {
        const localPl = localByCloudId.get(serverPl.id) || localByName.get(serverPl.name.trim().toLowerCase());
        if (localPl) {
          localPl.cloudId = serverPl.id;
          const serverTime = serverPl.updatedAt || 0;
          const localTime = localPl.updatedAt || 0;

          // If server is newer (or equal/close) or local has no updatedAt, adopt server data
          if (serverTime >= localTime) {
            localPl.tracks = serverPl.tracks;
            if (serverPl.coverUrl !== undefined) {
              localPl.coverUrl = serverPl.coverUrl || undefined;
            }
            localPl.name = serverPl.name;
            localPl.updatedAt = serverTime;
          } else {
            // Local is newer: push local tracks & cover to server
            try {
              await this.pb.collection('playlists').update(serverPl.id, {
                name: localPl.name,
                tracks_json: localPl.tracks,
                cover_url: localPl.coverUrl || ''
              });
            } catch (err) {
              console.warn('Failed to update playlist on server:', err);
            }
          }
        } else {
          // New playlist from another device
          localPlaylists.push({
            id: 'pl_' + serverPl.id,
            name: serverPl.name,
            coverUrl: serverPl.coverUrl,
            tracks: serverPl.tracks,
            cloudId: serverPl.id,
            updatedAt: serverPl.updatedAt
          });
        }
      }

      // 2. Process local playlists: upload new local, or purge deleted
      const finalPlaylists: Playlist[] = [];
      for (const pl of localPlaylists) {
        if (pl.cloudId && !serverById.has(pl.cloudId)) {
          // Deleted on server on another device, remove locally
          continue;
        }

        if (!pl.cloudId && !serverByName.has(pl.name.trim().toLowerCase())) {
          // Newly created local playlist: upload to server
          try {
            const created = await this.pb.collection('playlists').create({
              user: userId,
              name: pl.name,
              tracks_json: pl.tracks,
              cover_url: pl.coverUrl || ''
            });
            pl.cloudId = created.id;
            pl.updatedAt = new Date(created.updated).getTime();
          } catch (e) {
            console.warn('Failed to upload new local playlist to cloud:', e);
          }
        }
        finalPlaylists.push(pl);
      }

      this.isInternalSync = true;
      collectionStore.setPlaylists(finalPlaylists);
      this.isInternalSync = false;
    } catch (err) {
      console.error('syncPlaylists error:', err);
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
        const existing = await this.pb.collection('playlists').getList(1, 1, {
          filter: `user = "${userId}" && name = "${playlist.name.replace(/"/g, '\\"')}"`
        });
        if (existing.items.length > 0) {
          recordId = existing.items[0].id;
          playlist.cloudId = recordId;
        }
      }

      const payload = {
        name: playlist.name,
        tracks_json: playlist.tracks,
        cover_url: playlist.coverUrl || ''
      };

      if (recordId) {
        await this.pb.collection('playlists').update(recordId, payload);
      } else {
        const created = await this.pb.collection('playlists').create({
          user: userId,
          ...payload
        });
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
      const existing = await this.pb.collection('playlists').getList(1, 1, {
        filter: `user = "${userId}" && name = "${name.replace(/"/g, '\\"')}"`
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
            cloudId: record.id,
            updatedAt: new Date(record.updated).getTime()
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
        filter: `user = "${userId}"`,
        sort: '-updated'
      });
    } catch {
      return [];
    }
  }
}

export const pocketBaseService = new PocketBaseService();
