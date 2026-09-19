import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePlayerStore } from '../store/usePlayerStore';

export function useDiscordRPC() {
  const currentTrackIndex = usePlayerStore((state) => state.currentTrackIndex);
  const queue = usePlayerStore((state) => state.queue);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const progress = usePlayerStore((state) => state.progress);
  
  const currentTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null;
  
  // Мы сохраняем "состояние" отправленного RPC, чтобы не отправлять одни и те же данные спамом
  const lastSentState = useRef({
    trackId: '',
    isPlaying: false,
    progress: 0,
    coverUrl: '',
  });

  useEffect(() => {
    async function updateRPC() {
      if (!currentTrack) {
        await invoke('clear_discord_rpc');
        return;
      }

      const activeCoverUrl = currentTrack.customCoverPath || currentTrack.originalCoverUrl || '';

      // Проверяем, нужно ли обновлять RPC.
      // Обновляем если сменился трек, статус play/pause, обложка ИЛИ если пользователь
      // перемотал трек (разница между текущим прогрессом и старым больше 3 секунд)
      const isTrackChanged = lastSentState.current.trackId !== currentTrack.id;
      const isPlayStateChanged = lastSentState.current.isPlaying !== isPlaying;
      const isSeeked = Math.abs(lastSentState.current.progress - progress) > 3;
      const isCoverChanged = lastSentState.current.coverUrl !== activeCoverUrl;

      if (!isTrackChanged && !isPlayStateChanged && !isSeeked && !isCoverChanged) {
        return;
      }

      try {
        await invoke('update_discord_rpc', {
          title: currentTrack.title || 'Unknown Title',
          artist: currentTrack.artist || 'Unknown Artist',
          duration: currentTrack.duration || 0,
          progress: progress || 0,
          playing: isPlaying,
          // Discord RPC поддерживает только http/https ссылки. 
          // Локальные пути (asset://) не отобразятся у других пользователей.
          coverUrl: (() => {
            const url = activeCoverUrl;
            return url.startsWith('http') && !url.includes('tauri.localhost') 
              ? url 
              : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400&auto=format&fit=crop';
          })()
        });

        // Запоминаем отправленное состояние
        lastSentState.current = {
          trackId: currentTrack.id,
          isPlaying,
          progress,
          coverUrl: activeCoverUrl,
        };
      } catch (err) {
        console.error('Failed to update Discord RPC:', err);
      }
    }

    updateRPC();
  }, [currentTrack, isPlaying, progress]);
}
