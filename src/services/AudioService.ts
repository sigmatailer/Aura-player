import { open } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile, mkdir } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import * as mm from 'music-metadata-browser';
import { usePlayerStore } from '../store/usePlayerStore';
import { useCacheStore } from '../store/useCacheStore';
import { Track } from '../types';
import { fetchMoreWaveTracks } from './WaveRecommendationService';
import { waveAnalyticsService } from './WaveAnalyticsService';
import { pocketBaseService } from './PocketBaseService';

export const isIOS = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
  /iPhone|iPad|iPod/i.test(navigator.platform || '')
);
export const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
export const isMobile = isIOS || isAndroid || (typeof navigator !== 'undefined' && /Mobi|Tablet|iPad|iPhone|Android/i.test(navigator.userAgent));

export class AudioService {
  private audio: HTMLAudioElement;
  private currentLoadId: number = 0;
  private isLoadingTrack: boolean = false;
  private isFallingBack: boolean = false;

  // Equalizer & Audio Graph
  private audioCtx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private volumeNode: GainNode | null = null;
  private eqBands: BiquadFilterNode[] = [];
  public eqFrequencies = [60, 150, 400, 1000, 2400, 15000];

  constructor() {
    this.audio = new Audio();
    this.audio.setAttribute('playsinline', 'true');
    this.audio.setAttribute('webkit-playsinline', 'true');
    (this.audio as any).playsInline = true;
    this.audio.removeAttribute('crossorigin');
    this.audio.crossOrigin = null;

    if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
      try {
        (navigator as any).audioSession.type = 'playback';
      } catch (e) {}
    }

    // Mobile user-gesture unlock for AudioContext
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
      };
      window.addEventListener('touchstart', unlockAudio, { passive: true });
      window.addEventListener('touchend', unlockAudio, { passive: true });
      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
    }
    
    // Инициализируем громкость с учетом кривой
    this.applyVolume(usePlayerStore.getState().volume ?? 1);
    
    // Подписываемся на события аудио
    this.audio.addEventListener('timeupdate', () => {
      usePlayerStore.getState().setProgress(this.audio.currentTime);
      const curSec = Math.floor(this.audio.currentTime);
      if (curSec % 4 === 0) {
        this.updateMediaSessionPosition();
      }
      if (curSec > 0 && curSec % 10 === 0) {
        const curTrack = usePlayerStore.getState().queue[usePlayerStore.getState().currentTrackIndex];
        if (curTrack) {
          pocketBaseService.updateDevicePresence(curTrack, this.audio.currentTime, true);
        }
      }
    });

    this.audio.addEventListener('play', () => {
      if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      const curTrack = usePlayerStore.getState().queue[usePlayerStore.getState().currentTrackIndex];
      if (curTrack) {
        pocketBaseService.updateDevicePresence(curTrack, this.audio.currentTime, true);
      }
    });

    this.audio.addEventListener('pause', () => {
      if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      const curTrack = usePlayerStore.getState().queue[usePlayerStore.getState().currentTrackIndex];
      if (curTrack) {
        pocketBaseService.updateDevicePresence(curTrack, this.audio.currentTime, false);
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
          usePlayerStore.getState().setIsPlaying(true);
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          usePlayerStore.getState().setIsPlaying(false);
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

    // Global listener for Android native media notification actions
    if (typeof window !== 'undefined') {
      (window as any).__AURA_ON_MEDIA_ACTION__ = (action: string, val?: number) => {
        const store = usePlayerStore.getState();
        if (action === 'play_pause') {
          store.togglePlayPause();
        } else if (action === 'next') {
          store.nextTrack(false);
        } else if (action === 'prev') {
          store.prevTrack();
        } else if (action === 'repeat') {
          store.toggleRepeat();
        } else if (action === 'seek' && typeof val === 'number') {
          store.setProgress(val);
        }
      };
    }

    this.audio.addEventListener('stalled', () => {
      const state = usePlayerStore.getState();
      if (!this.isLoadingTrack && state.isPlaying && this.audio.paused && this.audio.src && this.audio.readyState >= 2) {
        this.resumeAudioContext();
        this.audio.play().catch(() => {});
      }
    });

    this.audio.addEventListener('loadedmetadata', () => {
      const dur = this.audio.duration;
      const state = usePlayerStore.getState();
      const currentTrack = state.currentTrackIndex >= 0 ? state.queue[state.currentTrackIndex] : null;

      // Intercept 29-30s preview tracks (when song is supposed to be full track)
      if (!this.isLoadingTrack && !this.isFallingBack && dur > 0 && dur <= 35 && currentTrack && (currentTrack.duration > 45 || !currentTrack.duration || currentTrack.filePath.startsWith('yandex:'))) {
        console.warn(`[AudioService] Detected 29-30s preview (${dur.toFixed(1)}s vs expected ${currentTrack.duration}s). Automatically replacing with full track...`);
        this.handlePreviewFallback(currentTrack);
      }
    });

    this.audio.addEventListener('error', async () => {
      console.warn('Audio element error:', this.audio.error);
      // If error happened with crossOrigin, retry without crossOrigin first
      if (this.audio.crossOrigin) {
        console.warn('[AudioService] Retrying audio load without crossOrigin...');
        this.audio.crossOrigin = null;
        const currentSrc = this.audio.src;
        if (currentSrc && currentSrc !== window.location.href) {
          this.audio.src = currentSrc;
          this.audio.load();
          this.audio.play().catch(() => {});
          return;
        }
      }

      const state = usePlayerStore.getState();
      const currentTrack = state.currentTrackIndex >= 0 ? state.queue[state.currentTrackIndex] : null;
      if (currentTrack && !this.isLoadingTrack && !this.isFallingBack) {
        console.warn('[AudioService] Playback error encountered, falling back to full audio stream for:', currentTrack.title);
        await this.handlePreviewFallback(currentTrack);
      }
    });
    
    this.audio.addEventListener('ended', async () => {
      // Защита от ложных срабатываний ended при сбросе src или во время переключения
      if (this.isLoadingTrack) return;
      if (!this.audio.src || this.audio.src === window.location.href) return;
      if (isNaN(this.audio.duration) || this.audio.duration <= 0) return;
      if (Math.abs(this.audio.currentTime - this.audio.duration) > 2) return;

      const state = usePlayerStore.getState();
      const currentTrack = state.currentTrackIndex >= 0 ? state.queue[state.currentTrackIndex] : null;

      // PREVENT PREMATURE SKIP ON 29-30 SECOND PREVIEWS!
      if (this.audio.duration > 0 && this.audio.duration <= 35 && currentTrack && (currentTrack.duration > 45 || !currentTrack.duration)) {
        console.warn('[AudioService] Track ended at preview length (<35s). Attempting full stream fallback instead of skipping...');
        const recovered = await this.handlePreviewFallback(currentTrack);
        if (recovered) {
          return;
        }
      }

      if (currentTrack) {
        waveAnalyticsService.logTrackEvent({
          track: currentTrack,
          listenedSeconds: this.audio.currentTime,
          totalDuration: this.audio.duration || currentTrack.duration,
          isSkipped: false,
          isCompleted: true
        });
      }

      // Immediately pause old track to prevent any audio bleed
      this.audio.pause();

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

      // Sync Repeat Mode change to native Android notification & MediaSession
      if (state.repeatMode !== prevState.repeatMode) {
        const curTrack = state.currentTrackIndex >= 0 ? state.queue[state.currentTrackIndex] : null;
        if (curTrack) {
          this.updateMediaSession(curTrack, state.isPlaying);
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
        if (prevTrack) {
          const listened = prevState.progress || 0;
          const dur = prevTrack.duration || 0;
          const isCompleted = dur > 5 && listened >= dur * 0.75;
          const isSkipped = !isCompleted && listened < 25;
          waveAnalyticsService.logTrackEvent({
            track: prevTrack,
            listenedSeconds: listened,
            totalDuration: dur,
            isSkipped,
            isCompleted
          });
        }

        if (!currentTrack) {
          this.currentLoadId++;
          this.isLoadingTrack = false;
          this.audio.removeAttribute('src');
          this.audio.load();
          this.updateMediaSession(null, false);
          pocketBaseService.updateDevicePresence(null, 0, false);
          return;
        }
        this._loadTrack(currentTrack, state.isPlaying);
        this.updateMediaSession(currentTrack, state.isPlaying);
        state.addToHistory(currentTrack);
        pocketBaseService.updateDevicePresence(currentTrack, 0, state.isPlaying);

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
    // CRITICAL iOS FIX: On iOS WebKit, routing an HTMLAudioElement through AudioContext
    // (createMediaElementSource) causes the entire audio pipeline to freeze when the screen locks or app backgrounds,
    // because iOS suspends Web Audio rendering threads. We use the direct native media pipeline on iOS.
    if (isIOS) return;

    if (this.audioCtx) {
      this.resumeAudioContext();
      return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.audioCtx = new AudioCtx({
        latencyHint: 'playback'
      });
      this.resumeAudioContext();
      this.source = this.audioCtx.createMediaElementSource(this.audio);
      
      // CRITICAL FIX: The audio element must pass unity gain (1.0) into Web Audio,
      // so volume is NOT multiplied twice (audio.volume * volumeNode.gain)!
      try {
        this.audio.volume = 1.0;
      } catch {}

      // Pre-amp node
      this.gainNode = this.audioCtx.createGain();
      const currentPreAmp = usePlayerStore.getState().eqPreAmp || 0;
      this.gainNode.gain.value = Math.pow(10, currentPreAmp / 20);
      
      let lastNode: AudioNode = this.gainNode;
      this.source.connect(lastNode);
      
      // Create 6 bands with musical Q for punchy, audible sound shaping
      this.eqBands = [];
      const currentBands = usePlayerStore.getState().eqBands || [0, 0, 0, 0, 0, 0];
      this.eqFrequencies.forEach((freq, index) => {
        const filter = this.audioCtx!.createBiquadFilter();
        if (index === 0) {
          filter.type = 'lowshelf';
        } else if (index === this.eqFrequencies.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = 1.0; // Musical curve to eliminate dead gaps between bands
        }
        
        filter.frequency.value = freq;
        filter.gain.value = currentBands[index] || 0;
        
        lastNode.connect(filter);
        lastNode = filter;
        this.eqBands.push(filter);
      });

      // 1. Dedicated Master Volume Gain Node (Linear volume matching standard media players)
      this.volumeNode = this.audioCtx.createGain();
      const currentVol = usePlayerStore.getState().volume ?? 1;
      const volumeGain = Math.max(0, Math.min(1, currentVol));
      this.volumeNode.gain.value = volumeGain;

      // 2. Final transparent peak safety limiter at final output (protects DAC/speakers from clipping without squashing quiet music)
      const antiClipLimiter = this.audioCtx.createDynamicsCompressor();
      antiClipLimiter.threshold.value = -0.3; // Only acts on actual digital 0dBFS peaks
      antiClipLimiter.knee.value = 1.0;
      antiClipLimiter.ratio.value = 20.0;
      antiClipLimiter.attack.value = 0.001;   // 1ms peak catch
      antiClipLimiter.release.value = 0.04;   // 40ms fast transparent release

      lastNode.connect(this.volumeNode);
      this.volumeNode.connect(antiClipLimiter);
      antiClipLimiter.connect(this.audioCtx.destination);
    } catch (e) {
      console.error('Equalizer initialization failed:', e);
    }
  }

  public applyVolume(volume: number) {
    const volumeGain = Math.max(0, Math.min(1, volume));
    if (this.volumeNode && this.audioCtx) {
      // AudioContext active: pass unity gain from audio element, let volumeNode control volume linearly
      try {
        this.audio.volume = 1.0;
      } catch {}
      if (this.audioCtx.state === 'running') {
        this.volumeNode.gain.setValueAtTime(volumeGain, this.audioCtx.currentTime);
      } else {
        this.volumeNode.gain.value = volumeGain;
      }
    } else {
      // AudioContext not active yet: audio element controls volume directly
      try {
        this.audio.volume = volumeGain;
      } catch {}
    }
  }

  public setEqBand(index: number, gainDb: number) {
    if (isIOS) return;
    if (!this.audioCtx) {
      this.initEqualizer();
    }
    this.resumeAudioContext();
    if (this.eqBands[index]) {
      this.eqBands[index].gain.value = gainDb;
    }
  }

  public setPreAmp(gainDb: number) {
    if (isIOS) return;
    if (!this.audioCtx) {
      this.initEqualizer();
    }
    this.resumeAudioContext();
    if (this.gainNode) {
      const multiplier = Math.pow(10, gainDb / 20);
      this.gainNode.gain.value = multiplier;
    }
  }

  public stop() {
    this.currentLoadId++;
    try {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.src = '';
    } catch {}
    this.updateMediaSession(null, false);
    pocketBaseService.updateDevicePresence(null, 0, false);
  }

  public resumeAudioContext() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
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

  private async handlePreviewFallback(currentTrack: Track): Promise<boolean> {
    if (this.isFallingBack) return false;
    this.isFallingBack = true;
    try {
      console.warn(`[AudioService] Handling full audio fallback for: ${currentTrack.artist} - ${currentTrack.title}`);
      const query = `${currentTrack.artist} - ${currentTrack.title}`;
      const cleanTrackId = (currentTrack.id || `${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      const fallbackUrl = await invoke<string>('get_full_audio_stream', { query, trackId: cleanTrackId });
      
      const state = usePlayerStore.getState();
      const activeTrack = state.currentTrackIndex >= 0 ? state.queue[state.currentTrackIndex] : null;
      if (!activeTrack || activeTrack.id !== currentTrack.id) {
        this.isFallingBack = false;
        return false;
      }

      const wasPlaying = state.isPlaying;
      const curTime = (this.audio.currentTime > 0 && this.audio.currentTime < 32) ? this.audio.currentTime : 0;

      this.audio.removeAttribute('crossorigin');
      this.audio.crossOrigin = null;

      if (fallbackUrl.startsWith('local:')) {
        const actualPath = fallbackUrl.substring(6);
        if (!isIOS && isMobile) {
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
        this.audio.src = fallbackUrl;
      }

      if (curTime > 0) {
        const restoreTime = () => {
          try {
            this.audio.currentTime = curTime;
          } catch {}
          this.audio.removeEventListener('loadedmetadata', restoreTime);
        };
        this.audio.addEventListener('loadedmetadata', restoreTime);
      }

      if (wasPlaying) {
        this.resumeAudioContext();
        this.audio.play().catch(() => {});
      }
      this.isFallingBack = false;
      return true;
    } catch (e) {
      console.warn('[AudioService] Fallback to full stream failed:', e);
      this.isFallingBack = false;
      return false;
    }
  }

  private async _loadTrack(track: Track, play: boolean, isResume: boolean = false) {
    // Increment load generation ID for concurrency/race condition protection
    const loadId = ++this.currentLoadId;
    this.isLoadingTrack = true;

    // Stop old audio without destroying the native media session pipeline on iOS!
    this.audio.pause();
    this.audio.currentTime = 0;
    if (!isIOS) {
      this.audio.removeAttribute('src');
      this.audio.load();
    }

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
      this.audio.removeAttribute('crossorigin');
      this.audio.crossOrigin = null;
      if (!isIOS && isMobile) {
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
        
        this.audio.removeAttribute('crossorigin');
        this.audio.crossOrigin = null;
        if (audioUrl.startsWith('local:')) {
          const actualPath = audioUrl.substring(6);
          if (!isIOS && isMobile) {
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
      this.audio.removeAttribute('crossorigin');
      this.audio.crossOrigin = null;
      if (!isIOS && isMobile && track.filePath.startsWith('http')) {
        try {
          const bytes = await invoke<number[]>('download_audio_temp', { url: track.filePath });
          const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' });
          this.audio.src = URL.createObjectURL(blob);
        } catch {
          this.audio.src = track.filePath;
        }
      } else {
        this.audio.src = track.filePath;
      }
    } else {
      if (loadId !== this.currentLoadId) return;
      this.audio.removeAttribute('crossorigin');
      this.audio.crossOrigin = null;
      if (!isIOS && isMobile) {
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
      if (typeof window !== 'undefined' && (window as any).AuraAndroidBridge) {
        try { (window as any).AuraAndroidBridge.stopMedia(); } catch (e) {}
      }
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

    // Update native Android notification bridge if running on Android
    if (typeof window !== 'undefined' && (window as any).AuraAndroidBridge) {
      try {
        const repeatMode = usePlayerStore.getState().repeatMode || 'off';
        const dur = this.audio.duration || track.duration || 0;
        const pos = this.audio.currentTime || 0;
        (window as any).AuraAndroidBridge.updateMedia(
          track.title || 'Unknown Title',
          track.artist || 'Unknown Artist',
          rawCover,
          isPlaying,
          dur,
          pos,
          repeatMode
        );
      } catch (e) {
        console.warn('AuraAndroidBridge call error:', e);
      }
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
