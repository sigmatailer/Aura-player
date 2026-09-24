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
        fill="none" 
        className={className}
      >
        {/* Solid filled circular search lens matching Screenshot 2 */}
        <circle cx="10.8" cy="10.8" r="7.2" fill="currentColor" />
        {/* Diagonal handle */}
        <line x1="15.8" y1="15.8" x2="20" y2="20" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" />
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
      <circle cx="10.8" cy="10.8" r="6.2" />
      <line x1="15.5" y1="15.5" x2="20" y2="20" strokeWidth={2.5} />
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
        {/* Solid filled octagon silhouette with center circle cutout */}
        <path 
          fillRule="evenodd" 
          clipRule="evenodd" 
          d="M 10.2 3.4 H 13.8 C 14.8 3.4 15.7 3.8 16.4 4.5 L 18 6.1 C 18.7 6.8 19.2 7.6 19.2 8.5 V 15.5 C 19.2 16.4 18.7 17.2 18 17.9 L 16.4 19.5 C 15.7 20.2 14.8 20.6 13.8 20.6 H 10.2 C 9.2 20.6 8.3 20.2 7.6 19.5 L 6 17.9 C 5.3 17.2 4.8 16.4 4.8 15.5 V 8.5 C 4.8 7.6 5.3 6.8 6 6.1 L 7.6 4.5 C 8.3 3.8 9.2 3.4 10.2 3.4 Z M 12 8.6 C 10.1 8.6 8.6 10.1 8.6 12 C 8.6 13.9 10.1 15.4 12 15.4 C 13.9 15.4 15.4 13.9 15.4 12 C 15.4 10.1 13.9 8.6 12 8.6 Z" 
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
      {/* Upper-left segment matching Screenshot 1 */}
      <path d="M 4.8 16.2 V 8.6 C 4.8 7.7 5.3 6.9 6 6.2 L 7.6 4.6 C 8.3 3.9 9.2 3.5 10.2 3.5 H 13.8 C 14.8 3.5 15.7 3.9 16.4 4.6 L 18 6.2 C 18.7 6.9 19.2 7.7 19.2 8.6 V 10.6" />
      {/* Lower-right segment with signature opening */}
      <path d="M 19.2 13.4 V 15.4 C 19.2 16.3 18.7 17.1 18 17.8 L 16.4 19.4 C 15.7 20.1 14.8 20.5 13.8 20.5 H 10.2 C 9.4 20.5 8.7 20.2 8.1 19.7 L 8 19.6" />
      {/* Center concentric ring */}
      <circle cx="12" cy="12" r="3.3" strokeWidth={1.8} />
    </svg>
  );
};
