import React from 'react';
import { X, Plus, DownloadCloud, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PlaylistChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateEmpty: () => void;
  onOpenImport: () => void;
}

export const PlaylistChoiceModal: React.FC<PlaylistChoiceModalProps> = ({
  isOpen,
  onClose,
  onCreateEmpty,
  onOpenImport,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/70 backdrop-blur-md"
        />
        
        <motion.div 
          initial={{ scale: 0.92, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-[var(--text-main)] tracking-tight">Новый плейлист</h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Выберите способ создания</p>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Choices */}
          <div className="flex flex-col gap-3 my-2">
            {/* 1. Create Empty */}
            <button
              onClick={() => {
                onClose();
                onCreateEmpty();
              }}
              className="group flex items-start gap-4 p-4 rounded-2xl bg-[var(--bg-surface-hover)] hover:bg-[var(--border-main)]/50 border border-[var(--border-main)] transition-all text-left hover:scale-[1.01]"
            >
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Plus size={24} strokeWidth={2.5} />
              </div>
              <div className="flex flex-col flex-1">
                <span className="text-[15px] font-bold text-[var(--text-main)]">Создать пустой плейлист</span>
                <span className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Создайте собственный плейлист с нуля и добавляйте любые треки
                </span>
              </div>
            </button>

            {/* 2. Import from URL */}
            <button
              onClick={() => {
                onClose();
                onOpenImport();
              }}
              className="group flex items-start gap-4 p-4 rounded-2xl bg-[var(--bg-surface-hover)] hover:bg-[var(--border-main)]/50 border border-[var(--border-main)] transition-all text-left hover:scale-[1.01] relative overflow-hidden"
            >
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent)] text-[var(--text-main)] flex items-center justify-center shrink-0 shadow-lg group-hover:scale-110 transition-transform">
                <DownloadCloud size={24} strokeWidth={2} />
              </div>
              <div className="flex flex-col flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-[var(--text-main)]">Импортировать по ссылке</span>
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
                    <Sparkles size={11} />
                    Авто
                  </span>
                </div>
                <span className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Автоматический перенос названия, обложки и треков по ссылке
                </span>
                
                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {['Яндекс Музыка', 'Spotify', 'Apple Music', 'YouTube', 'VK'].map((platform) => (
                    <span 
                      key={platform}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-main)]"
                    >
                      {platform}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          </div>

          <div className="flex justify-end mt-4">
            <button 
              onClick={onClose}
              className="px-4 py-2 rounded-full font-bold text-xs text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors"
            >
              Отмена
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
