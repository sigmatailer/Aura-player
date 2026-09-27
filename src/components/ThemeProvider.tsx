import React, { useEffect } from 'react';
import { useThemeStore, getContrastColor } from '../store/useThemeStore';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { 
    getActiveTheme, currentThemeId, fontId, trackFontId, 
    getActiveFont, getActiveTrackFont, fontSize, fontWeight 
  } = useThemeStore();

  useEffect(() => {
    const theme = getActiveTheme();
    const font = getActiveFont();
    const trackFont = getActiveTrackFont ? getActiveTrackFont() : font;
    const root = document.documentElement;
    
    root.style.setProperty('--bg-main', theme.colors.bgMain);
    root.style.setProperty('--bg-surface', theme.colors.bgSurface);
    root.style.setProperty('--bg-surface-hover', theme.colors.bgSurfaceHover);
    root.style.setProperty('--text-main', theme.colors.textMain);
    root.style.setProperty('--text-secondary', theme.colors.textSecondary);
    root.style.setProperty('--border-main', theme.colors.borderMain);
    root.style.setProperty('--accent', theme.colors.accent);
    root.style.setProperty('--accent-hover', theme.colors.accentHover);
    
    const contrastColor = getContrastColor(theme.colors.accent);
    root.style.setProperty('--accent-contrast', contrastColor);
    
    root.style.setProperty('--font-family', font.family);
    root.style.setProperty('--font-track', trackFont.family === 'inherit' ? font.family : trackFont.family);
    document.body.style.fontFamily = font.family;

    // Apply font size globally to root HTML (scales rem units and pixel utility classes throughout entire app)
    const currentSize = fontSize || 16;
    const fontScale = currentSize / 16;
    root.style.setProperty('--font-scale', `${fontScale}`);
    root.style.fontSize = `${currentSize}px`;
    root.style.setProperty('--font-size-base', `${currentSize}px`);
    root.setAttribute('data-font-size-scaled', 'true');

    // Apply font weight globally
    const currentWeight = fontWeight || 'Auto';
    if (currentWeight !== 'Auto') {
      root.setAttribute('data-font-weight', currentWeight);
      root.style.setProperty('--font-weight-base', currentWeight);
      document.body.style.fontWeight = currentWeight;
    } else {
      root.removeAttribute('data-font-weight');
      root.style.setProperty('--font-weight-base', 'normal');
      document.body.style.fontWeight = '';
    }
  }, [currentThemeId, fontId, trackFontId, getActiveTheme, getActiveFont, getActiveTrackFont, fontSize, fontWeight]);

  return <>{children}</>;
};
