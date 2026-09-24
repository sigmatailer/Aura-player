import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  active?: boolean;
}

export const NavHomeIcon: React.FC<IconProps> = ({ size = 25, className = '', active = false }) => {
  if (active) {
    return (
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="currentColor" 
        className={className}
      >
        {/* Solid filled home silhouette with bottom door slot cutout */}
        <path 
          fillRule="evenodd" 
          clipRule="evenodd" 
          d="M 12 2.6 C 12.9 2.6 13.8 3 14.4 3.6 L 19.2 8 C 19.7 8.5 20 9.2 20 10 V 16.5 C 20 18.9 18.1 20.8 15.7 20.8 H 8.3 C 5.9 20.8 4 18.9 4 16.5 V 10 C 4 9.2 4.3 8.5 4.8 8 L 9.6 3.6 C 10.2 3 11.1 2.6 12 2.6 Z M 10.5 14.5 C 10.5 13.7 11.2 13 12 13 C 12.8 13 13.5 13.7 13.5 14.5 V 18.5 H 10.5 V 14.5 Z" 
        />
      </svg>
    );
  }

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth={2.1} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M 12 3.6 C 12.8 3.6 13.5 3.9 14.1 4.5 L 18.5 8.7 C 19 9.2 19.3 9.8 19.3 10.5" />
      <path d="M 19.3 14.2 V 16.5 C 19.3 18.8 17.6 20.4 15.4 20.4 H 8.6 C 6.4 20.4 4.7 18.8 4.7 16.5 V 10.5 C 4.7 9.8 5 9.2 5.5 8.7 L 9.9 4.5 C 10.5 3.9 11.2 3.6 12 3.6" />
      <line x1="12" y1="15.2" x2="12" y2="18.2" strokeWidth={2.3} />
    </svg>
  );
};

export const NavWaveIcon: React.FC<IconProps> = ({ size = 25, className = '', active = false }) => {
  if (active) {
    return (
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="currentColor" 
        className={className}
      >
        {/* Solid filled play triangle with smooth rounded corners */}
        <path d="M 5.8 4.8 C 4.5 4 2.8 5 2.8 6.6 V 17.4 C 2.8 19 4.5 20 5.8 19.2 L 20 13.8 C 21.3 13 21.3 11 20 10.2 L 5.8 4.8 Z" />
      </svg>
    );
  }

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth={2.1} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M 5.8 7 C 5.8 5.6 7.1 4.7 8.3 5.4 L 18.8 11.2 C 19.9 11.8 19.9 12.2 18.8 12.8 L 8.3 18.6 C 7.1 19.3 5.8 18.4 5.8 17 V 14.2" />
      <path d="M 5.8 9.8 V 7" />
    </svg>
  );
};

export const NavSearchIcon: React.FC<IconProps> = ({ size = 25, className = '', active = false }) => {
  if (active) {
    return (
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="currentColor" 
        className={className}
      >
        {/* Solid filled circular search lens with diagonal handle */}
        <path 
          fillRule="evenodd" 
          clipRule="evenodd" 
          d="M 11 2.8 C 15.5 2.8 19.2 6.5 19.2 11 C 19.2 13 18.5 14.8 17.3 16.2 L 21.6 20.5 C 22.1 21 22.1 21.9 21.6 22.4 C 21.1 22.9 20.2 22.9 19.7 22.4 L 15.4 18.1 C 14.1 19 12.6 19.5 11 19.5 C 6.5 19.5 2.8 15.8 2.8 11 C 2.8 6.5 6.5 2.8 11 2.8 Z M 11 5.4 C 7.9 5.4 5.4 7.9 5.4 11 C 5.4 14.1 7.9 16.6 11 16.6 C 14.1 16.6 16.6 14.1 16.6 11 C 16.6 7.9 14.1 5.4 11 5.4 Z" 
        />
      </svg>
    );
  }

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth={2.1} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M 5.2 10.8 C 5.2 14.4 8.1 17.3 11.7 17.3 C 15.3 17.3 18.2 14.4 18.2 10.8 C 18.2 7.2 15.3 4.3 11.7 4.3 C 10.6 4.3 9.5 4.6 8.5 5.2" />
      <line x1="16.4" y1="15.8" x2="20.2" y2="19.6" strokeWidth={2.5} />
    </svg>
  );
};

export const NavCollectionIcon: React.FC<IconProps> = ({ size = 25, className = '', active = false }) => {
  if (active) {
    return (
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="currentColor" 
        className={className}
      >
        {/* Top lid */}
        <rect x="8.5" y="4" width="7" height="2" rx="1" />
        {/* Middle shelf */}
        <rect x="5.8" y="7.2" width="12.4" height="2" rx="1" />
        {/* Main box container with rounded bottom and handle slot */}
        <path 
          fillRule="evenodd" 
          clipRule="evenodd" 
          d="M 4.2 10.4 C 4.2 9.7 4.7 9.2 5.4 9.2 H 18.6 C 19.3 9.2 19.8 9.7 19.8 10.4 V 16.5 C 19.8 18.9 17.9 20.8 15.5 20.8 H 8.5 C 6.1 20.8 4.2 18.9 4.2 16.5 V 10.4 Z M 9 15.5 C 8.4 15.5 7.9 16 7.9 16.6 C 7.9 17.2 8.4 17.7 9 17.7 H 15 C 15.6 17.7 16.1 17.2 16.1 16.6 C 16.1 16 15.6 15.5 15 15.5 H 9 Z" 
        />
      </svg>
    );
  }

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth={2} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M 8.5 4.8 H 15.5" strokeWidth={2.2} />
      <path d="M 6 7.8 H 18" strokeWidth={2.2} />
      <path d="M 4.6 10.8 H 19.4 V 16.2 C 19.4 18.6 17.6 20.4 15.3 20.4 H 8.7 C 6.4 20.4 4.6 18.6 4.6 16.2 Z" />
      <line x1="9.5" y1="16.5" x2="14.5" y2="16.5" strokeWidth={2.3} />
    </svg>
  );
};

export const NavSettingsIcon: React.FC<IconProps> = ({ size = 25, className = '', active = false }) => {
  if (active) {
    return (
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="currentColor" 
        className={className}
      >
        {/* Solid filled hexagon with circular center cutout */}
        <path 
          fillRule="evenodd" 
          clipRule="evenodd" 
          d="M 9.5 2.8 H 14.5 C 15.6 2.8 16.6 3.4 17.2 4.4 L 20.1 9.4 C 20.7 10.4 20.7 11.6 20.1 12.6 L 17.2 17.6 C 16.6 18.6 15.6 19.2 14.5 19.2 H 9.5 C 8.4 19.2 7.4 18.6 6.8 17.6 L 3.9 12.6 C 3.3 11.6 3.3 10.4 3.9 9.4 L 6.8 4.4 C 7.4 3.4 8.4 2.8 9.5 2.8 Z M 12 8 C 9.8 8 8 9.8 8 12 C 8 14.2 9.8 16 12 16 C 14.2 16 16 14.2 16 12 C 16 9.8 14.2 8 12 8 Z" 
        />
      </svg>
    );
  }

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth={2.1} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M 9.5 3.8 H 14.5 C 15.3 3.8 16.1 4.3 16.5 5.1 L 18.9 9.3 C 19.2 9.8 19.4 10.4 19.4 11" />
      <path d="M 19.4 13.8 C 19.4 14.4 19.2 15 18.9 15.5 L 16.5 19.7 C 16.1 20.5 15.3 21 14.5 21 H 9.5 C 8.7 21 7.9 20.5 7.5 19.7 L 5.1 15.5 C 4.7 14.7 4.7 13.7 4.7 12.8 V 11.2 C 4.7 10.3 4.7 9.3 5.1 8.5 L 7.5 4.3 C 7.9 3.5 8.7 3.8 9.5 3.8 Z" />
      <circle cx="12" cy="12" r="3.2" strokeWidth={2.2} />
    </svg>
  );
};
