import React from 'react';
import { useArtistStore } from '../store/useArtistStore';

interface ArtistLinksProps {
  artist?: string;
  className?: string;
  linkClassName?: string;
  viewMode?: 'drawer' | 'modal';
  stopPropagation?: boolean;
}

export function parseArtistNames(artistStr?: string): string[] {
  if (!artistStr) return [];
  // Split on commas, "feat.", "ft.", "&" with spaces, or slashes
  const rawParts = artistStr.split(/,\s*|\s+(?:feat\.?|ft\.?)\s+|\s+&\s+|\s*\/\s*/i);
  const result: string[] = [];
  const seen = new Set<string>();

  for (const part of rawParts) {
    const trimmed = part.trim();
    const lower = trimmed.toLowerCase();
    if (trimmed && !seen.has(lower)) {
      seen.add(lower);
      result.push(trimmed);
    }
  }
  return result.length > 0 ? result : [artistStr.trim()];
}

export const ArtistLinks: React.FC<ArtistLinksProps> = ({
  artist,
  className = '',
  linkClassName = '',
  viewMode = 'modal',
  stopPropagation = true
}) => {
  const { openArtist } = useArtistStore();
  if (!artist) return null;

  const names = parseArtistNames(artist);

  return (
    <span className={`inline-flex items-center flex-wrap gap-x-1 ${className}`}>
      {names.map((name, idx) => (
        <React.Fragment key={idx}>
          <span
            onClick={(e) => {
              if (stopPropagation) e.stopPropagation();
              openArtist(name, null, viewMode);
            }}
            className={`hover:underline hover:text-[var(--text-main)] cursor-pointer transition-colors ${linkClassName}`}
            title={`Открыть артиста: ${name}`}
          >
            {name}
          </span>
          {idx < names.length - 1 && <span className="opacity-60 select-none">,</span>}
        </React.Fragment>
      ))}
    </span>
  );
};
