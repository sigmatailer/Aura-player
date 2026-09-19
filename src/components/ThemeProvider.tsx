import React, { useEffect } from 'react';
import { useThemeStore } from '../store/useThemeStore';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { getActiveTheme, currentThemeId, fontId, trackFontId, getActiveFont, getActiveTrackFont } = useThemeStore();

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
    
    root.style.setProperty('--font-family', font.family);
    root.style.setProperty('--font-track', trackFont.family === 'inherit' ? font.family : trackFont.family);
    document.body.style.fontFamily = font.family;
  }, [currentThemeId, fontId, trackFontId, getActiveTheme, getActiveFont, getActiveTrackFont]);

  return <>{children}</>;
};
