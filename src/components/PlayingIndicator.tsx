import React from 'react';
import { motion } from 'framer-motion';

interface PlayingIndicatorProps {
  isPaused?: boolean;
}

export const PlayingIndicator: React.FC<PlayingIndicatorProps> = ({ isPaused }) => {
  return (
    <div className="flex items-end justify-center gap-[2px] w-6 h-6">
      <motion.div 
        animate={{ height: isPaused ? '6px' : ['6px', '16px', '6px'] }} 
        transition={isPaused ? { duration: 0.2 } : { duration: 0.8, repeat: Infinity, ease: 'easeInOut' }} 
        className="w-[4px] bg-[var(--accent)] rounded-sm" 
      />
      <motion.div 
        animate={{ height: isPaused ? '10px' : ['16px', '6px', '16px'] }} 
        transition={isPaused ? { duration: 0.2 } : { duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }} 
        className="w-[4px] bg-[var(--accent)] rounded-sm" 
      />
      <motion.div 
        animate={{ height: isPaused ? '8px' : ['10px', '20px', '10px'] }} 
        transition={isPaused ? { duration: 0.2 } : { duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }} 
        className="w-[4px] bg-[var(--accent)] rounded-sm" 
      />
    </div>
  );
};
