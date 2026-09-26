import React from 'react';
import { motion } from 'framer-motion';

export interface PlayingIndicatorProps {
  isPaused?: boolean;
  className?: string;
  barColor?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export const PlayingIndicator: React.FC<PlayingIndicatorProps> = ({ 
  isPaused = false,
  className = '',
  barColor = 'bg-[var(--accent)]',
  size = 'md'
}) => {
  const configs = {
    xs: {
      container: 'w-3.5 h-3 gap-[1.5px]',
      bar: 'w-[2px] rounded-[1px]',
      h1: isPaused ? '3px' : ['3px', '11px', '3px'],
      h2: isPaused ? '7px' : ['12px', '4px', '12px'],
      h3: isPaused ? '5px' : ['5px', '13px', '5px'],
    },
    sm: {
      container: 'w-4 h-4 gap-[2px]',
      bar: 'w-[2.5px] rounded-[1.5px]',
      h1: isPaused ? '4px' : ['4px', '14px', '4px'],
      h2: isPaused ? '9px' : ['15px', '5px', '15px'],
      h3: isPaused ? '6px' : ['6px', '16px', '6px'],
    },
    md: {
      container: 'w-6 h-6 gap-[2.5px]',
      bar: 'w-[3.5px] rounded-sm',
      h1: isPaused ? '6px' : ['6px', '16px', '6px'],
      h2: isPaused ? '10px' : ['16px', '6px', '16px'],
      h3: isPaused ? '8px' : ['10px', '20px', '10px'],
    },
    lg: {
      container: 'w-8 h-8 gap-[3px]',
      bar: 'w-[4px] rounded-sm',
      h1: isPaused ? '8px' : ['8px', '22px', '8px'],
      h2: isPaused ? '14px' : ['22px', '8px', '22px'],
      h3: isPaused ? '10px' : ['12px', '26px', '10px'],
    },
  };

  const cfg = configs[size] || configs.md;

  return (
    <div className={`flex items-end justify-center ${cfg.container} ${className}`}>
      <motion.div 
        animate={{ height: cfg.h1 }} 
        transition={isPaused ? { duration: 0.2 } : { duration: 0.7, repeat: Infinity, ease: 'easeInOut' }} 
        className={`${cfg.bar} ${barColor}`} 
      />
      <motion.div 
        animate={{ height: cfg.h2 }} 
        transition={isPaused ? { duration: 0.2 } : { duration: 0.7, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }} 
        className={`${cfg.bar} ${barColor}`} 
      />
      <motion.div 
        animate={{ height: cfg.h3 }} 
        transition={isPaused ? { duration: 0.2 } : { duration: 0.7, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }} 
        className={`${cfg.bar} ${barColor}`} 
      />
    </div>
  );
};
