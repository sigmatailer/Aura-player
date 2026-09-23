import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Music, Minus, Square, X, PictureInPicture2, User } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useThemeStore } from '../store/useThemeStore';
import { useAuthStore } from '../store/useAuthStore';

const TitleBar: React.FC = () => {
  const appWindow = getCurrentWindow();
  const toggleMiniPlayer = usePlayerStore(state => state.toggleMiniPlayer);
  const customWallpaper = useThemeStore(state => state.customWallpaper);
  const { user, openAuthModal } = useAuthStore();

  return (
    <div 
      data-tauri-drag-region="true"
      className={`h-10 w-full ${
        customWallpaper 
          ? 'bg-gradient-to-b from-black/60 via-black/25 to-transparent' 
          : 'bg-[var(--bg-main)] border-b border-[var(--border-main)]'
      } flex items-center justify-between select-none shrink-0 transition-all duration-300`}
    >
      <div className="flex items-center gap-2 pl-4 pointer-events-none">
        <Music size={14} className="text-[var(--accent)]" />
        <span className="text-xs text-[#aaa] font-medium tracking-wide font-sans">Aura</span>
      </div>
      
      <div className="flex h-full items-center">
        {/* Account Button on Desktop TitleBar */}
        <button
          className={`h-6 px-2.5 mr-2 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
            user
              ? 'bg-[var(--bg-surface-hover)] border border-[var(--border-main)] text-[var(--text-main)] hover:border-[var(--accent)]'
              : 'bg-[var(--accent)] hover:brightness-110 text-[var(--text-main)] shadow-sm'
          }`}
          onClick={openAuthModal}
          data-tooltip={user ? 'Профиль Aura' : 'Войти в аккаунт'}
          data-tooltip-pos="bottom"
        >
          {user ? (
            <>
              <div className="w-4 h-4 rounded bg-[var(--accent)] text-[var(--text-main)] text-[10px] font-black flex items-center justify-center">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </div>
              <span className="text-[11px] max-w-[120px] truncate">{user.name || user.email.split('@')[0]}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            </>
          ) : (
            <>
              <User size={12} strokeWidth={2.5} />
              <span className="text-[11px] font-bold">Войти в аккаунт</span>
            </>
          )}
        </button>

        <button 
          className="h-full px-4 hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors flex items-center justify-center"
          onClick={toggleMiniPlayer}
          data-tooltip="Мини-плеер"
          data-tooltip-pos="bottom"
        >
          <PictureInPicture2 size={14} strokeWidth={1.5} />
        </button>
        <button 
          className="h-full px-4 hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors flex items-center justify-center"
          onClick={() => appWindow.minimize()}
        >
          <Minus size={16} strokeWidth={1.5} />
        </button>
        <button 
          className="h-full px-4 hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors flex items-center justify-center"
          onClick={() => appWindow.toggleMaximize()}
        >
          <Square size={13} strokeWidth={1.5} />
        </button>
        <button 
          className="h-full px-4 hover:bg-[#e81123] text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors flex items-center justify-center"
          onClick={() => appWindow.close()}
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
