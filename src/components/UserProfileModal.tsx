import React, { useState, useEffect } from 'react';
import { 
  Calendar, Hash, Clock, UserPlus, UserCheck, 
  Check, Send, Globe, Radio, Pin, Play, ShieldCheck,
  Search, Heart, Disc3, Music, X
} from 'lucide-react';
import { useFriendsStore } from '../store/useFriendsStore';
import { useThemeStore, getContrastColor } from '../store/useThemeStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { useAuthStore, CloudUser } from '../store/useAuthStore';
import { pocketBaseService } from '../services/PocketBaseService';
import { Track } from '../types';
import { getNicknameFontFamily, getNicknameFontClass, getNicknameEffectStyle } from '../utils/profileStyles';
import { FriendsListModal, formatFriendsWord } from './FriendsListModal';

// Simple Discord Icon SVG
const DiscordIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

// Helper to convert HEX to RGB
function hexToRgb(hexColor?: string): { r: number; g: number; b: number } {
  if (!hexColor || typeof hexColor !== 'string') return { r: 23, g: 10, b: 14 };
  let hex = hexColor.trim().replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const num = parseInt(hex, 16);
  if (isNaN(num)) return { r: 23, g: 10, b: 14 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

export const UserProfileModal: React.FC = () => {
  const { 
    selectedUser, 
    isProfileModalOpen, 
    closeProfileModal,
    openProfileModal,
    getFriendshipStatus,
    sendFriendRequest,
    acceptFriendRequest,
    removeFriend,
    cancelOutgoingRequest
  } = useFriendsStore();

  const { transparencyEnabled, customWallpaper, windowOpacity, getActiveTheme } = useThemeStore();
  const activeTheme = getActiveTheme ? getActiveTheme() : null;
  const themeAccent = activeTheme?.colors?.accent || 'var(--accent, #6366f1)';
  const themeBgSurface = activeTheme?.colors?.bgSurface || '#170a0e';
  const themeBgMain = activeTheme?.colors?.bgMain || '#0f0608';
  const themeBorderMain = activeTheme?.colors?.borderMain || 'rgba(255, 255, 255, 0.08)';

  const surfaceRgb = hexToRgb(themeBgSurface);
  const mainRgb = hexToRgb(themeBgMain);

  const isSelfPlaying = usePlayerStore(s => s.isPlaying);
  const curTrack = usePlayerStore(s => s.queue[s.currentTrackIndex]);
  const playbackContext = usePlayerStore(s => s.playbackContext);
  const playerHistory = usePlayerStore(s => s.history || []);
  const playContext = usePlayerStore(s => s.playContext);

  const myTotalPlays = useAnalyticsStore(s => s.totalPlays);
  const getMyTotalHours = useAnalyticsStore(s => s.getTotalHoursFormatted);
  const currentAuthUser = useAuthStore(s => s.user);



  // Cloud presence for the selected user
  const [cloudPresence, setCloudPresence] = useState<{
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
  } | null>(null);

  const [friendStats, setFriendStats] = useState<{ plays: number; hours: string } | null>(null);
  const [realOrderNumber, setRealOrderNumber] = useState<number>(selectedUser?.accountNumber || 1);
  const [remoteShowcaseTracks, setRemoteShowcaseTracks] = useState<Track[]>([]);
  const [userFriends, setUserFriends] = useState<CloudUser[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isFriendsListOpen, setIsFriendsListOpen] = useState(false);

  // Close with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isProfileModalOpen) {
        closeProfileModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProfileModalOpen, closeProfileModal]);

  // Fetch presence, real order number and stats when modal opens
  useEffect(() => {
    if (!selectedUser || !isProfileModalOpen) return;
    let isMounted = true;

    // Reset previous modal states
    setFriendStats(null);
    setRemoteShowcaseTracks([]);
    setUserFriends([]);
    setIsLoadingFriends(true);
    if (selectedUser.accountNumber) {
      setRealOrderNumber(selectedUser.accountNumber);
    }
    useFriendsStore.getState().syncWithDatabase().catch(() => {});

    // Fetch real friends of the selected user
    pocketBaseService.getUserFriends(selectedUser.id).then(friends => {
      if (isMounted) {
        setUserFriends(friends);
        setIsLoadingFriends(false);
      }
    }).catch(() => {
      if (isMounted) setIsLoadingFriends(false);
    });

    // Fetch canonical cloud customization analytics
    pocketBaseService.getCloudCustomization(selectedUser.id).then(cloudCustom => {
      if (!isMounted) return;
      if (cloudCustom?.analytics?.totalPlays !== undefined && cloudCustom?.analytics?.totalHoursFormatted !== undefined) {
        setFriendStats({
          plays: cloudCustom.analytics.totalPlays,
          hours: cloudCustom.analytics.totalHoursFormatted
        });
      }
    }).catch(() => {});

    const fetchPresence = () => {
      pocketBaseService.getUserPresence(selectedUser.id).then(res => {
        if (isMounted) {
          setCloudPresence(res);
        }
      }).catch(() => {});
    };

    fetchPresence();
    const presenceInterval = setInterval(fetchPresence, 2500);

    const unsubPromise = pocketBaseService.pb.collection('device_sync').subscribe('*', (e) => {
      if (isMounted && e.record && e.record.user === selectedUser.id) {
        fetchPresence();
      }
    }).catch(() => null);

    pocketBaseService.getUserOrderNumber(selectedUser.created, selectedUser.id).then(num => {
      if (isMounted && num > 0) {
        setRealOrderNumber(num);
      }
    }).catch(() => {});

    // Fetch user listening events from wave_analytics
    pocketBaseService.pb.collection('wave_analytics').getList(1, 50, {
      filter: `user = "${selectedUser.id}" && track_id != "__aura_user_card__"`
    }).then(waRes => {
      if (!isMounted) return;
      if (waRes.totalItems > 0) {
        const sortedItems = [...waRes.items];
        const plays = waRes.totalItems;
        // Total duration calculation with realistic per-track duration
        let batchSec = 0;
        sortedItems.forEach(it => {
          const itemSec = (it.listened_seconds && it.listened_seconds >= 60)
            ? it.listened_seconds
            : (it.total_duration && it.total_duration > 30 ? it.total_duration : 175);
          batchSec += itemSec;
        });
        const avgSec = batchSec / Math.max(1, sortedItems.length);
        const totalEstimatedSec = Math.round(avgSec * plays);
        const calculatedHrs = (Math.max(0.1, totalEstimatedSec / 3600)).toFixed(1).replace('.', ',');
        setFriendStats({ plays, hours: calculatedHrs });

        // Map real tracks for showcase
        const tracks: Track[] = sortedItems.map((it) => {
          const tId = it.track_id || `wa_${it.id}`;
          const isYa = tId.startsWith('ya_');
          const cleanYaId = isYa ? tId.substring(3) : '';
          return {
            id: tId,
            title: it.title || 'Трек',
            artist: it.artist || selectedUser.name || selectedUser.username || 'Артист',
            album: 'Прослушано',
            duration: it.total_duration || (it.listened_seconds > 0 ? it.listened_seconds : 180),
            originalCoverUrl: isYa 
              ? `https://avatars.yandex.net/get-music-content/5643445/7ec47900.a.20875322-1/400x400`
              : (selectedUser.pinnedTrackCover || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=300&auto=format&fit=crop'),
            customCoverPath: null,
            filePath: isYa ? `yandex:${cleanYaId}` : ''
          };
        });
        // De-duplicate tracks by title + artist
        const uniqueMap = new Map<string, Track>();
        for (const t of tracks) {
          const key = `${t.title}::${t.artist}`.toLowerCase();
          if (!uniqueMap.has(key)) {
            uniqueMap.set(key, t);
          }
        }
        setRemoteShowcaseTracks(Array.from(uniqueMap.values()).slice(0, 6));
      }
    }).catch(() => {});

    return () => {
      isMounted = false;
      clearInterval(presenceInterval);
      unsubPromise.then(unsub => {
        if (typeof unsub === 'function') unsub();
      });
    };
  }, [selectedUser?.id, isProfileModalOpen]);

  if (!isProfileModalOpen || !selectedUser) return null;

  const status = getFriendshipStatus(selectedUser.id);
  const isSelf = status === 'self' || (currentAuthUser && selectedUser.id === currentAuthUser.id);
  const rawCardColor = selectedUser.profileColor;
  const cardColor = (rawCardColor && typeof rawCardColor === 'string' && rawCardColor.startsWith('#')) ? rawCardColor : '#ec4899';
  const buttonTextColor = getContrastColor(cardColor);

  // Default banner fallback texture
  const defaultBannerUrl = 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?q=80&w=1200&auto=format&fit=crop';
  const bannerImage = selectedUser.banner || defaultBannerUrl;

  // Format date cleanly without duplicate "г. г."
  const formatDate = (isoString?: string) => {
    if (!isoString) return '1 октября 2026 г.';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '1 октября 2026 г.';
      const str = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      const clean = str.replace(/\s*г\.?$/i, '').trim();
      return `${clean} г.`;
    } catch {
      return '1 октября 2026 г.';
    }
  };

  // Format activity time cleanly without duplicate "г. г."
  const formatActivityTime = (isoString?: string) => {
    if (!isoString) return '27 сентября 2026 г. в 23:18';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '27 сентября 2026 г. в 23:18';
      const str = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      const cleanDate = str.replace(/\s*г\.?$/i, '').trim() + ' г.';
      const timePart = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      return `${cleanDate} в ${timePart}`;
    } catch {
      return '27 сентября 2026 г. в 23:18';
    }
  };

  // Resolve Active Listening Context
  let isListening = false;
  let activeContextTitle = '';
  let activeContextType: 'wave' | 'playlist' | 'collection' | 'search' = 'search';
  let activeContextCover = '';
  let activeTrackTitle = '';
  let activeTrackArtist = '';
  let activeTrackCover = '';

  if (isSelf) {
    isListening = isSelfPlaying;
    const ctx = playbackContext;
    if (ctx) {
      activeContextTitle = ctx.title;
      activeContextType = (ctx.type as any) || 'playlist';
      if (ctx.coverUrl) activeContextCover = ctx.coverUrl;
    } else if (curTrack?.id && String(curTrack.id).startsWith('vibe_')) {
      activeContextTitle = 'Моя волна';
      activeContextType = 'wave';
    } else if (curTrack) {
      activeContextTitle = curTrack.album || 'Плейлист';
      activeContextType = 'playlist';
    }
    if (curTrack) {
      activeTrackTitle = curTrack.title;
      activeTrackArtist = curTrack.artist;
      activeTrackCover = curTrack.customCoverPath || curTrack.originalCoverUrl || activeContextCover;
    }
  } else if (cloudPresence && cloudPresence.isPlaying) {
    isListening = true;
    activeContextTitle = cloudPresence.contextName || (cloudPresence.contextType === 'wave' ? 'Моя волна' : 'Музыка');
    activeContextType = (cloudPresence.contextType as any) || 'search';
    if (cloudPresence.contextCover) activeContextCover = cloudPresence.contextCover;
    if (cloudPresence.trackTitle) activeTrackTitle = cloudPresence.trackTitle;
    if (cloudPresence.trackArtist) activeTrackArtist = cloudPresence.trackArtist;
    if (cloudPresence.coverUrl) activeTrackCover = cloudPresence.coverUrl;
  } else if (selectedUser.activePresence && selectedUser.activePresence.isPlaying) {
    isListening = true;
    activeContextTitle = selectedUser.activePresence.contextName || (selectedUser.activePresence.contextType === 'wave' ? 'Моя волна' : 'Музыка');
    activeContextType = (selectedUser.activePresence.contextType as any) || 'search';
    if (selectedUser.activePresence.contextCover) activeContextCover = selectedUser.activePresence.contextCover;
    if (selectedUser.activePresence.trackTitle) activeTrackTitle = selectedUser.activePresence.trackTitle;
    if (selectedUser.activePresence.trackArtist) activeTrackArtist = selectedUser.activePresence.trackArtist;
    if (selectedUser.activePresence.trackCover) activeTrackCover = selectedUser.activePresence.trackCover;
  }

  // Analytics Stats (real values)
  const totalPlays = isSelf ? myTotalPlays : (friendStats?.plays ?? selectedUser.totalPlays ?? 0);
  const totalHours = isSelf ? getMyTotalHours() : (friendStats?.hours ?? (selectedUser.totalHours ? String(selectedUser.totalHours) : '0,1'));

  const isOnline = isSelf || isListening || (cloudPresence?.lastActive ? (Date.now() - new Date(cloudPresence.lastActive).getTime() < 5 * 60 * 1000) : false) || ((selectedUser as any).lastActive ? (Date.now() - new Date((selectedUser as any).lastActive).getTime() < 5 * 60 * 1000) : false);

  // Pinned Track Data
  const pinnedTrack = {
    id: selectedUser.pinnedTrackId || '',
    title: selectedUser.pinnedTrackTitle || '',
    artist: selectedUser.pinnedTrackArtist || '',
    cover: selectedUser.pinnedTrackCover || ''
  };

  const handlePlayPinnedTrack = () => {
    if (!pinnedTrack.title) return;
    const isYa = pinnedTrack.id && pinnedTrack.id.startsWith('ya_');
    const trackToPlay: Track = {
      id: pinnedTrack.id || 'pinned_track',
      title: pinnedTrack.title,
      artist: pinnedTrack.artist,
      album: 'Закрепленный',
      duration: 185,
      originalCoverUrl: pinnedTrack.cover,
      customCoverPath: null,
      filePath: isYa ? 'yandex:' + pinnedTrack.id.substring(3) : ''
    };
    playContext([trackToPlay], 0, {
      title: activeContextTitle || 'Закрепленный',
      type: (activeContextType === 'search' ? 'playlist' : activeContextType) as any,
      coverUrl: activeContextCover || pinnedTrack.cover
    });
  };

  const handlePlayActiveOrPinnedTrack = () => {
    if (isListening && activeTrackTitle) {
      const isYa = cloudPresence?.trackId ? cloudPresence.trackId.startsWith('ya_') : false;
      const cleanYaId = isYa && cloudPresence?.trackId ? cloudPresence.trackId.substring(3) : '';
      const trackToPlay: Track = {
        id: cloudPresence?.trackId || (curTrack?.id) || `presence_${Date.now()}`,
        title: activeTrackTitle,
        artist: activeTrackArtist || 'Артист',
        album: activeContextTitle || 'Музыка',
        duration: cloudPresence?.duration || (curTrack?.duration) || 180,
        originalCoverUrl: activeTrackCover || null,
        customCoverPath: null,
        filePath: cloudPresence?.filePath || (cleanYaId ? `yandex:${cleanYaId}` : (curTrack?.filePath || ''))
      };
      playContext([trackToPlay], 0, {
        title: activeContextTitle || (activeContextType === 'wave' ? 'Моя волна' : 'Музыка'),
        type: (activeContextType === 'search' ? 'playlist' : activeContextType) as any,
        coverUrl: activeContextCover || activeTrackCover
      });
      return;
    }

    if (pinnedTrack.title) {
      handlePlayPinnedTrack();
    }
  };

  // Showcase tracks computed directly as a pure value without hook overhead
  let showcaseTracks: Track[] = [];
  if (isSelf) {
    showcaseTracks = (playerHistory || []).slice(0, 6);
  } else if (remoteShowcaseTracks.length > 0) {
    showcaseTracks = remoteShowcaseTracks;
  } else if (pinnedTrack.title) {
    const isYa = pinnedTrack.id && pinnedTrack.id.startsWith('ya_');
    showcaseTracks = [{
      id: pinnedTrack.id || 'pinned_track',
      title: pinnedTrack.title,
      artist: pinnedTrack.artist,
      album: 'Закрепленный',
      duration: 180,
      originalCoverUrl: pinnedTrack.cover,
      customCoverPath: null,
      filePath: isYa ? 'yandex:' + pinnedTrack.id.substring(3) : ''
    }];
  }

  const safeGlowShadow = cardColor.startsWith('#') ? `${cardColor}22` : 'rgba(236, 72, 153, 0.15)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-200">
      {/* Backdrop blur (clicking closes the modal) */}
      <div 
        onClick={closeProfileModal}
        className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-pointer transition-opacity"
      />

      {/* Modal Window: 2-column layout */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[830px] rounded-[30px] overflow-hidden border shadow-[0_25px_60px_rgba(0,0,0,0.85)] z-10 flex flex-col md:flex-row max-h-[92vh] overflow-y-auto scrollbar-hide animate-in zoom-in-95 fade-in duration-200"
        style={{
          backgroundColor: transparencyEnabled && customWallpaper
            ? `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, ${Math.max(0.75, (windowOpacity / 100) * 0.92)})`
            : themeBgSurface,
          borderColor: themeBorderMain,
          boxShadow: `0 25px 60px rgba(0,0,0,0.85), 0 0 35px ${safeGlowShadow}`
        }}
      >
        {/* Modal Close Button (top-right) */}
        <button
          onClick={closeProfileModal}
          className="absolute top-4 right-4 z-40 w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-lg active:scale-95"
          title="Закрыть"
        >
          <X size={16} />
        </button>

        {/* ===================== LEFT COLUMN (User's Profile Card with ProfileColor & Dedicated Banner) ===================== */}
        <div 
          className="relative z-10 w-full md:w-[350px] shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-white/[0.08] overflow-hidden"
          style={{
            backgroundColor: '#0c0d12',
          }}
        >
          {/* 1. TOP BANNER */}
          <div className="relative w-full h-[140px] shrink-0 overflow-hidden bg-[#16161f]">
            <img 
              src={bannerImage} 
              alt="Profile Banner" 
              onError={(e) => { (e.target as HTMLImageElement).src = defaultBannerUrl; }}
              className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
            />
            {/* Subtle top/bottom shadow gradients on banner */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/60 pointer-events-none" />
          </div>

          {/* 2. PROFILE BODY */}
          <div className="relative flex-1 flex flex-col justify-between p-5 pt-0">

            {/* Content items in Left Column */}
            <div className="relative z-10 flex flex-col gap-3.5">
              
              {/* Avatar overlapping banner bottom edge (-mt-12) + Status quote */}
              <div className="flex items-end justify-between -mt-12">
                <div 
                  className="w-24 h-24 rounded-full p-[3px] shadow-2xl relative overflow-hidden transition-transform hover:scale-105 bg-[#0f1015] shrink-0"
                  style={{ 
                    boxShadow: `0 0 28px ${cardColor}66, 0 8px 16px rgba(0,0,0,0.6)`,
                    border: `2px solid ${cardColor}`
                  }}
                >
                  <div className="w-full h-full rounded-full bg-[#1e1e26] overflow-hidden flex items-center justify-center text-white text-3xl font-black">
                    {selectedUser.avatar ? (
                      <img 
                        src={selectedUser.avatar} 
                        alt="Avatar" 
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      (selectedUser.name || selectedUser.username || 'U').charAt(0).toUpperCase()
                    )}
                  </div>
                </div>

                {/* Status quote directly next to avatar */}
                {selectedUser.status && (
                  <div className="pb-1 max-w-[170px] text-right">
                    <p 
                      className="text-xs font-bold italic tracking-wide break-words drop-shadow"
                      style={{ color: cardColor }}
                    >
                      “{selectedUser.status}”
                    </p>
                  </div>
                )}
              </div>

              {/* Badges + Nickname row */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <ShieldCheck size={18} style={{ color: cardColor }} className="shrink-0 drop-shadow" />
                  <span 
                    className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-white shadow-sm"
                    style={{ color: cardColor }}
                  >
                    CEO
                  </span>
                  <h2 
                    className={`text-xl sm:text-2xl font-black tracking-tight text-white leading-tight ${getNicknameFontClass(selectedUser.nicknameFont)}`}
                    style={{
                      fontFamily: getNicknameFontFamily(selectedUser.nicknameFont),
                      ...getNicknameEffectStyle(selectedUser.nicknameEffect)
                    }}
                  >
                    {selectedUser.name || selectedUser.username || 'User'}
                  </h2>
                  <span className="text-sm select-none" title="VIP">💎</span>
                </div>

                {/* @username */}
                <p className="text-xs text-white/50 font-mono">
                  @{selectedUser.username || 'user'}
                </p>

                {/* Friends & Subscribers Counter (Interactive) */}
                <div className="flex items-center gap-1.5 text-xs text-white/60 font-medium">
                  <button
                    onClick={() => setIsFriendsListOpen(true)}
                    className="hover:text-white transition-colors cursor-pointer group flex items-center gap-1"
                    title="Открыть список друзей"
                  >
                    <strong className="text-white font-bold group-hover:underline">
                      {userFriends.length}
                    </strong>
                    <span className="text-white/60 group-hover:text-white/90">
                      {formatFriendsWord(userFriends.length).split(' ')[1] || 'друзей'}
                    </span>
                  </button>
                  <span className="text-white/30">•</span>
                  <span>
                    <strong className="text-white font-bold">{selectedUser.subscribersCount ?? 0}</strong> подписчиков
                  </span>
                </div>
              </div>

              {/* 1. Listening Activity Pill with Live Track & Context + CSS Equalizer sound bars */}
              <div 
                onClick={handlePlayActiveOrPinnedTrack}
                className="relative p-2.5 px-3 rounded-[18px] bg-black/45 hover:bg-black/65 border border-white/[0.08] hover:border-white/20 transition-all duration-200 cursor-pointer shadow-md overflow-hidden group"
                title={isListening 
                  ? `Слушать: ${activeTrackTitle} — ${activeTrackArtist}` 
                  : pinnedTrack.title 
                    ? `Слушать закрепленный: ${pinnedTrack.title} — ${pinnedTrack.artist}` 
                    : "Не слушает музыку"}
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Content area: shows live track & context dynamically */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Cover or Context Icon */}
                    <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-black/40 shadow-sm relative flex items-center justify-center group-hover:scale-105 transition-transform">
                      {isListening && activeTrackCover ? (
                        <>
                          <img 
                            src={activeTrackCover} 
                            alt="" 
                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            className="w-full h-full object-cover" 
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Play size={12} className="text-white fill-white ml-0.5" />
                          </div>
                        </>
                      ) : isListening ? (
                        activeContextType === 'wave' ? (
                          <Radio size={16} className="animate-pulse" style={{ color: cardColor }} />
                        ) : activeContextType === 'search' ? (
                          <Search size={16} style={{ color: cardColor }} />
                        ) : activeContextType === 'collection' ? (
                          <Heart size={16} style={{ color: cardColor }} />
                        ) : (
                          <Disc3 size={16} style={{ color: cardColor }} />
                        )
                      ) : pinnedTrack.cover ? (
                        <>
                          <img 
                            src={pinnedTrack.cover} 
                            alt="" 
                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            className="w-full h-full object-cover" 
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Play size={12} className="text-white fill-white ml-0.5" />
                          </div>
                        </>
                      ) : (
                        <Music size={16} style={{ color: cardColor }} />
                      )}
                    </div>

                    {/* Text Details */}
                    <div className="min-w-0 flex-1">
                      {isListening ? (
                        <>
                          {/* Context where track is playing */}
                          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider truncate mb-0.5" style={{ color: cardColor }}>
                            {activeContextType === 'wave' ? (
                              <>
                                <Radio size={10} className="animate-pulse shrink-0" />
                                <span className="truncate">В Моей волне</span>
                              </>
                            ) : (
                              <>
                                <Disc3 size={10} className="shrink-0" />
                                <span className="truncate">{activeContextTitle || 'Плейлист'}</span>
                              </>
                            )}
                          </div>
                          {/* Active track title */}
                          <div className="text-xs font-bold text-white truncate leading-tight group-hover:text-white transition-colors">
                            {activeTrackTitle || 'Музыка'}
                          </div>
                          {/* Active track artist */}
                          {activeTrackArtist && (
                            <div className="text-[10px] text-white/60 truncate leading-tight mt-0.5">
                              {activeTrackArtist}
                            </div>
                          )}
                        </>
                      ) : pinnedTrack.title ? (
                        <>
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-white/40 uppercase tracking-wider truncate mb-0.5">
                            <Pin size={9} className="shrink-0" />
                            <span className="truncate">Закрепленный трек</span>
                          </div>
                          <div className="text-xs font-bold text-white/80 truncate leading-tight">
                            {pinnedTrack.title}
                          </div>
                          {pinnedTrack.artist && (
                            <div className="text-[10px] text-white/50 truncate leading-tight mt-0.5">
                              {pinnedTrack.artist}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="text-xs font-semibold text-white/60 leading-tight">
                            Не слушает музыку
                          </div>
                          <div className="text-[10px] text-white/35 leading-tight mt-0.5">
                            Сейчас ничего не играет
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Equalizer Sound Bars — Hardware Accelerated CSS Keyframes */}
                  <div className="flex items-end gap-[3.5px] h-4 shrink-0 px-1 py-0.5">
                    <span 
                      className="w-[3.5px] rounded-full transition-all" 
                      style={{ 
                        height: isListening ? '60%' : '20%',
                        backgroundColor: cardColor,
                        boxShadow: isListening ? `0 0 8px ${cardColor}88` : undefined,
                        animation: isListening ? 'aura-bar-1 1.1s infinite ease-in-out' : 'none'
                      }} 
                    />
                    <span 
                      className="w-[3.5px] rounded-full transition-all" 
                      style={{ 
                        height: isListening ? '85%' : '35%',
                        backgroundColor: cardColor,
                        boxShadow: isListening ? `0 0 8px ${cardColor}88` : undefined,
                        animation: isListening ? 'aura-bar-2 0.9s infinite ease-in-out' : 'none'
                      }} 
                    />
                    <span 
                      className="w-[3.5px] rounded-full transition-all" 
                      style={{ 
                        height: isListening ? '50%' : '20%',
                        backgroundColor: cardColor,
                        boxShadow: isListening ? `0 0 8px ${cardColor}88` : undefined,
                        animation: isListening ? 'aura-bar-3 1.25s infinite ease-in-out' : 'none'
                      }} 
                    />
                  </div>
                </div>
              </div>

              {/* 2. Friend Action Buttons — Solid ProfileColor */}
              {status !== 'self' && (
                <div>
                  {status === 'none' && (
                    <button
                      onClick={() => sendFriendRequest(selectedUser)}
                      className="w-full py-2.5 rounded-[18px] font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-[0.98] hover:brightness-110"
                      style={{ 
                        backgroundColor: cardColor, 
                        color: buttonTextColor,
                        boxShadow: `0 4px 20px ${cardColor}44`
                      }}
                    >
                      <UserPlus size={15} />
                      <span>Добавить в друзья</span>
                    </button>
                  )}
                  {status === 'outgoing' && (
                    <button
                      onClick={() => cancelOutgoingRequest(selectedUser.id)}
                      className="w-full py-2.5 rounded-[18px] bg-white/10 hover:!bg-[#ff2247] hover:!text-white border border-white/15 text-xs font-bold text-white/90 flex items-center justify-center gap-2 transition-all cursor-pointer group"
                    >
                      <Check size={15} className="group-hover:hidden text-emerald-400" />
                      <span className="group-hover:hidden">Запрос отправлен</span>
                      <span className="hidden group-hover:inline flex items-center gap-1.5 font-bold text-white">
                        ✕ Отменить запрос
                      </span>
                    </button>
                  )}
                  {status === 'incoming' && (
                    <button
                      onClick={() => acceptFriendRequest(selectedUser.id)}
                      className="w-full py-2.5 rounded-[18px] font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-[0.98] hover:brightness-110"
                      style={{ 
                        backgroundColor: cardColor, 
                        color: buttonTextColor,
                        boxShadow: `0 4px 20px ${cardColor}44`
                      }}
                    >
                      <UserCheck size={15} />
                      <span>Принять запрос в друзья</span>
                    </button>
                  )}
                  {status === 'friends' && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Удалить ${selectedUser.name || selectedUser.username} из друзей?`)) {
                          removeFriend(selectedUser.id);
                        }
                      }}
                      className="w-full py-2.5 rounded-[18px] font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-[0.98] group hover:brightness-105"
                      style={{ 
                        backgroundColor: cardColor, 
                        color: buttonTextColor,
                        boxShadow: `0 4px 20px ${cardColor}44`
                      }}
                    >
                      <UserCheck size={15} className="group-hover:hidden" />
                      <span className="group-hover:hidden">В друзьях</span>
                      <span className="hidden group-hover:inline flex items-center gap-1.5 font-bold" style={{ color: buttonTextColor }}>
                        ✕ Удалить друга
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* 3 & 4. Socials + Metadata Combined */}
              <div className="p-3.5 rounded-[20px] bg-white/[0.08] border border-white/10 shadow-sm space-y-2.5">
                {(selectedUser.telegram || selectedUser.discord || selectedUser.website) && (
                  <div className="space-y-1.5">
                    {selectedUser.telegram && (
                      <a
                        href={`https://t.me/${String(selectedUser.telegram).replace('@', '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-[14px] bg-black/25 hover:bg-black/40 border border-white/[0.06] flex items-center gap-2.5 text-xs text-white transition-all group"
                      >
                        <div className="w-5 h-5 rounded-full bg-[#229ED9] flex items-center justify-center text-white shrink-0 shadow-sm">
                          <Send size={11} className="-rotate-12 translate-x-0.5" />
                        </div>
                        <span className="font-bold text-xs tracking-tight text-white/90 group-hover:text-white truncate">
                          {String(selectedUser.telegram).replace('@', '')}
                        </span>
                      </a>
                    )}
                    {selectedUser.discord && (
                      <div className="p-2 rounded-[14px] bg-black/25 border border-white/[0.06] flex items-center gap-2.5 text-xs text-white">
                        <div className="w-5 h-5 rounded-full bg-[#5865F2] flex items-center justify-center text-white shrink-0 shadow-sm">
                          <DiscordIcon size={11} />
                        </div>
                        <span className="font-bold text-xs tracking-tight text-white/90 truncate">
                          {selectedUser.discord}
                        </span>
                      </div>
                    )}
                    {selectedUser.website && (
                      <a
                        href={String(selectedUser.website).startsWith('http') ? selectedUser.website : `https://${selectedUser.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-[14px] bg-black/25 hover:bg-black/40 border border-white/[0.06] flex items-center gap-2.5 text-xs text-white transition-all group"
                      >
                        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                          <Globe size={11} />
                        </div>
                        <span className="font-bold text-xs tracking-tight text-white/90 group-hover:text-white truncate">
                          {selectedUser.website}
                        </span>
                      </a>
                    )}
                    <div className="border-t border-white/[0.08] my-1" />
                  </div>
                )}

                {/* Metadata: Calendar, Clock, Hash */}
                <div className="flex flex-col gap-2 text-xs px-0.5">
                  <div className="flex items-center gap-2.5" title="Дата регистрации">
                    <Calendar size={15} style={{ color: cardColor }} className="shrink-0 drop-shadow" />
                    <span className="font-bold text-white/90">{formatDate(selectedUser.created)}</span>
                  </div>
                  <div className="flex items-center gap-2.5" title="Последняя активность">
                    <Clock size={15} style={{ color: cardColor }} className="shrink-0 drop-shadow" />
                    <span className="font-bold text-white/90" style={{ color: isOnline ? cardColor : undefined }}>
                      {isOnline ? 'В сети' : formatActivityTime(cloudPresence?.lastActive || (selectedUser as any).lastActive || selectedUser.updated || selectedUser.created)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5" title="Номер регистрации">
                    <Hash size={15} style={{ color: cardColor }} className="shrink-0 drop-shadow" />
                    <span className="font-bold text-white/90">{realOrderNumber}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===================== RIGHT COLUMN (Client User's App Theme) ===================== */}
        <div 
          className="relative z-10 w-full md:flex-1 p-6 flex flex-col justify-between min-w-0 overflow-hidden"
          style={{
            background: transparencyEnabled && customWallpaper
              ? `linear-gradient(135deg, rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, ${Math.max(0.65, (windowOpacity / 100) * 0.85)}) 0%, rgba(${mainRgb.r}, ${mainRgb.g}, ${mainRgb.b}, ${Math.max(0.75, (windowOpacity / 100) * 0.92)}) 100%)`
              : `linear-gradient(145deg, ${themeBgSurface} 0%, ${themeBgMain} 100%)`,
          }}
        >
          {/* Ambient theme glow in right panel */}
          <div 
            className="absolute inset-0 pointer-events-none transition-all duration-500 overflow-hidden"
            style={{
              background: `radial-gradient(circle at 80% 20%, ${themeAccent}18 0%, transparent 65%)`
            }}
          />

          <div className="relative z-10 flex flex-col gap-4 flex-1">
            
            {/* Top Analytics Box: styled in viewing user's active theme */}
            <div 
              className="p-5 rounded-2xl border flex items-center justify-between shadow-xl shrink-0"
              style={{
                backgroundColor: transparencyEnabled && customWallpaper
                  ? `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`
                  : (activeTheme?.colors?.bgSurfaceHover || '#1f0c10'),
                borderColor: themeBorderMain,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
              }}
            >
              <div>
                <div className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-baseline gap-1.5">
                  <span>{totalPlays}</span>
                  <span className="text-lg font-bold" style={{ color: themeAccent }}>♪</span>
                </div>
                <div className="text-xs text-white/60 font-medium mt-0.5">
                  Прослушиваний
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-baseline justify-end gap-1">
                  <span>{totalHours}</span>
                  <span className="text-lg font-bold" style={{ color: themeAccent }}>ч</span>
                </div>
                <div className="text-xs text-white/60 font-medium mt-0.5">
                  всего
                </div>
              </div>
            </div>

            {/* Pinned Track Card */}
            {pinnedTrack.title && (
              <div 
                onClick={handlePlayPinnedTrack}
                className="group p-3.5 rounded-2xl flex items-center justify-between gap-3 shadow-lg cursor-pointer transition-all hover:brightness-110 active:scale-[0.99] border relative overflow-hidden shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${themeAccent}33 0%, ${themeBgSurface}ee 100%)`,
                  borderColor: `${themeAccent}33`,
                  boxShadow: `0 8px 20px ${themeAccent}12`
                }}
                title="Нажмите для воспроизведения закрепленного трека"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-white/20 shadow-md bg-black/40 group-hover:scale-105 transition-transform flex items-center justify-center">
                    {pinnedTrack.cover ? (
                      <img 
                        src={pinnedTrack.cover} 
                        alt="" 
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <Music size={18} style={{ color: themeAccent }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white text-xs sm:text-sm truncate leading-snug">
                      {pinnedTrack.title}
                    </div>
                    <div className="text-[11px] text-white/70 truncate mt-0.5">
                      {pinnedTrack.artist}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 p-1.5 text-white/80 group-hover:text-white transition-colors" title="Закрепленный трек">
                  <Pin size={17} className="rotate-45" />
                </div>
              </div>
            )}

            {/* Showcase / Popular tracks list below pinned track */}
            <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
              <div className="text-xs font-bold text-white/50 uppercase tracking-wider px-1">
                {isSelf ? 'Недавно прослушано вами' : 'Популярное у пользователя'}
              </div>
              {showcaseTracks.length > 0 ? (
                <div className="space-y-1.5">
                  {showcaseTracks.map((t, idx) => {
                    const dur = (typeof t.duration === 'number' && !isNaN(t.duration) && t.duration > 0) ? Math.round(t.duration) : 180;
                    return (
                      <div
                        key={t.id + '_' + idx}
                        onClick={() => playContext([t], 0)}
                        className="p-2.5 rounded-2xl hover:brightness-125 border flex items-center justify-between gap-3 cursor-pointer transition-all group"
                        style={{
                          backgroundColor: activeTheme?.colors?.bgSurfaceHover
                            ? `${activeTheme.colors.bgSurfaceHover}44`
                            : 'rgba(255, 255, 255, 0.03)',
                          borderColor: themeBorderMain
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-mono text-white/40 w-4 text-center group-hover:hidden">
                            {idx + 1}
                          </span>
                          <Play size={13} style={{ color: themeAccent }} className="hidden group-hover:block ml-0.5 mr-0.5" />
                          <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-black/30 flex items-center justify-center">
                            {t.customCoverPath || t.originalCoverUrl ? (
                              <img 
                                src={(t.customCoverPath || t.originalCoverUrl)!} 
                                alt="" 
                                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                className="w-full h-full object-cover" 
                              />
                            ) : (
                              <Music size={15} className="m-auto text-white/40 h-full" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate group-hover:text-white transition-colors">
                              {t.title}
                            </div>
                            <div className="text-[11px] text-white/50 truncate">
                              {t.artist}
                            </div>
                          </div>
                        </div>
                        <span className="text-[11px] text-white/40 font-mono">
                          {Math.floor(dur / 60)}:{(dur % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center text-xs text-white/40">
                  У пользователя пока нет треков в истории
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* Friends List Modal */}
      <FriendsListModal
        isOpen={isFriendsListOpen}
        onClose={() => setIsFriendsListOpen(false)}
        title={`Друзья ${selectedUser.name || selectedUser.username}`}
        friends={userFriends}
        isLoading={isLoadingFriends}
        onSelectUser={(friend) => {
          setIsFriendsListOpen(false);
          openProfileModal(friend);
        }}
      />
    </div>
  );
};
