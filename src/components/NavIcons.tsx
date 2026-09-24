import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  active?: boolean;
}

export const NavHomeIcon: React.FC<IconProps> = ({ size = 22, className = '', active = false }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={active ? 2.2 : 1.9} 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    {/* Roof contour with signature upper-right gap */}
    <path d="M 12 3.6 C 12.8 3.6 13.5 3.9 14.1 4.5 L 18.5 8.7 C 19 9.2 19.3 9.8 19.3 10.5" />
    <path d="M 19.3 14.2 V 16.5 C 19.3 18.8 17.6 20.4 15.4 20.4 H 8.6 C 6.4 20.4 4.7 18.8 4.7 16.5 V 10.5 C 4.7 9.8 5 9.2 5.5 8.7 L 9.9 4.5 C 10.5 3.9 11.2 3.6 12 3.6" />
    {/* Center vertical notch / door tick */}
    <line x1="12" y1="15.2" x2="12" y2="18.2" strokeWidth={active ? 2.4 : 2.1} />
  </svg>
);

export const NavWaveIcon: React.FC<IconProps> = ({ size = 22, className = '', active = false }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={active ? 2.2 : 1.9} 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    {/* Rounded triangle pointing right with signature gap on the left vertical edge */}
    <path d="M 5.8 7 C 5.8 5.6 7.1 4.7 8.3 5.4 L 18.8 11.2 C 19.9 11.8 19.9 12.2 18.8 12.8 L 8.3 18.6 C 7.1 19.3 5.8 18.4 5.8 17 V 14.2" />
    <path d="M 5.8 9.8 V 7" />
  </svg>
);

export const NavSearchIcon: React.FC<IconProps> = ({ size = 22, className = '', active = false }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={active ? 2.2 : 1.9} 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    {/* Circular magnifying glass with signature gap at upper-left */}
    <path d="M 5.2 10.8 C 5.2 14.4 8.1 17.3 11.7 17.3 C 15.3 17.3 18.2 14.4 18.2 10.8 C 18.2 7.2 15.3 4.3 11.7 4.3 C 10.6 4.3 9.5 4.6 8.5 5.2" />
    <line x1="16.4" y1="15.8" x2="20.2" y2="19.6" strokeWidth={active ? 2.5 : 2.2} />
  </svg>
);

export const NavCollectionIcon: React.FC<IconProps> = ({ size = 22, className = '', active = false }) => {
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
        <rect x="8.5" y="4.2" width="7" height="1.8" rx="0.9" />
        {/* Middle shelf */}
        <rect x="6" y="7.2" width="12" height="1.8" rx="0.9" />
        {/* Main box container with rounded bottom and handle slot */}
        <path 
          fillRule="evenodd" 
          clipRule="evenodd" 
          d="M 4.5 10.4 C 4.5 9.8 4.9 9.4 5.5 9.4 H 18.5 C 19.1 9.4 19.5 9.8 19.5 10.4 V 16.5 C 19.5 18.8 17.8 20.4 15.5 20.4 H 8.5 C 6.2 20.4 4.5 18.8 4.5 16.5 V 10.4 Z M 9.2 15.6 C 8.6 15.6 8.2 16 8.2 16.6 C 8.2 17.2 8.6 17.6 9.2 17.6 H 14.8 C 15.4 17.6 15.8 17.2 15.8 16.6 C 15.8 16 15.4 15.6 14.8 15.6 H 9.2 Z" 
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
      strokeWidth={1.9} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      {/* Top lid */}
      <path d="M 8.5 4.8 H 15.5" strokeWidth={2.1} />
      {/* Middle shelf */}
      <path d="M 6.2 7.8 H 17.8" strokeWidth={2.1} />
      {/* Main box container */}
      <path d="M 4.8 10.8 H 19.2 V 16.2 C 19.2 18.5 17.6 20.2 15.4 20.2 H 8.6 C 6.4 20.2 4.8 18.5 4.8 16.2 Z" />
      {/* Handle slot */}
      <line x1="9.5" y1="16.5" x2="14.5" y2="16.5" strokeWidth={2.1} />
    </svg>
  );
};

export const NavSettingsIcon: React.FC<IconProps> = ({ size = 22, className = '', active = false }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={active ? 2.2 : 1.9} 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    {/* Hexagon with signature gap on the right vertical side */}
    <path d="M 9.5 3.8 H 14.5 C 15.3 3.8 16.1 4.3 16.5 5.1 L 18.9 9.3 C 19.2 9.8 19.4 10.4 19.4 11" />
    <path d="M 19.4 13.8 C 19.4 14.4 19.2 15 18.9 15.5 L 16.5 19.7 C 16.1 20.5 15.3 21 14.5 21 H 9.5 C 8.7 21 7.9 20.5 7.5 19.7 L 5.1 15.5 C 4.7 14.7 4.7 13.7 4.7 12.8 V 11.2 C 4.7 10.3 4.7 9.3 5.1 8.5 L 7.5 4.3 C 7.9 3.5 8.7 3.8 9.5 3.8 Z" />
    {/* Center circle */}
    <circle cx="12" cy="12" r="3.2" strokeWidth={active ? 2.2 : 1.9} />
  </svg>
);
