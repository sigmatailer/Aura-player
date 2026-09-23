import React, { useRef, useEffect } from 'react';
import { isVideoUrl } from '../store/useThemeStore';

interface MediaCoverProps {
  src?: string | null;
  alt?: string;
  className?: string;
  speed?: number;
  fallbackSrc?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
}

export const MediaCover: React.FC<MediaCoverProps> = ({
  src,
  alt = 'Cover',
  className = '',
  speed = 1.0,
  fallbackSrc = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop',
  onClick
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = isVideoUrl(src);

  useEffect(() => {
    if (isVideo && videoRef.current) {
      const v = videoRef.current;
      v.defaultMuted = true;
      v.muted = true;
      v.playbackRate = speed;
      const playPromise = v.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay retry if blocked by browser policy
        });
      }
    }
  }, [src, isVideo, speed]);

  if (isVideo && src) {
    return (
      <video
        ref={videoRef}
        src={src}
        autoPlay
        loop
        muted
        playsInline
        // @ts-ignore
        webkit-playsinline="true"
        // @ts-ignore
        x5-playsinline="true"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          v.defaultMuted = true;
          v.muted = true;
          v.playbackRate = speed;
          v.play().catch(() => {});
        }}
        onClick={onClick}
        className={className}
      />
    );
  }

  return (
    <img
      src={src || fallbackSrc}
      alt={alt}
      loading="eager"
      decoding="async"
      onClick={onClick}
      onError={(e) => {
        const target = e.target as HTMLImageElement;
        if (target.src !== fallbackSrc) {
          target.src = fallbackSrc;
        }
      }}
      className={className}
    />
  );
};
