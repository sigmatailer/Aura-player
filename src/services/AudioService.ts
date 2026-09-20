import { open } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile, mkdir } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import * as mm from 'music-metadata-browser';
import { usePlayerStore } from '../store/usePlayerStore';
import { useCacheStore } from '../store/useCacheStore';
import { Track } from '../types';
import { fetchMoreWaveTracks } from './WaveRecommendationService';

export const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
export const isMobile = isIOS || isAndroid || (typeof navigator !== 'undefined' && /Mobi|Tablet|iPad|iPhone|Android/i.test(navigator.userAgent));

export class AudioService {
  private audio: HTMLAudioElement;
  private currentLoadId: number = 0;
  private isLoadingTrack: boolean = false;

  // Equalizer & Audio Graph
  private audioCtx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private volumeNode: GainNode | null = null;
  private eqBands: BiquadFilterNode[] = [];
  public eqFrequencies = [60, 150, 400, 1000, 2400, 15000];

  constructor() {
    this.audio = new Audio();
    // Do not set crossOrigin on mobile (iOS/Android) so native stream playback has no CORS restrictions
    if (!isMobile) {
      this.audio.crossOrigin = 'anonymous';
    }
    
    // Инициализируем громкость с учетом кривой
    this.applyVolume(usePlayerStore.getState().volume ?? 1);
    
    // Подписываемся на события аудио
    this.audio.addEventListener('timeupdate', () => {
      usePlayerStore.getState().setProgress(this.audio.currentTime);
      if (Math.floor(this.audio.currentTime) % 4 === 0) {
        this.updateMediaSessionPosition();
      }
    });

    this.audio.addEventListener('play', () => {
      if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    });

    this.audio.addEventListener('pause', () => {
      if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    });

    this.audio.addEventListener('durationchange', () => {
      this.updateMediaSessionPosition();
    });

    this.audio.addEventListener('seeked', () => {
      this.updateMediaSessionPosition();
      const state = usePlayerStore.getState();
      if (!this.isLoadingTrack && state.isPlaying && this.audio.paused && this.audio.src) {
        this.resumeAudioContext();
        const playPromise = this.audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            if (e.name !== 'AbortError') console.error('Auto-resume after seek error:', e);
          });
        }
      }
    });

    // Регистрируем обработчики управления для экрана блокировки / шторки уведомлений / гарнитуры
    if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          usePlayerStore.getState().togglePlayPause();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          usePlayerStore.getState().togglePlayPause();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          usePlayerStore.getState().prevTrack();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          usePlayerStore.getState().nextTrack();
        });
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) {
            usePlayerStore.getState().setProgress(details.seekTime);
          }
        });
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
          const skipTime = details.seekOffset || 10;
          usePlayerStore.getState().setProgress(Math.max(this.audio.currentTime - skipTime, 0));
        });
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
          const skipTime = details.seekOffset || 10;
          usePlayerStore.getState().setProgress(Math.min(this.audio.currentTime + skipTime, this.audio.duration || 0));
        });
      } catch (e) {
        console.warn('MediaSession action handler registration error:', e);
      }
    }

    this.audio.addEventListener('stalled', () => {
      const state = usePlayerStore.getState();
      if (!this.isLoadingTrack && state.isPlaying && this.audio.paused && this.audio.src && this.audio.readyState >= 2) {
        this.resumeAudioContext();
        this.audio.play().catch(() => {});
      }
    });

    this.audio.addEventListener('error', () => {
      console.warn('Audio element error:', this.audio.error);
    });
    
    this.audio.addEventListener('ended', () => {
      // Защита от ложных срабатываний ended при сбросе src или во время переключения
      if (this.isLoadingTrack) return;
      if (!this.audio.src || this.audio.src === window.location.href) return;
      if (isNaN(this.audio.duration) || this.audio.duration <= 0) return;
      if (Math.abs(this.audio.currentTime - this.audio.duration) > 2) return;

      // Immediately pause old track to prevent any audio bleed
      this.audio.pause();

      const state = usePlayerStore.getState();
      state.nextTrack(true);
      
      // Fix: Если трек остался тот же (например, включен repeat "one"), вручную перезапускаем плеер с 0:00
      setTimeout(() => {
        const newState = usePlayerStore.getState();
        if (newState.isPlaying && newState.currentTrackIndex === state.currentTrackIndex) {
          this.audio.currentTime = 0;
          this.resumeAudioContext();
          const playPromise = this.audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(e => {
              if (e.name !== 'AbortError') console.error(e);
            });
          }
        }
      }, 0);
    });

    // Подписываемся на изменения в Zustand store
    usePlayerStore.subscribe(async (state, prevState) => {
      // Sync Volume
      if (state.volume !== prevState.volume) {
        this.applyVolume(state.volume);
      }
      
      // Sync EQ (only initialize if custom EQ is set and not on mobile)
      const hasCustomEq = !isMobile && (state.eqBands.some(val => val !== 0) || state.eqPreAmp !== 0);
      if (hasCustomEq) {
        this.initEqualizer();
      }
      if (this.audioCtx) {
        if (state.eqBands !== prevState.eqBands) {
          state.eqBands.forEach((val, i) => this.setEqBand(i, val));
        }
        if (state.eqPreAmp !== prevState.eqPreAmp) {
          this.setPreAmp(state.eqPreAmp);
        }
      }

      // Трек изменился (индекс изменился или сама очередь поменялась так, что трек стал другим)
      const currentTrack = state.currentTrackIndex >= 0 ? state.queue[state.currentTrackIndex] : null;
      const prevTrack = prevState.currentTrackIndex >= 0 ? prevState.queue[prevState.currentTrackIndex] : null;

      let trackChanged = false;
      if (currentTrack?.id !== prevTrack?.id) {
        trackChanged = true;
        this.isLoadingTrack = true;
        this.audio.pause();
        this.audio.currentTime = 0;
        this.resumeAudioContext();
        if (!currentTrack) {
          this.currentLoadId++;
          this.isLoadingTrack = false;
          this.audio.removeAttribute('src');
          this.audio.load();
          this.updateMediaSession(null, false);
          return;
        }
        this._loadTrack(currentTrack, state.isPlaying);
        this.updateMediaSession(currentTrack, state.isPlaying);
        state.addToHistory(currentTrack);

        // Infinite Wave: if playing wave tracks and near end of queue, fetch next batch from Yandex Wave
        if (currentTrack.id.startsWith('vibe_')) {
          const remaining = state.queue.length - 1 - state.currentTrackIndex;
          if (remaining <= 3) {
            const lastTrack = state.queue[state.queue.length - 1];
            const lastId = lastTrack?.filePath?.replace('yandex:', '');
            fetchMoreWaveTracks(lastId).catch(() => {});
          }
        }
      }

      // Play/Pause изменилось
      if (!trackChanged && state.isPlaying !== prevState.isPlaying) {
        if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
          navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';
        }
        if (state.isPlaying && state.currentTrackIndex >= 0) {
          this.resumeAudioContext();
          if (!this.audio.src || this.audio.src === window.location.href) {
            this._loadTrack(currentTrack!, true, true);
            return;
          }
          const playPromise = this.audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(e => {
              if (e.name !== 'AbortError') console.error(e);
            });
          }
        } else {
          this.audio.pause();
        }
      }
      
      // ВАЖНО: не применяем прогресс, если трек только что переключился!
      if (!trackChanged && Math.abs(state.progress - this.audio.currentTime) > 1) {
        if (!isNaN(this.audio.duration) && this.audio.duration > 0) {
          try {
            const targetTime = Math.min(state.progress, Math.max(0, this.audio.duration - 0.2));
            if (targetTime >= 0) {
              this.audio.currentTime = targetTime;
            }
          } catch (e) {
            console.error('Error applying seek time:', e);
          }
        }
      }
    });
  }

  // Открытие диалога выбора аудиофайлов
  public async selectAndLoadFiles() {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Audio',
          extensions: ['mp3', 'flac', 'wav', 'ogg']
        }]
      });

      if (!selected) return;
      
      const filePaths = Array.isArray(selected) ? selected : [selected];
      
      for (const filePath of filePaths) {
        await this.loadAudioFile(filePath);
      }
    } catch (error) {
      console.error("Ошибка при выборе файлов:", error);
    }
  }

  public initEqualizer() {
    // iOS WebKit and Android WebView immediately suspend AudioContext in the background,
    // which completely cuts off audio if createMediaElementSource is connected.
    // Furthermore, on Android WebView, createMediaElementSource has a known Chromium bug
    // that stalls audio buffers after 20-30 seconds.
    // Keep native direct audio element playback on mobile platforms to guarantee 100% reliable background playback!
    if (isMobile) return;
    if (this.audioCtx) return;
    try {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        latencyHint: 'playback'
      });
      this.source = this.audioCtx.createMediaElementSource(this.audio);
      
      // Pre-amp
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 1.0;
      
      let lastNode: AudioNode = this.gainNode;
      this.source.connect(lastNode);
      
      // Create 6 bands
      this.eqFrequencies.forEach((freq, index) => {
        const filter = this.audioCtx!.createBiquadFilter();
        if (index === 0) {
          filter.type = 'lowshelf';
        } else if (index === this.eqFrequencies.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = 1.2;
        }
        
        filter.frequency.value = freq;
        filter.gain.value = 0; // neutral by default
        
        lastNode.connect(filter);
        lastNode = filter;
        this.eqBands.push(filter);
      });

      // Synchronize current bands & preAmp immediately from store
      try {
        const currentBands = usePlayerStore.getState().eqBands;
        const currentPreAmp = usePlayerStore.getState().eqPreAmp;
        if (currentPreAmp) this.setPreAmp(currentPreAmp);
        currentBands.forEach((val, i) => this.setEqBand(i, val));
      } catch {}
      
      // Transparent anti-clipping peak limiter:
      // Soft knee and 200ms release completely eliminate bass cycle harmonic distortion ("скрипы")
      const antiClipLimiter = this.audioCtx.createDynamicsCompressor();
      antiClipLimiter.threshold.value = -1.0;
      antiClipLimiter.knee.value = 6.0;
      antiClipLimiter.ratio.value = 16.0;
      antiClipLimiter.attack.value = 0.005;
      antiClipLimiter.release.value = 0.20;

      // Dedicated Volume Gain Node (Web Audio API volume control - works across all platforms including iOS WebKit!)
      this.volumeNode = this.audioCtx.createGain();
      const currentVol = usePlayerStore.getState().volume ?? 1;
      this.volumeNode.gain.value = Math.max(0, Math.min(1, Math.pow(currentVol, 2)));

      lastNode.connect(antiClipLimiter);
      antiClipLimiter.connect(this.volumeNode);
      this.volumeNode.connect(this.audioCtx.destination);
    } catch (e) {
      console.error('Equalizer initialization failed:', e);
    }
  }

  public applyVolume(volume: number) {
    const curved = Math.max(0, Math.min(1, Math.pow(volume, 2)));
    try {
      this.audio.volume = curved;
    } catch {}
    if (this.volumeNode) {
      if (this.audioCtx && this.audioCtx.state === 'running') {
        this.volumeNode.gain.setTargetAtTime(curved, this.audioCtx.currentTime, 0.02);
      } else {
        this.volumeNode.gain.value = curved;
      }
    }
  }

  public setEqBand(index: number, gainDb: number) {
    if (this.eqBands[index]) {
      if (this.audioCtx && this.audioCtx.state === 'running') {
        this.eqBands[index].gain.setTargetAtTime(gainDb, this.audioCtx.currentTime, 0.03);
      } else {
        this.eqBands[index].gain.value = gainDb;
      }
    }
  }

  public setPreAmp(gainDb: number) {
    if (this.gainNode) {
      const multiplier = Math.pow(10, gainDb / 20);
      if (this.audioCtx && this.audioCtx.state === 'running') {
        this.gainNode.gain.setTargetAtTime(multiplier, this.audioCtx.currentTime, 0.03);
      } else {
        this.gainNode.gain.value = multiplier;
      }
    }
  }

  public resumeAudioContext() {
    if (!isMobile && this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // Чтение метаданных и добавление в очередь
  public async parseLocalTrack(filePath: string): Promise<Track> {
    const normalizedPath = filePath.replace(/\\/g, '/');
    let title = normalizedPath.split('/').pop()?.replace(/\.[^/.]+$/, "") || 'Unknown Title';
    let artist = 'Unknown Artist';
    let album = 'Unknown Album';
    let duration = 0;
    let coverUrl = '';

    try {
      const fileData = await readFile(filePath);
      const metadata = await mm.parseBuffer(fileData);
      
      title = metadata?.common?.title || title;
      artist = metadata?.common?.artist || artist;
      album = metadata?.common?.album || album;
      duration = metadata?.format?.duration || 0;
      
      if (metadata.common.picture && metadata.common.picture.length > 0) {
        try {
          const picture = metadata.common.picture[0];
          const format = picture.format || 'image/jpeg';
          
          let base64 = "";
          if (typeof window !== 'undefined' && window.Buffer) {
            base64 = window.Buffer.from(picture.data).toString('base64');
          } else {
            const uint8Array = new Uint8Array(picture.data);
            let binary = '';
            for (let i = 0; i < uint8Array.byteLength; i++) {
              binary += String.fromCharCode(uint8Array[i]);
            }
            base64 = btoa(binary);
          }
          
          coverUrl = `data:${format};base64,${base64}`;
        } catch (e) {
          console.error("Cover extraction failed", e);
        }
      }
    } catch (e) {
      console.warn("Failed to parse metadata for", filePath, e);
    }

    if (!coverUrl && title !== 'Unknown Title') {
      try {
        const searchQuery = artist !== 'Unknown Artist' ? `${artist} ${title}` : title;
        const query = encodeURIComponent(searchQuery);
        const response = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`);
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          coverUrl = data.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
        }
      } catch (e) {
        console.error("iTunes API error", e);
      }
    }

    return {
      id: await this.generateId(filePath),
      title,
      artist,
      album,
      duration,
      filePath: convertFileSrc(normalizedPath),
      originalCoverUrl: coverUrl,
      customCoverPath: ''
    };
  }

  private async loadAudioFile(filePath: string) {
    try {
      let metadata: mm.IAudioMetadata | null = null;
      let originalCoverUrl: string | null = null;
      let title = filePath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, "") || 'Unknown Title';
      let artist = 'Unknown Artist';
      let album = 'Unknown Album';
      let duration = 0;
      let genre = undefined;

      try {
        const fileData = await readFile(filePath);
        metadata = await mm.parseBuffer(fileData);
        
        title = metadata?.common?.title || title;
        artist = metadata?.common?.artist || artist;
        album = metadata?.common?.album || album;
        duration = metadata?.format?.duration || 0;
        genre = metadata?.common?.genre ? metadata.common.genre[0] : undefined;
        
        if (metadata.common.picture && metadata.common.picture.length > 0) {
          try {
            const picture = metadata.common.picture[0];
            const format = picture.format || 'image/jpeg';
            
            let base64 = "";
            if (typeof window !== 'undefined' && window.Buffer) {
              base64 = window.Buffer.from(picture.data).toString('base64');
            } else {
              const uint8Array = new Uint8Array(picture.data);
              let binary = '';
              for (let i = 0; i < uint8Array.byteLength; i++) {
                binary += String.fromCharCode(uint8Array[i]);
              }
              base64 = btoa(binary);
            }
            
            originalCoverUrl = `data:${format};base64,${base64}`;
          } catch (e) {
            console.error("Cover extraction failed", e);
          }
        }
      } catch (err) {
        console.warn('Не удалось прочитать метаданные для', filePath, err);
      }

      // Если нет локальной обложки, пробуем получить из iTunes API
      if (!originalCoverUrl && title !== 'Unknown Title') {
        try {
          const searchQuery = artist !== 'Unknown Artist' ? `${artist} ${title}` : title;
          const query = encodeURIComponent(searchQuery);
          
          const res = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=1`);
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            originalCoverUrl = data.results[0].artworkUrl100.replace('100x100bb', '500x500bb');
            
            if (artist === 'Unknown Artist') artist = data.results[0].artistName;
            if (title === filePath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, "")) title = data.results[0].trackName;
            if (album === 'Unknown Album') album = data.results[0].collectionName;
          }
        } catch (e) {
          console.warn('Не удалось загрузить обложку из iTunes', e);
        }
      }

      if (duration === 0) {
         duration = await new Promise((resolve) => {
           const tempAudio = new Audio(convertFileSrc(filePath));
           tempAudio.addEventListener('loadedmetadata', () => resolve(tempAudio.duration));
           tempAudio.addEventListener('error', () => resolve(0));
         });
      }

      const track: Track = {
        id: await this.generateId(filePath),
        filePath: filePath,
        title,
        artist,
        album,
        duration,
        genre,
        originalCoverUrl,
        customCoverPath: null
      };

      usePlayerStore.getState().addTrack(track);
    } catch (error) {
      console.error(`Ошибка при загрузке трека ${filePath}:`, error);
    }
  }

  // Генерация ID на основе пути
  private async generateId(path: string): Promise<string> {
    let hash = 0;
    for (let i = 0; i < path.length; i++) {
      const char = path.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  // Выбор и сохранение кастомной обложки
  public async setCustomCover(trackId: string) {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Images',
          extensions: ['jpg', 'jpeg', 'png', 'gif']
        }]
      });

      if (!selected) return;
      const actualPath = Array.isArray(selected) ? selected[0] : selected;

      const imageData = await readFile(actualPath);
      
      const appDataDirPath = await appDataDir();
      const coversDirPath = await join(appDataDirPath, 'covers');
      
      try {
        await mkdir(coversDirPath, { recursive: true });
      } catch (e) {
        // Игнорируем ошибку, если папка уже существует
      }

      const ext = actualPath.split('.').pop()?.toLowerCase() || 'jpg';
      const newCoverFileName = `cover_${trackId}.${ext}`;
      const newCoverPath = await join(coversDirPath, newCoverFileName);

      // Write file to local disk for persistence
      try {
        await writeFile(newCoverPath, imageData);
      } catch (e) {
        console.warn('Failed to write cover to disk:', e);
      }

      // Convert to Base64 Data URL for instant, reliable display across all platforms (no 403 / question mark icon)
      let dataUrl = '';
      try {
        const uint8Array = new Uint8Array(imageData);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, Array.from(uint8Array.subarray(i, i + chunkSize)));
        }
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                     ext === 'png' ? 'image/png' :
                     ext === 'gif' ? 'image/gif' :
                     ext === 'webp' ? 'image/webp' : 'image/jpeg';
        dataUrl = `data:${mime};base64,${btoa(binary)}`;
      } catch (convErr) {
        dataUrl = convertFileSrc(newCoverPath);
      }

      usePlayerStore.getState().setCustomCover(trackId, dataUrl);
      
      try {
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        
        const blob = new Blob([imageData], { type: `image/${ext}` });
        formData.append('fileToUpload', blob, newCoverFileName);
        
        const response = await fetch('https://catbox.moe/user/api.php', {
          method: 'POST',
          body: formData
        });
        
        const publicUrl = await response.text();
        if (publicUrl.startsWith('http')) {
          usePlayerStore.getState().setCustomCover(trackId, publicUrl);
        }
      } catch (uploadError) {
        console.warn('Не удалось загрузить обложку для Discord RPC:', uploadError);
      }
      
      const currentTrack = usePlayerStore.getState().queue[usePlayerStore.getState().currentTrackIndex];
      if (currentTrack && currentTrack.id === trackId) {
        this.updateMediaSession(currentTrack, usePlayerStore.getState().isPlaying);
      }
    } catch (error) {
      console.error("Ошибка при установке кастомной обложки:", error);
    }
  }

  private async _loadTrack(track: Track, play: boolean, isResume: boolean = false) {
    // Increment load generation ID for concurrency/race condition protection
    const loadId = ++this.currentLoadId;
    this.isLoadingTrack = true;

    // Stop, clear and unload old audio immediately so it cannot bleed through
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio.removeAttribute('src');
    this.audio.load();

    let isYandex = track.filePath.startsWith('yandex:');
    let trackId = '';
    
    if (isYandex) {
      trackId = track.filePath.substring(7);
    } else if (track.album === 'Yandex Music' && track.filePath.startsWith('blob:')) {
      isYandex = true;
      trackId = track.id.startsWith('ya_') ? track.id.substring(3) : track.id;
    }

    // Check if track is already cached locally (for offline playback or deleted local file)
    let cachedLocalPath = track.cachedFilePath;
    if (!cachedLocalPath) {
      const cacheInfo = useCacheStore.getState().cachedTracks[track.id];
      if (cacheInfo?.cachedPath) {
        cachedLocalPath = cacheInfo.cachedPath;
      } else {
        try {
          const diskPath = await invoke<string | null>('get_cached_track_path', { trackId: track.id });
          if (diskPath) {
            cachedLocalPath = diskPath;
          }
        } catch {}
      }
    }

    if (cachedLocalPath) {
      if (loadId !== this.currentLoadId) return;
      if (isMobile) {
        try {
          const fileData = await readFile(cachedLocalPath);
          const blob = new Blob([fileData], { type: 'audio/mpeg' });
          this.audio.src = URL.createObjectURL(blob);
        } catch {
          this.audio.src = convertFileSrc(cachedLocalPath);
        }
      } else {
        this.audio.src = convertFileSrc(cachedLocalPath);
      }
    } else if (isYandex) {
      try {
        const yaToken = localStorage.getItem('yandex_access_token');
        let audioUrl: string | null = null;

        if (yaToken) {
          try {
            audioUrl = await invoke<string>('get_yandex_stream', { 
              trackId, token: yaToken 
            });
          } catch (yaErr: any) {
            console.warn('[AudioService] Yandex stream unavailable/preview-only, fetching full stream fallback:', yaErr);
          }
        }

        // If Yandex gave no full stream (no Plus, preview_only, or unauthorized), seamlessly fallback to full audio stream
        if (!audioUrl) {
          const query = `${track.artist} - ${track.title}`;
          const cleanTrackId = (track.id || `${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
          audioUrl = await invoke<string>('get_full_audio_stream', { query, trackId: cleanTrackId });
        }

        // Race condition check: If a newer track load started while waiting, abort!
        if (loadId !== this.currentLoadId) {
          return;
        }

        // Verify current track in store is still this track
        const currentStoreTrack = usePlayerStore.getState().queue[usePlayerStore.getState().currentTrackIndex];
        if (!currentStoreTrack || currentStoreTrack.id !== track.id) {
          return;
        }
        
        if (audioUrl.startsWith('local:')) {
          const actualPath = audioUrl.substring(6);
          if (isMobile) {
            try {
              const fileData = await readFile(actualPath);
              const blob = new Blob([fileData], { type: 'audio/mpeg' });
              this.audio.src = URL.createObjectURL(blob);
            } catch {
              this.audio.src = convertFileSrc(actualPath);
            }
          } else {
            this.audio.src = convertFileSrc(actualPath);
          }
        } else {
          this.audio.src = audioUrl;
        }
        const timestamp = new Date().toISOString();
        if (yaToken) {
          invoke('yandex_api_post', {
            url: 'https://api.music.yandex.net/play-audio',
            token: yaToken,
            body: `track-id=${trackId}&from=desktop_win-home-playlist_of_the_day-playlist-default&play-id=${Date.now()}&uid=0&timestamp=${encodeURIComponent(timestamp)}&total-played-seconds=120`
          }).catch(() => {});
        }
      } catch (err) {
        if (loadId === this.currentLoadId) {
          this.isLoadingTrack = false;
          console.error("Failed to load yandex stream", err);
        }
        return;
      }
    } else if (track.filePath.startsWith('http') || track.filePath.startsWith('blob:')) {
      if (loadId !== this.currentLoadId) return;
      this.audio.src = track.filePath;
    } else {
      if (loadId !== this.currentLoadId) return;
      if (isMobile) {
        try {
          const fileData = await readFile(track.filePath);
          const blob = new Blob([fileData], { type: 'audio/mpeg' });
          this.audio.src = URL.createObjectURL(blob);
        } catch {
          this.audio.src = convertFileSrc(track.filePath);
        }
      } else {
        this.audio.src = convertFileSrc(track.filePath);
      }
    }
    
    // Final check before playback
    if (loadId !== this.currentLoadId) return;
    const currentStoreTrack = usePlayerStore.getState().queue[usePlayerStore.getState().currentTrackIndex];
    if (!currentStoreTrack || currentStoreTrack.id !== track.id) {
      return;
    }

    this.isLoadingTrack = false;

    if (!play || isResume) {
      const progress = usePlayerStore.getState().progress || 0;
      const onCanPlay = () => {
        if (loadId === this.currentLoadId) {
          this.audio.currentTime = progress;
        }
        this.audio.removeEventListener('loadedmetadata', onCanPlay);
      };
      this.audio.addEventListener('loadedmetadata', onCanPlay);
    } else {
      this.audio.currentTime = 0;
    }
    
    const shouldPlay = usePlayerStore.getState().isPlaying;
    if (shouldPlay && loadId === this.currentLoadId) {
      this.resumeAudioContext();
      const playPromise = this.audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          if (e.name !== 'AbortError') console.error(e);
        });
      }
    }
    this.updateMediaSession(track, shouldPlay);
  }

  public updateMediaSession(track: Track | null, isPlaying: boolean = true) {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    if (!track) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    const rawCover = track.customCoverPath || track.originalCoverUrl || '';
    const artworks: MediaImage[] = [];

    if (rawCover) {
      // Ensure absolute URL or data URL
      const finalSrc = rawCover.startsWith('/') && !rawCover.startsWith('//')
        ? window.location.origin + rawCover
        : rawCover;

      artworks.push(
        { src: finalSrc, sizes: '96x96', type: 'image/png' },
        { src: finalSrc, sizes: '128x128', type: 'image/png' },
        { src: finalSrc, sizes: '192x192', type: 'image/png' },
        { src: finalSrc, sizes: '256x256', type: 'image/png' },
        { src: finalSrc, sizes: '384x384', type: 'image/png' },
        { src: finalSrc, sizes: '512x512', type: 'image/png' }
      );
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Unknown Title',
        artist: track.artist || 'Unknown Artist',
        album: track.album || 'Aura',
        artwork: artworks
      });
    } catch (e) {
      console.warn('Failed to update MediaMetadata:', e);
    }

    this.updateMediaSessionPosition();
  }

  public updateMediaSessionPosition() {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;
    if ('setPositionState' in navigator.mediaSession && !isNaN(this.audio.duration) && this.audio.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: this.audio.duration,
          playbackRate: this.audio.playbackRate || 1.0,
          position: Math.min(Math.max(0, this.audio.currentTime), this.audio.duration)
        });
      } catch (e) {
        // Ignored during seek / track transitions
      }
    }
  }
}

export const audioService = new AudioService();
