import { open } from '@tauri-apps/plugin-dialog';
import { readFile, mkdir } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import * as mm from 'music-metadata-browser';
import { usePlayerStore } from '../store/usePlayerStore';
import { useCacheStore } from '../store/useCacheStore';
import { Track } from '../types';
import { fetchMoreWaveTracks } from './WaveRecommendationService';

export class AudioService {
  private audio: HTMLAudioElement;
  private currentLoadId: number = 0;

  // Equalizer
  private audioCtx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private eqBands: BiquadFilterNode[] = [];
  public eqFrequencies = [60, 150, 400, 1000, 2400, 15000];

  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous'; // Now works because we download streams locally!
    
    // Инициализируем громкость с учетом кривой
    this.audio.volume = Math.pow(usePlayerStore.getState().volume, 2);
    
    // Подписываемся на события аудио
    this.audio.addEventListener('timeupdate', () => {
      usePlayerStore.getState().setProgress(this.audio.currentTime);
    });

    this.audio.addEventListener('seeked', () => {
      const state = usePlayerStore.getState();
      if (state.isPlaying && this.audio.paused) {
        this.resumeAudioContext();
        const playPromise = this.audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            if (e.name !== 'AbortError') console.error('Auto-resume after seek error:', e);
          });
        }
      }
    });

    this.audio.addEventListener('stalled', () => {
      const state = usePlayerStore.getState();
      if (state.isPlaying && this.audio.paused && this.audio.readyState >= 2) {
        this.resumeAudioContext();
        this.audio.play().catch(() => {});
      }
    });

    this.audio.addEventListener('error', () => {
      console.warn('Audio element error:', this.audio.error);
    });
    
    this.audio.addEventListener('ended', () => {
      // Защита от ложных срабатываний ended при сбросе src или во время переключения
      if (!this.audio.src || this.audio.src === window.location.href) return;
      if (isNaN(this.audio.duration) || this.audio.duration <= 0) return;
      if (Math.abs(this.audio.currentTime - this.audio.duration) > 2) return;

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
        this.audio.volume = Math.pow(state.volume, 2);
      }
      
      // Sync EQ
      const hasCustomEq = state.eqBands.some(val => val !== 0) || state.eqPreAmp !== 0;
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
        if (hasCustomEq) {
          this.initEqualizer();
          this.resumeAudioContext();
        }
        if (!currentTrack) {
          this.currentLoadId++;
          this.audio.pause();
          this.audio.src = '';
          return;
        }
        this._loadTrack(currentTrack, state.isPlaying);
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
        if (state.isPlaying && state.currentTrackIndex >= 0) {
          if (!this.audio.src || this.audio.src === window.location.href) {
            if (hasCustomEq) {
              this.initEqualizer();
              this.resumeAudioContext();
            }
            this._loadTrack(currentTrack!, true, true);
            return;
          }
          this.resumeAudioContext();
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
      
      // Громкость изменилась
      if (state.volume !== prevState.volume) {
        this.audio.volume = Math.pow(state.volume, 2);
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

      lastNode.connect(antiClipLimiter);
      antiClipLimiter.connect(this.audioCtx.destination);
    } catch (e) {
      console.error('Equalizer initialization failed:', e);
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
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
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

      const ext = actualPath.split('.').pop();
      const newCoverFileName = `cover_${trackId}.${ext}`;
      const newCoverPath = await join(coversDirPath, newCoverFileName);

      const assetUrl = convertFileSrc(newCoverPath);
      usePlayerStore.getState().setCustomCover(trackId, assetUrl);
      
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
      
    } catch (error) {
      console.error("Ошибка при установке кастомной обложки:", error);
    }
  }

  private async _loadTrack(track: Track, play: boolean, isResume: boolean = false) {
    // Increment load generation ID for concurrency/race condition protection
    const loadId = ++this.currentLoadId;

    // Stop and pause immediately
    this.audio.pause();

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
      this.audio.src = convertFileSrc(cachedLocalPath);
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
          this.audio.src = convertFileSrc(actualPath);
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
          console.error("Failed to load yandex stream", err);
        }
        return;
      }
    } else if (track.filePath.startsWith('http') || track.filePath.startsWith('blob:')) {
      if (loadId !== this.currentLoadId) return;
      this.audio.src = track.filePath;
    } else {
      if (loadId !== this.currentLoadId) return;
      this.audio.src = convertFileSrc(track.filePath);
    }
    
    // Final check before playback
    if (loadId !== this.currentLoadId) return;
    const currentStoreTrack = usePlayerStore.getState().queue[usePlayerStore.getState().currentTrackIndex];
    if (!currentStoreTrack || currentStoreTrack.id !== track.id) {
      return;
    }

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
  }
}

export const audioService = new AudioService();
