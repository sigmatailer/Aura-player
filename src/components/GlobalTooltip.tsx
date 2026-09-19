import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipState {
  text: string;
  x: number;
  y: number;
  pos: 'top' | 'bottom' | 'left' | 'right';
}

export const GlobalTooltip: React.FC = () => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const lastActiveTimeRef = useRef<number>(0);
  const activeElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handlePointerOver = (e: PointerEvent) => {
      const target = (e.target as HTMLElement)?.closest?.('[data-tooltip], [title]') as HTMLElement | null;
      if (!target) return;

      // Intercept and remove native title to prevent OS gray rectangle
      let text = target.getAttribute('data-tooltip');
      if (!text) {
        const nativeTitle = target.getAttribute('title');
        if (nativeTitle && nativeTitle.trim()) {
          text = nativeTitle.trim();
          target.setAttribute('data-tooltip', text);
          target.removeAttribute('title');
        }
      }

      if (!text || !text.trim()) return;

      activeElRef.current = target;

      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      const now = Date.now();
      const isWarm = now - lastActiveTimeRef.current < 400;
      const delay = isWarm ? 0 : 200;

      if (showTimerRef.current) {
        window.clearTimeout(showTimerRef.current);
      }

      showTimerRef.current = window.setTimeout(() => {
        if (activeElRef.current !== target) return;

        const rect = target.getBoundingClientRect();
        const explicitPos = target.getAttribute('data-tooltip-pos') as 'top' | 'bottom' | 'left' | 'right' | null;

        let pos: 'top' | 'bottom' | 'left' | 'right' = explicitPos || 'top';
        if (!explicitPos) {
          if (rect.left < 100) {
            pos = 'right';
          } else if (rect.top > window.innerHeight - 90) {
            pos = 'top';
          } else if (rect.top < 60) {
            pos = 'bottom';
          } else {
            pos = 'top';
          }
        }

        let x = rect.left + rect.width / 2;
        let y = rect.top;

        if (pos === 'top') {
          y = rect.top - 8;
        } else if (pos === 'bottom') {
          y = rect.bottom + 8;
        } else if (pos === 'right') {
          x = rect.right + 10;
          y = rect.top + rect.height / 2;
        } else if (pos === 'left') {
          x = rect.left - 10;
          y = rect.top + rect.height / 2;
        }

        setTooltip({ text: text!, x, y, pos });
        lastActiveTimeRef.current = Date.now();
      }, delay);
    };

    const handlePointerOut = (e: PointerEvent) => {
      const target = (e.target as HTMLElement)?.closest?.('[data-tooltip]') as HTMLElement | null;
      if (!target || activeElRef.current === target) {
        if (showTimerRef.current) {
          window.clearTimeout(showTimerRef.current);
          showTimerRef.current = null;
        }
        activeElRef.current = null;

        hideTimerRef.current = window.setTimeout(() => {
          setTooltip(null);
        }, 60);
      }
    };

    const handlePointerDown = () => {
      if (showTimerRef.current) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      activeElRef.current = null;
      setTooltip(null);
    };

    const handleScroll = () => {
      if (tooltip) {
        setTooltip(null);
      }
    };

    document.addEventListener('pointerover', handlePointerOver, { capture: true });
    document.addEventListener('pointerout', handlePointerOut, { capture: true });
    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });

    return () => {
      document.removeEventListener('pointerover', handlePointerOver, { capture: true });
      document.removeEventListener('pointerout', handlePointerOut, { capture: true });
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('scroll', handleScroll, { capture: true });
      if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [tooltip]);

  return (
    <AnimatePresence>
      {tooltip && (
        <motion.div
          key={tooltip.text + tooltip.x + tooltip.y}
          initial={{ 
            opacity: 0, 
            scale: 0.94,
            translateX: tooltip.pos === 'right' ? -4 : tooltip.pos === 'left' ? 4 : '-50%',
            translateY: tooltip.pos === 'top' ? 4 : tooltip.pos === 'bottom' ? -4 : '-50%'
          }}
          animate={{ 
            opacity: 1, 
            scale: 1,
            translateX: tooltip.pos === 'right' ? 0 : tooltip.pos === 'left' ? 0 : '-50%',
            translateY: tooltip.pos === 'top' ? '-100%' : tooltip.pos === 'bottom' ? 0 : '-50%'
          }}
          exit={{ 
            opacity: 0, 
            scale: 0.96,
            transition: { duration: 0.1 }
          }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            pointerEvents: 'none',
            zIndex: 99999,
          }}
          className="px-2.5 py-1 text-[11.5px] font-medium tracking-wide text-[var(--text-main)] bg-[var(--bg-surface)]/95 border border-[var(--border-main)] rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.6)] backdrop-blur-md whitespace-nowrap select-none flex items-center justify-center"
        >
          {tooltip.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
