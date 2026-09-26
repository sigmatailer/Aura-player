// Utility for analyzing currently playing track album art and extracting adaptive theme colors
import { Theme } from '../store/useThemeStore';

interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

interface ColorHSL {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl(r: number, g: number, b: number): ColorHSL {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  h = (h % 360 + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }

  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// In-memory cache to prevent re-extracting for the same cover image
const colorCache = new Map<string, Theme>();

export async function extractTrackTheme(imageUrl: string, _trackTitle?: string): Promise<Theme> {
  if (!imageUrl) {
    return getDefaultTrackTheme();
  }

  const cached = colorCache.get(imageUrl);
  if (cached) {
    return cached;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    // Timeout fallback after 2.5s if image fails to load
    const timeout = setTimeout(() => {
      const fallback = getDefaultTrackTheme();
      resolve(fallback);
    }, 2500);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(getDefaultTrackTheme());
          return;
        }

        // Downscale to 40x40 for instant non-blocking analysis
        const size = 40;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const imgData = ctx.getImageData(0, 0, size, size).data;
        const colorCandidates: Array<{ rgb: ColorRGB; hsl: ColorHSL; score: number }> = [];

        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          if (a < 128) continue;

          const hsl = rgbToHsl(r, g, b);

          // Discard pure blacks, pure whites, and muddy washed out colors
          if (hsl.l < 10 || hsl.l > 92) continue;

          // Score by saturation and appealing lightness (around 45-65% lightness is ideal for UI accents)
          const lightnessFactor = 1 - Math.abs(hsl.l - 55) / 55;
          const saturationFactor = hsl.s / 100;
          const score = saturationFactor * 1.8 + lightnessFactor * 1.0;

          colorCandidates.push({
            rgb: { r, g, b },
            hsl,
            score
          });
        }

        if (colorCandidates.length === 0) {
          // Fallback if image was mostly black/white
          const theme = getDefaultTrackTheme();
          colorCache.set(imageUrl, theme);
          resolve(theme);
          return;
        }

        // Sort descending by score
        colorCandidates.sort((a, b) => b.score - a.score);

        // Pick highest scored vibrant color
        const best = colorCandidates[0].hsl;
        const targetHue = best.h;
        const targetSat = Math.max(50, Math.min(95, best.s));
        const targetLightness = Math.max(48, Math.min(68, best.l));

        // Generate cohesive dark theme palette
        const accentHex = hslToHex(targetHue, targetSat, targetLightness);
        const accentHoverHex = hslToHex(targetHue, targetSat, Math.min(80, targetLightness + 8));

        // Backgrounds: Deep dark hues with slight tint of the track's color
        const bgMainHex = hslToHex(targetHue, Math.min(25, targetSat * 0.35), 4);
        const bgSurfaceHex = hslToHex(targetHue, Math.min(30, targetSat * 0.40), 7);
        const bgSurfaceHoverHex = hslToHex(targetHue, Math.min(35, targetSat * 0.45), 11);
        const borderMainHex = hslToHex(targetHue, Math.min(25, targetSat * 0.30), 16);
        const textSecondaryHex = hslToHex(targetHue, 15, 65);

        const theme: Theme = {
          id: 'track',
          name: 'Под трек',
          swatch: { c1: accentHex, c2: bgSurfaceHex },
          colors: {
            bgMain: bgMainHex,
            bgSurface: bgSurfaceHex,
            bgSurfaceHover: bgSurfaceHoverHex,
            textMain: '#ffffff',
            textSecondary: textSecondaryHex,
            borderMain: borderMainHex,
            accent: accentHex,
            accentHover: accentHoverHex
          }
        };

        colorCache.set(imageUrl, theme);
        resolve(theme);
      } catch (err) {
        console.warn('Color extraction error, using default:', err);
        resolve(getDefaultTrackTheme());
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      resolve(getDefaultTrackTheme());
    };

    img.src = imageUrl;
  });
}

function getDefaultTrackTheme(): Theme {
  return {
    id: 'track',
    name: 'Под трек',
    swatch: { c1: '#ff5500', c2: '#121216' },
    colors: {
      bgMain: '#0a0a0c',
      bgSurface: '#121216',
      bgSurfaceHover: '#1c1c22',
      textMain: '#ffffff',
      textSecondary: '#888888',
      borderMain: '#222226',
      accent: '#ff5500',
      accentHover: '#ff4400'
    }
  };
}
