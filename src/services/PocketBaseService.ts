import PocketBase from 'pocketbase';
import { useAuthStore } from '../store/useAuthStore';
import { useCollectionStore, Playlist, setCollectionSyncListener } from '../store/useCollectionStore';
import { Track } from '../types';
import { isAndroid, isIOS } from './AudioService';

class PocketBaseService {
  public pb: PocketBase;
  private unsubscribeFavorites: (() => void) | null = null;
  private unsubscribePlaylists: (() => void) | null = null;
  private isSyncingFavorites: boolean = false;
  private isSyncingPlaylists: boolean = false;

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

  public async login(email: string, pass: string) {
    try {
      useAuthStore.getState().setSyncStatus('Авторизация...');
      const authData = await this.pb.collection('users').authWithPassword(email, pass);
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
      return { success: false, error: err?.message || 'Ошибка входа' };
    }
  }

  public async register(email: string, pass: string, passConfirm: string, name?: string) {
    try {
      useAuthStore.getState().setSyncStatus('Регистрация...');
      await this.pb.collection('users').create({
        email,
        password: pass,
        passwordConfirm: passConfirm,
        name: name || email.split('@')[0],
      });
      return await this.login(email, pass);
    } catch (err: any) {
      console.error('PocketBase register error:', err);
      useAuthStore.getState().setSyncStatus('Ошибка регистрации');
      return { success: false, error: err?.message || 'Ошибка регистрации' };
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
      const localMap = new Map(localLiked.map(t => [t.id, t]));

      // 1. Upload local favorites that are not on server
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
        // Upload to server if not exists
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
        // Remove from server
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

      const serverPlaylists: Playlist[] = records.map(r => ({
        id: r.id,
        name: r.name,
        tracks: r.tracks_json || []
      }));

      const collectionStore = useCollectionStore.getState();
      const localPlaylists = collectionStore.playlists;

      const serverMap = new Map(serverPlaylists.map(p => [p.name, p]));
      const localMap = new Map(localPlaylists.map(p => [p.name, p]));

      // 1. Upload local playlists to server if not present
      for (const pl of localPlaylists) {
        if (!serverMap.has(pl.name)) {
          try {
            await this.pb.collection('playlists').create({
              user: userId,
              name: pl.name,
              tracks_json: pl.tracks
            });
          } catch (e) {
            console.warn('Failed to upload playlist:', e);
          }
        }
      }

      // 2. Merge server playlists into local
      const merged: Playlist[] = [...localPlaylists];
      for (const pl of serverPlaylists) {
        if (!localMap.has(pl.name)) {
          merged.push(pl);
        }
      }

      if (merged.length !== localPlaylists.length) {
        useCollectionStore.setState({ playlists: merged });
        localStorage.setItem('playlists', JSON.stringify(merged));
      }
    } catch (err) {
      console.error('syncPlaylists error:', err);
    } finally {
      this.isSyncingPlaylists = false;
    }
  }

  public async onPlaylistModified(playlist: Playlist) {
    const userId = this.getUserId();
    if (!userId) return;

    try {
      const existing = await this.pb.collection('playlists').getList(1, 1, {
        filter: `user = "${userId}" && name = "${playlist.name}"`
      });
      if (existing.items.length > 0) {
        await this.pb.collection('playlists').update(existing.items[0].id, {
          tracks_json: playlist.tracks
        });
      } else {
        await this.pb.collection('playlists').create({
          user: userId,
          name: playlist.name,
          tracks_json: playlist.tracks
        });
      }
    } catch (err) {
      console.warn('onPlaylistModified error:', err);
    }
  }

  public async onPlaylistDeleted(name: string) {
    const userId = this.getUserId();
    if (!userId) return;

    try {
      const existing = await this.pb.collection('playlists').getList(1, 1, {
        filter: `user = "${userId}" && name = "${name}"`
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
        if (this.isSyncingFavorites) return;
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
        if (this.isSyncingPlaylists) return;
        const collectionStore = useCollectionStore.getState();
        if (e.action === 'create' && e.record.user === userId) {
          const exists = collectionStore.playlists.some(p => p.name === e.record.name);
          if (!exists) {
            collectionStore.createPlaylist(e.record.name, e.record.tracks_json || []);
          }
        } else if (e.action === 'delete' && e.record.user === userId) {
          const target = collectionStore.playlists.find(p => p.name === e.record.name);
          if (target) {
            collectionStore.deletePlaylist(target.id);
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
