import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Music, Minus, Square, X, PictureInPicture2 } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useThemeStore } from '../store/useThemeStore';

const TitleBar: React.FC = () => {
  const appWindow = getCurrentWindow();
  const toggleMiniPlayer = usePlayerStore(state => state.toggleMiniPlayer);
  const customWallpaper = useThemeStore(state => state.customWallpaper);

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
      
      <div className="flex h-full">
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
