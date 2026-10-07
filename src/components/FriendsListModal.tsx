import React, { useState, useMemo } from 'react';
import { X, Search, Users, ShieldCheck, Radio } from 'lucide-react';
import { CloudUser } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import { getNicknameFontClass, getNicknameFontFamily, getNicknameEffectStyle } from '../utils/profileStyles';

interface FriendsListModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  friends: CloudUser[];
  isLoading?: boolean;
  onSelectUser: (user: CloudUser) => void;
}

export function formatFriendsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${count} друзей`;
  if (mod10 === 1) return `${count} друг`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} друга`;
  return `${count} друзей`;
}

export const FriendsListModal: React.FC<FriendsListModalProps> = ({
  isOpen,
  onClose,
  title,
  friends,
  isLoading = false,
  onSelectUser
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const { transparencyEnabled, customWallpaper, windowOpacity, getActiveTheme } = useThemeStore();
  const activeTheme = getActiveTheme ? getActiveTheme() : null;
  const themeAccent = activeTheme?.colors?.accent || 'var(--accent, #6366f1)';
  const themeBgSurface = activeTheme?.colors?.bgSurface || '#141418';

  const filteredFriends = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/^@/, '');
    if (!q) return friends;
    return friends.filter(f => 
      (f.name && f.name.toLowerCase().includes(q)) ||
      (f.username && f.username.toLowerCase().includes(q))
    );
  }, [friends, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-pointer transition-opacity"
      />

      {/* Modal Container */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[500px] max-h-[85vh] rounded-[26px] overflow-hidden border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.9)] z-10 flex flex-col animate-in zoom-in-95 duration-200"
        style={{
          backgroundColor: transparencyEnabled && customWallpaper
            ? `rgba(18, 18, 24, ${Math.max(0.85, (windowOpacity / 100) * 0.95)})`
            : themeBgSurface
        }}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div 
              className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"
              style={{ backgroundColor: `${themeAccent}25`, color: themeAccent }}
            >
              <Users size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white truncate">
                {title}
              </h2>
              <p className="text-xs text-white/50">
                {formatFriendsWord(friends.length)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95"
            title="Закрыть"
          >
            <X size={15} />
          </button>
        </div>

        {/* Search Bar */}
        {friends.length > 3 && (
          <div className="px-4 sm:px-5 pt-3.5 pb-2 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по имени или @username..."
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-white/30 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Friends List Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {isLoading ? (
            <div className="py-12 text-center text-white/50 text-xs flex flex-col items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <span>Загрузка списка друзей...</span>
            </div>
          ) : filteredFriends.length === 0 ? (
            <div className="py-12 text-center text-white/40 text-xs space-y-1">
              <Users size={28} className="mx-auto text-white/20 mb-2" />
              <p className="font-semibold">{searchQuery ? 'Друзья не найдены' : 'Список друзей пуст'}</p>
              {searchQuery && <p className="text-[11px] text-white/30">Попробуйте изменить поисковый запрос</p>}
            </div>
          ) : (
            filteredFriends.map((f) => {
              const profileColor = f.profileColor || '#4338ca';
              const isPlaying = f.activePresence?.isPlaying;
              return (
                <div
                  key={f.id}
                  onClick={() => onSelectUser(f)}
                  className="w-full p-2.5 sm:p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/20 transition-all flex items-center justify-between gap-3 cursor-pointer group shadow-sm active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar with profileColor border */}
                    <div 
                      className="w-10 h-10 rounded-full bg-[#18181f] shrink-0 overflow-hidden flex items-center justify-center font-bold text-white text-xs relative transition-transform group-hover:scale-105"
                      style={{
                        border: `2px solid ${profileColor}`,
                        boxShadow: `0 0 10px ${profileColor}44`
                      }}
                    >
                      {f.avatar ? (
                        <img 
                          src={f.avatar} 
                          alt="" 
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        (f.name ? f.name.charAt(0).toUpperCase() : 'U')
                      )}

                      {/* Online dot */}
                      <span 
                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#18181f] ${
                          isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-500'
                        }`}
                      />
                    </div>

                    {/* Name & Username */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span 
                          className={`text-xs sm:text-sm font-bold text-white truncate ${getNicknameFontClass(f.nicknameFont)}`}
                          style={{
                            fontFamily: getNicknameFontFamily(f.nicknameFont),
                            ...getNicknameEffectStyle(f.nicknameEffect)
                          }}
                        >
                          {f.name || 'Пользователь'}
                        </span>
                        <ShieldCheck size={13} style={{ color: profileColor }} className="shrink-0" />
                      </div>

                      {isPlaying ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium truncate mt-0.5">
                          <Radio size={10} className="animate-pulse shrink-0" />
                          <span className="truncate">
                            Слушает: {f.activePresence?.trackTitle || 'Музыку'}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-white/50 font-mono truncate mt-0.5">
                          @{f.username || 'user'}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectUser(f);
                    }}
                    className="px-3 py-1 rounded-xl bg-white/[0.06] hover:bg-white text-white hover:text-black text-[11px] font-bold transition-all shrink-0 cursor-pointer"
                  >
                    Профиль
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
