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
        {/* Solid filled play triangle matching inactive dimensions exactly */}
        <path d="M 6.2 6.5 C 6.2 5.3 7.5 4.6 8.5 5.2 L 18.2 11 C 19.1 11.5 19.1 12.5 18.2 13 L 8.5 18.8 C 7.5 19.4 6.2 18.7 6.2 17.5 Z" />
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
      <path d="M 6.2 6.5 C 6.2 5.3 7.5 4.6 8.5 5.2 L 18.2 11 C 19.1 11.5 19.1 12.5 18.2 13 L 8.5 18.8 C 7.5 19.4 6.2 18.7 6.2 17.5 Z" />
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
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth={active ? 2.3 : 1.9} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" strokeWidth={active ? 2.3 : 1.9} />
    </svg>
  );
};
