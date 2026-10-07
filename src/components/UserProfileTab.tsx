import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Calendar, Hash, Clock, Search, 
  Users, Inbox, Send, 
  ExternalLink, Sparkles, X, ShieldCheck
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useFriendsStore } from '../store/useFriendsStore';
import { useThemeStore } from '../store/useThemeStore';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { pocketBaseService } from '../services/PocketBaseService';
import { getNicknameFontFamily, getNicknameFontClass, getNicknameEffectStyle } from '../utils/profileStyles';
import { FriendsListModal, formatFriendsWord } from './FriendsListModal';

// Simple Discord Icon SVG
const DiscordIcon: React.FC<{ size?: number; className?: string }> = ({ size = 15, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const GLASS_THEME_STYLE: React.CSSProperties = {
  backgroundColor: 'rgba(24, 22, 30, 0.78)',
  borderColor: 'rgba(255, 255, 255, 0.08)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)'
};

const ANALYTICS_BAR_STYLE: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(28, 25, 36, 0.85) 0%, rgba(18, 16, 24, 0.75) 100%)',
  borderColor: 'rgba(255, 255, 255, 0.10)',
  boxShadow: '0 12px 36px rgba(0, 0, 0, 0.35)'
};

interface UserProfileTabProps {
  onOpenSettings?: () => void;
}

export const UserProfileTab: React.FC<UserProfileTabProps> = ({ onOpenSettings: _onOpenSettings }) => {
  const { user, openAuthModal } = useAuthStore();
  const { 
    friends, 
    incomingRequests, 
    outgoingRequests, 
    openProfileModal, 
    searchUsers,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelOutgoingRequest
  } = useFriendsStore();
  
  const { transparencyEnabled, customWallpaper, windowOpacity, glassBlur, glassStrength } = useThemeStore();
  const { totalPlays, topCovers, getTotalHoursFormatted, syncWithDatabase } = useAnalyticsStore();

  const [activeFriendsTab, setActiveFriendsTab] = useState<'friends' | 'incoming' | 'outgoing'>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [realOrderNumber, setRealOrderNumber] = useState<number>(user?.accountNumber || 1);
  const [isFriendsListOpen, setIsFriendsListOpen] = useState(false);

  // Sync analytics and friends with PocketBase database & fetch user registration order number
  useEffect(() => {
    syncWithDatabase().catch(() => {});
    useFriendsStore.getState().syncWithDatabase().catch(() => {});

    const interval = setInterval(() => {
      useFriendsStore.getState().syncWithDatabase().catch(() => {});
    }, 2500);

    const unsubPromise = pocketBaseService.pb.collection('friend_requests').subscribe('*', () => {
      useFriendsStore.getState().syncWithDatabase().catch(() => {});
    }).catch(() => null);

    if (user?.id || user?.created) {
      pocketBaseService.getUserOrderNumber(user?.created, user?.id).then((num) => {
        if (num > 0) setRealOrderNumber(num);
      }).catch(() => {});
    }

    return () => {
      clearInterval(interval);
      unsubPromise.then(unsub => {
        if (typeof unsub === 'function') unsub();
      });
    };
  }, [user?.id, user?.created]);

  useEffect(() => {
    useFriendsStore.getState().syncWithDatabase().catch(() => {});
  }, [activeFriendsTab]);

  // Fallback / Active User Data matching Screenshot 2
  const effectiveUser = useMemo(() => {
    if (user) return user;
    return {
      id: 'local_user',
      email: 't33rxblade@aura.app',
      name: 't33rxblade',
      username: 't333xvlade',
      avatar: '',
      status: 'SSADASDASD',
      bio: 't33rxblade',
      profileColor: '#4338ca',
      nicknameFont: 'default' as const,
      nicknameEffect: 'none' as const,
      pinnedTrackId: 'pinned_sample',
      pinnedTrackTitle: 'не хочу быть кем-то',
      pinnedTrackArtist: 'мертвыелегкие, coldn1ght',
      pinnedTrackCover: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=300&auto=format&fit=crop',
      created: '2026-09-23T19:38:00Z',
      updated: '2026-09-27T19:59:00Z',
      accountNumber: realOrderNumber || 1,
      friendsCount: friends?.length || 0,
      subscribersCount: 0
    };
  }, [user, friends?.length, realOrderNumber]);

  const rawColor = effectiveUser.profileColor;
  const profileColor = (rawColor && typeof rawColor === 'string' && rawColor.startsWith('#')) ? rawColor : '#4338ca';

  // Handle Search
  const searchSeqRef = useRef(0);
  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    const seq = ++searchSeqRef.current;
    if (!val.trim()) {
      setSearchResults([]);
      return;
    }
    const results = await searchUsers(val);
    if (seq === searchSeqRef.current) {
      setSearchResults(results);
    }
  };

  // Clean date formatting without duplicate 'г. г.'
  const formatDate = (isoString?: string) => {
    if (!isoString) return '23 сентября 2026 г.';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '23 сентября 2026 г.';
      const str = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      const clean = str.replace(/\s*г\.?$/i, '').trim();
      return `${clean} г.`;
    } catch {
      return '23 сентября 2026 г.';
    }
  };

  // Clean activity time formatting without duplicate 'г. г.'
  const formatActivityTime = (isoString?: string) => {
    if (!isoString) return '27 сентября 2026 г. в 20:29';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '27 сентября 2026 г. в 20:29';
      const str = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      const cleanDate = str.replace(/\s*г\.?$/i, '').trim() + ' г.';
      const timePart = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      return `${cleanDate} в ${timePart}`;
    } catch {
      return '27 сентября 2026 г. в 20:29';
    }
  };

  // Default banner fallback texture
  const defaultBannerUrl = 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop';
  const bannerImage = effectiveUser.banner || defaultBannerUrl;

  return (
    <div className="w-full h-full overflow-y-auto px-5 lg:px-8 py-6 space-y-6 scrollbar-hide select-none">
      
      {/* Top Warning if in guest mode */}
      {!user && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs text-amber-300">
            <Sparkles size={16} className="shrink-0" />
            <span>Вы просматриваете демо-профиль. Войдите в учетную запись Aura для синхронизации настроек, цветов и друзей.</span>
          </div>
          <button
            onClick={openAuthModal}
            className="px-3.5 py-1.5 rounded-xl bg-amber-400 text-black text-xs font-bold hover:brightness-110 active:scale-95 transition-all shrink-0 cursor-pointer shadow-md"
          >
            Войти в аккаунт
          </button>
        </div>
      )}

      {/* ===================== 1. MAIN PROFILE CARD (Full-width, matching Screenshot 2) ===================== */}
      <div 
        className="w-full rounded-[28px] overflow-hidden border border-white/10 shadow-2xl relative p-6 sm:p-7 min-h-[220px] transition-all flex flex-col justify-between"
        style={{
          backgroundColor: transparencyEnabled && customWallpaper
            ? `rgba(16, 16, 22, ${Math.max(0.75, (windowOpacity / 100) * 0.92)})`
            : '#121217',
          backdropFilter: transparencyEnabled && customWallpaper && glassBlur > 0
            ? `blur(${glassBlur + 4}px) saturate(${100 + glassStrength * 1.5}%)`
            : undefined,
        }}
      >
        {/* Banner image across the ENTIRE card */}
        <div 
          className="absolute inset-0 bg-cover bg-center pointer-events-none transition-all duration-500 opacity-60"
          style={{ backgroundImage: `url(${bannerImage})` }}
        />

        {/* Selected profileColor fading from right to left - visibly more transparent & smooth */}
        <div 
          className="absolute inset-0 pointer-events-none transition-all duration-500"
          style={{
            background: `linear-gradient(to left, ${profileColor}88 0%, ${profileColor}44 35%, rgba(18, 18, 24, 0.65) 70%, rgba(12, 12, 16, 0.92) 100%)`
          }}
        />

        {/* Ambient radial accent on the right */}
        <div 
          className="absolute inset-0 pointer-events-none transition-all duration-500"
          style={{
            background: `radial-gradient(circle at 95% 50%, ${profileColor}55 0%, transparent 65%)`
          }}
        />

        {/* Card Header & Content */}
        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-6">
          
          {/* Left Column: Avatar + Status under avatar ("а статус это под аватаркой") */}
          <div className="flex flex-col items-center shrink-0">
            <div 
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full p-1 shadow-2xl relative overflow-hidden transition-all"
              style={{ backgroundColor: profileColor }}
            >
              <div className="w-full h-full rounded-full bg-[#18181f] overflow-hidden border-2 border-white/20 flex items-center justify-center text-white text-3xl font-black">
                {effectiveUser.avatar ? (
                  <img src={effectiveUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-red-500 font-bold text-3xl">
                    {effectiveUser.name ? effectiveUser.name.charAt(0).toUpperCase() : 'T'}
                  </span>
                )}
              </div>
            </div>

            {/* Status under the avatar */}
            <div className="mt-3 text-center max-w-[200px]">
              <p 
                className="text-xs sm:text-sm font-semibold italic tracking-wide break-words drop-shadow"
                style={{ color: profileColor }}
              >
                “{effectiveUser.status || 'SSADASDASD'}”
              </p>
            </div>
          </div>

          {/* Center Column: Nickname, @username, Friends, Bio, Metadata */}
          <div className="flex-1 min-w-0 text-center sm:text-left space-y-3 pt-1 w-full">
            
            {/* Top row: Shield + Nickname */}
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <ShieldCheck size={20} style={{ color: profileColor }} className="shrink-0 drop-shadow" />
              <h1 
                className={`text-2xl sm:text-3xl font-black text-white tracking-tight ${getNicknameFontClass(effectiveUser.nicknameFont)}`}
                style={{
                  fontFamily: getNicknameFontFamily(effectiveUser.nicknameFont),
                  ...getNicknameEffectStyle(effectiveUser.nicknameEffect)
                }}
              >
                {effectiveUser.name || 't33rxblade'}
              </h1>
            </div>

            {/* @username */}
            <p className="text-xs text-white/50 font-mono">
              @{effectiveUser.username || 't333xvlade'}
            </p>

            {/* Friends & Subscribers Counter */}
            <div className="flex items-center justify-center sm:justify-start gap-2 text-xs font-semibold text-white/70">
              <button 
                type="button"
                className="hover:text-white transition-colors cursor-pointer group flex items-center gap-1 bg-transparent border-0 p-0"
                onClick={() => setIsFriendsListOpen(true)}
                title="Посмотреть список друзей"
              >
                <strong className="text-white font-bold group-hover:underline">{friends.length}</strong>
                <span className="text-white/70 group-hover:text-white/90">
                  {formatFriendsWord(friends.length).split(' ')[1] || 'друзей'}
                </span>
              </button>
              <span className="text-white/30">•</span>
              <span>
                <strong className="text-white font-bold">{effectiveUser.subscribersCount || 0}</strong> подписчиков
              </span>
            </div>

            {/* "О себе" quote block ("снизу где начинается ковычка это раздел О себе") */}
            <div className="pt-1 max-w-xl">
              <div className="p-3 rounded-2xl bg-black/30 border border-white/[0.08] backdrop-blur-sm flex items-center gap-3">
                <span className="text-xl font-serif text-white/40 leading-none select-none shrink-0">
                  ”
                </span>
                <p className="text-xs sm:text-sm text-white/85 whitespace-pre-line leading-relaxed font-sans truncate flex-1">
                  {effectiveUser.bio || 't33rxblade'}
                </p>
              </div>
            </div>

            {/* Integrations Badges (Discord, Telegram, Website) */}
            {(effectiveUser.discord || effectiveUser.telegram || effectiveUser.website) && (
              <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap pt-1">
                {effectiveUser.discord && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#5865F2]/20 border border-[#5865F2]/40 text-[#8ea1e1] text-xs font-mono">
                    <DiscordIcon size={14} />
                    <span>{effectiveUser.discord}</span>
                  </div>
                )}
                {effectiveUser.telegram && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#229ED9]/20 border border-[#229ED9]/40 text-[#68c6f3] text-xs font-mono">
                    <Send size={13} />
                    <span>@{effectiveUser.telegram.replace('@', '')}</span>
                  </div>
                )}
                {effectiveUser.website && (
                  <a 
                    href={effectiveUser.website.startsWith('http') ? effectiveUser.website : `https://${effectiveUser.website}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-white/80 hover:text-white text-xs transition-colors"
                  >
                    <ExternalLink size={13} />
                    <span className="truncate max-w-[150px]">{effectiveUser.website.replace(/^https?:\/\//, '')}</span>
                  </a>
                )}
              </div>
            )}

            {/* Bottom Metadata: Registration Date, Account #, Last Active - icons matching profileColor, truthful numbers without duplicate 'г. г.' */}
            <div className="pt-2 flex items-center justify-between sm:justify-start gap-5 text-xs text-white/60 flex-wrap">
              <div className="flex items-center gap-1.5" title="Дата регистрации">
                <Calendar size={14} style={{ color: profileColor }} className="shrink-0 drop-shadow" />
                <span className="font-medium text-white/80">{formatDate(user?.created || effectiveUser.created)}</span>
              </div>
              <div className="flex items-center gap-1.5" title="Номер регистрации">
                <Hash size={14} style={{ color: profileColor }} className="shrink-0 drop-shadow" />
                <span className="font-mono font-bold text-white/90">{realOrderNumber}</span>
              </div>
              <div className="flex items-center gap-1.5" title="Последняя активность">
                <Clock size={14} style={{ color: profileColor }} className="shrink-0 drop-shadow" />
                <span className="font-medium font-semibold" style={{ color: profileColor }}>
                  В сети
                </span>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* ===================== 2. HORIZONTAL ANALYTICS BAR (Theme Glass Style) ===================== */}
      <div 
        className="w-full rounded-[24px] sm:rounded-[26px] px-6 py-4 sm:py-5 border transition-all shadow-2xl relative flex items-center justify-between"
        style={ANALYTICS_BAR_STYLE}
      >
        {/* Left Side: Number + Note / Прослушиваний */}
        <div className="flex flex-col">
          <div className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-baseline gap-2">
            <span>{totalPlays || 0}</span>
            <span className="text-base sm:text-lg font-bold" style={{ color: profileColor }}>♪</span>
          </div>
          <div className="text-xs text-white/50 font-medium mt-1">
            Прослушиваний
          </div>
        </div>

        {/* Right Side: Hours + всего + 2x2 Covers Cluster */}
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="flex flex-col text-right">
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-baseline justify-end gap-1">
              <span>{getTotalHoursFormatted()}</span>
              <span className="text-sm sm:text-base font-bold" style={{ color: profileColor }}>ч</span>
            </div>
            <div className="text-xs text-white/50 font-medium mt-0.5">
              всего
            </div>
          </div>

          {/* 2x2 Mini Covers Mosaic */}
          <div className="w-14 h-14 rounded-2xl overflow-hidden grid grid-cols-2 grid-rows-2 gap-0.5 bg-black/60 p-0.5 border border-white/10 shrink-0 shadow-md">
            {(topCovers || []).slice(0, 4).map((cover, idx) => (
              <div key={idx} className="w-full h-full overflow-hidden bg-black/40">
                <img src={cover} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===================== 3. FRIENDS SECTION (Individual glass pills matching media_1790525444720.png) ===================== */}
      <div className="w-full space-y-4 pt-1">
        {/* Header: Title on Left, Controls on Right */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Друзья
          </h2>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Tabs in glass style */}
            <div 
              className="flex items-center p-1 rounded-2xl border transition-all"
              style={GLASS_THEME_STYLE}
            >
              <button
                onClick={() => setActiveFriendsTab('friends')}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeFriendsTab === 'friends'
                    ? 'bg-white text-black shadow-md'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Друзья
              </button>

              <button
                onClick={() => setActiveFriendsTab('incoming')}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeFriendsTab === 'incoming'
                    ? 'bg-white text-black shadow-md'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <span>Входящие</span>
                {incomingRequests.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {incomingRequests.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveFriendsTab('outgoing')}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeFriendsTab === 'outgoing'
                    ? 'bg-white text-black shadow-md'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Исходящие
              </button>
            </div>

            {/* Search Input 🔍 in glass style */}
            <div className="relative sm:w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input 
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Найти"
                className="w-full h-9 pl-9 pr-7 rounded-xl border transition-all text-xs text-white placeholder-white/40 focus:outline-none"
                style={GLASS_THEME_STYLE}
              />
              {searchQuery && (
                <button 
                  onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Friends Tab Content Area: Individual glass pills matching media_1790525444720.png */}
        <div className="w-full">
          {searchQuery.trim() ? (
            /* Search Results: Individual full-width glass pills */
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-white/50 px-1">
                Результаты поиска ({searchResults.length}):
              </div>
              {searchResults.length === 0 ? (
                <div className="text-center py-8 text-white/40 text-xs">
                  Пользователи по запросу «{searchQuery}» не найдены
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {searchResults.map((u) => (
                    <div
                      key={u.id}
                      onClick={() => openProfileModal(u)}
                      className="w-full p-3 sm:px-5 sm:py-3.5 rounded-[22px] border transition-all flex items-center justify-between gap-4 cursor-pointer group shadow-lg hover:border-white/25 active:scale-[0.99]"
                      style={GLASS_THEME_STYLE}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div 
                          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#18181f] shrink-0 overflow-hidden flex items-center justify-center font-bold text-white text-xs transition-transform group-hover:scale-105"
                          style={{
                            border: u.profileColor ? `2px solid ${u.profileColor}` : '2px solid rgba(255,255,255,0.1)',
                            boxShadow: u.profileColor ? `0 0 12px ${u.profileColor}55` : undefined
                          }}
                        >
                          {u.avatar ? (
                            <img 
                              src={u.avatar} 
                              alt="" 
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} 
                              className="w-full h-full object-cover" 
                            />
                          ) : (
                            (u.name ? u.name.charAt(0).toUpperCase() : 'U')
                          )}
                        </div>
                          <div className="min-w-0">
                            <div 
                              className={`text-xs sm:text-sm font-bold text-white truncate ${getNicknameFontClass(u.nicknameFont)}`}
                              style={{
                                fontFamily: getNicknameFontFamily(u.nicknameFont),
                                ...getNicknameEffectStyle(u.nicknameEffect)
                              }}
                            >
                              {u.name || 'Пользователь'}
                            </div>
                            {u.activePresence?.isPlaying ? (
                              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium truncate">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                                <span className="truncate">
                                  Слушает: {u.activePresence.trackTitle} {u.activePresence.trackArtist ? `— ${u.activePresence.trackArtist}` : ''}
                                </span>
                              </div>
                            ) : (
                              <div className="text-[11px] text-white/50 font-mono truncate">
                                @{u.username || 'user'}{u.lastActive ? ` • был(а) ${formatActivityTime(u.lastActive)}` : ''}
                              </div>
                            )}
                          </div>
                      </div>

                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          openProfileModal(u);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white text-white hover:text-black text-xs font-bold transition-all shrink-0 cursor-pointer"
                      >
                        Профиль
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Active Friends Lists */
            <div>
              {activeFriendsTab === 'friends' && (
                friends.length === 0 ? (
                  <div className="text-center py-12 space-y-2">
                    <Users size={32} className="mx-auto text-white/20" />
                    <p className="text-sm font-semibold text-white/50">У вас пока нет друзей</p>
                    <p className="text-xs text-white/30">Воспользуйтесь строкой поиска выше, чтобы найти друзей по нику или юзернейму</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {friends.map((friend) => (
                      <div
                        key={friend.id}
                        onClick={() => openProfileModal(friend)}
                        className="w-full p-3 sm:px-5 sm:py-3.5 rounded-[22px] border transition-all flex items-center justify-between gap-4 cursor-pointer group shadow-lg hover:border-white/25 active:scale-[0.99]"
                        style={GLASS_THEME_STYLE}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#18181f] shrink-0 overflow-hidden flex items-center justify-center font-bold text-white text-xs">
                            {friend.avatar ? (
                              <img src={friend.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              friend.name ? friend.name.charAt(0).toUpperCase() : 'U'
                            )}
                          </div>
                          <div className="min-w-0">
                            <div 
                              className={`text-xs sm:text-sm font-bold text-white truncate ${getNicknameFontClass(friend.nicknameFont)}`}
                              style={{
                                fontFamily: getNicknameFontFamily(friend.nicknameFont),
                                ...getNicknameEffectStyle(friend.nicknameEffect)
                              }}
                            >
                              {friend.name || 'Друг'}
                            </div>
                            {friend.activePresence?.isPlaying ? (
                              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium truncate">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                                <span className="truncate">
                                  Слушает: {friend.activePresence.trackTitle} {friend.activePresence.trackArtist ? `— ${friend.activePresence.trackArtist}` : ''}
                                </span>
                              </div>
                            ) : (
                              <div className="text-[11px] text-white/50 font-mono truncate">
                                @{friend.username || 'user'}
                              </div>
                            )}
                          </div>
                        </div>

                        <Users size={16} className="text-white/30 group-hover:text-white/60 transition-colors shrink-0 mr-1" />
                      </div>
                    ))}
                  </div>
                )
              )}

              {activeFriendsTab === 'incoming' && (
                incomingRequests.length === 0 ? (
                  <div className="text-center py-12 space-y-2">
                    <Inbox size={32} className="mx-auto text-white/20" />
                    <p className="text-sm font-semibold text-white/50">Нет входящих заявок в друзья</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {incomingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="w-full p-3 sm:px-5 sm:py-3.5 rounded-[22px] border transition-all flex items-center justify-between gap-4 shadow-lg hover:border-white/25"
                        style={GLASS_THEME_STYLE}
                      >
                        <div 
                          onClick={() => openProfileModal(req)} 
                          className="flex items-center gap-3.5 min-w-0 cursor-pointer flex-1"
                        >
                          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/10 shrink-0 overflow-hidden border border-white/10">
                            {req.avatar ? <img src={req.avatar} alt="" className="w-full h-full object-cover" /> : req.name?.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-bold text-white truncate">{req.name}</div>
                            <div className="text-[11px] text-white/50 font-mono truncate">@{req.username}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => acceptFriendRequest(req.id)}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                          >
                            Принять
                          </button>
                          <button
                            onClick={() => rejectFriendRequest(req.id)}
                            className="p-1.5 rounded-xl bg-white/[0.06] hover:bg-red-500/20 text-white/60 hover:text-red-400 transition-all cursor-pointer active:scale-95"
                            title="Отклонить"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {activeFriendsTab === 'outgoing' && (
                outgoingRequests.length === 0 ? (
                  <div className="text-center py-12 space-y-2">
                    <Send size={32} className="mx-auto text-white/20" />
                    <p className="text-sm font-semibold text-white/50">Нет исходящих запросов</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {outgoingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="w-full p-3 sm:px-5 sm:py-3.5 rounded-[22px] border transition-all flex items-center justify-between gap-4 shadow-lg hover:border-white/25"
                        style={GLASS_THEME_STYLE}
                      >
                        <div 
                          onClick={() => openProfileModal(req)} 
                          className="flex items-center gap-3.5 min-w-0 cursor-pointer flex-1"
                        >
                          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/10 shrink-0 overflow-hidden border border-white/10">
                            {req.avatar ? <img src={req.avatar} alt="" className="w-full h-full object-cover" /> : req.name?.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-bold text-white truncate">{req.name}</div>
                            <div className="text-[11px] text-white/50 font-mono truncate">@{req.username}</div>
                          </div>
                        </div>

                        <button
                          onClick={() => cancelOutgoingRequest(req.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-red-500/20 text-white/60 hover:text-red-400 text-xs font-semibold transition-all cursor-pointer active:scale-95 shrink-0"
                        >
                          Отменить
                        </button>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>

      </div>

      {/* Friends List Modal */}
      <FriendsListModal
        isOpen={isFriendsListOpen}
        onClose={() => setIsFriendsListOpen(false)}
        title="Мои друзья"
        friends={friends}
        onSelectUser={(friend) => {
          setIsFriendsListOpen(false);
          openProfileModal(friend);
        }}
      />
    </div>
  );
};
