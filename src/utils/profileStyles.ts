import React from 'react';

export type NicknameFont = 'default' | 'caveat' | 'spray' | 'beastly' | 'pixel' | 'retro';
export type NicknameEffect = 'none' | 'animated' | 'neon' | 'cartoon' | 'highlight' | '3d' | 'retro';

export const PROFILE_COLORS = [
  { id: 'none', label: 'По умолчанию', value: '' },
  { id: 'red', label: 'Красный', value: '#ef4444' },
  { id: 'orange', label: 'Оранжевый', value: '#ea580c' },
  { id: 'yellow', label: 'Желтый', value: '#eab308' },
  { id: 'green', label: 'Зеленый', value: '#22c55e' },
  { id: 'cyan', label: 'Бирюзовый', value: '#06b6d4' },
  { id: 'sky', label: 'Голубой', value: '#0ea5e9' },
  { id: 'blue', label: 'Синий', value: '#3b82f6' },
  { id: 'purple', label: 'Фиолетовый', value: '#6366f1' },
  { id: 'pink', label: 'Розовый', value: '#ec4899' },
];

export const NICKNAME_FONTS: { id: NicknameFont; label: string; previewFont: string }[] = [
  { id: 'default', label: 'Default', previewFont: 'var(--font-family, sans-serif)' },
  { id: 'caveat', label: 'Caveat', previewFont: "'Caveat', cursive" },
  { id: 'spray', label: 'Spray', previewFont: "'Permanent Marker', cursive" },
  { id: 'beastly', label: 'Beastly', previewFont: "'Creepster', cursive" },
  { id: 'pixel', label: 'Pixel', previewFont: "'Press Start 2P', monospace" },
  { id: 'retro', label: 'Retro', previewFont: "'Righteous', cursive" },
];

export const NICKNAME_EFFECTS: { id: NicknameEffect; label: string }[] = [
  { id: 'none', label: 'Обычный' },
  { id: 'animated', label: 'Animated' },
  { id: 'neon', label: 'Neon' },
  { id: 'cartoon', label: 'Cartoon' },
  { id: 'highlight', label: 'Highlight' },
  { id: '3d', label: '3D' },
  { id: 'retro', label: 'Retro' },
];

export function getNicknameFontClass(font?: string): string {
  switch (font) {
    case 'caveat': return 'font-nick-caveat';
    case 'spray': return 'font-nick-spray';
    case 'beastly': return 'font-nick-beastly';
    case 'pixel': return 'font-nick-pixel';
    case 'retro': return 'font-nick-retro';
    default: return 'font-nick-default';
  }
}

export function getNicknameFontFamily(font?: string): string {
  switch (font) {
    case 'caveat': return "'Caveat', cursive";
    case 'spray': return "'Permanent Marker', cursive";
    case 'beastly': return "'Creepster', cursive";
    case 'pixel': return "'Press Start 2P', monospace";
    case 'retro': return "'Righteous', cursive";
    default: return "inherit";
  }
}

export function getNicknameEffectStyle(effect?: string): React.CSSProperties {
  switch (effect) {
    case 'animated':
      return {
        backgroundImage: 'linear-gradient(90deg, #ec4899, #8b5cf6, #3b82f6, #06b6d4, #ec4899)',
        backgroundSize: '250% 100%',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        animation: 'rainbow-text 3s linear infinite',
        display: 'inline-block'
      };
    case 'neon':
      return {
        color: '#ffffff',
        textShadow: '0 0 5px #c084fc, 0 0 10px #a855f7, 0 0 20px #9333ea, 0 0 35px #7e22ce'
      };
    case 'cartoon':
      return {
        color: '#facc15',
        WebkitTextStroke: '1.2px #000000',
        textShadow: '2px 2px 0px #000000',
        fontWeight: 900
      };
    case 'highlight':
      return {
        display: 'inline-block',
        padding: '1px 8px',
        borderRadius: '8px',
        backgroundColor: 'rgba(59, 130, 246, 0.25)',
        border: '1px solid rgba(59, 130, 246, 0.5)',
        color: '#93c5fd'
      };
    case '3d':
      return {
        color: '#f8fafc',
        textShadow: '0 1px 0 #94a3b8, 0 2px 0 #64748b, 0 3px 0 #475569, 0 4px 6px rgba(0,0,0,0.6)'
      };
    case 'retro':
      return {
        textShadow: '2px 0 0 #06b6d4, -2px 0 0 #f43f5e'
      };
    default:
      return {};
  }
}
