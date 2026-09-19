import React, { useState, useEffect } from 'react';
import { useModalStore } from '../store/useModalStore';
import { X, ListMusic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const GlobalModal: React.FC = () => {
  const { isOpen, type, title, message, defaultValue, options, onConfirm, close } = useModalStore();
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (isOpen) {
      setInputValue(defaultValue);
    }
  }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-[var(--text-main)]">{title}</h2>
            <button 
              onClick={close}
              className="p-1.5 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {type === 'alert' && (
            <div className="mb-8 text-[#ccc]">
              {message}
            </div>
          )}

          {type === 'create_playlist' && (
            <div className="mb-8">
              <input 
                type="text"
                autoFocus
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && inputValue.trim()) {
                    onConfirm(inputValue.trim());
                    close();
                  }
                }}
                placeholder="Название плейлиста"
                className="w-full bg-[var(--bg-surface-hover)] border border-[var(--border-main)] rounded-xl px-4 py-3 text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
          )}

          {type === 'select_playlist' && (
            <div className="flex flex-col gap-2 mb-6 max-h-[300px] overflow-y-auto scrollbar-hide">
              {options.map(opt => (
                <div 
                  key={opt.id}
                  onClick={() => {
                    onConfirm(opt.id);
                    close();
                  }}
                  className="flex items-center gap-4 p-3 rounded-xl hover:bg-[var(--bg-surface-hover)] cursor-pointer transition-colors border border-transparent hover:border-[var(--border-main)]"
                >
                  <div className="w-10 h-10 rounded bg-[var(--bg-surface-hover)] flex items-center justify-center shrink-0">
                    <ListMusic size={18} className="text-[var(--text-secondary)]" />
                  </div>
                  <span className="text-[var(--text-main)] font-medium">{opt.name}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-auto">
            <button 
              onClick={close}
              className="px-5 py-2.5 rounded-full font-bold text-sm text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors"
            >
              Отмена
            </button>
            {type !== 'select_playlist' && (
              <button 
                onClick={() => {
                  if (type === 'create_playlist' && !inputValue.trim()) return;
                  if (type === 'create_playlist') onConfirm(inputValue.trim());
                  else onConfirm('');
                  close();
                }}
                disabled={type === 'create_playlist' && !inputValue.trim()}
                className="px-6 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-main)] rounded-full font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ОК
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
