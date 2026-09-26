import React, { useRef, useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Plus } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { audioService } from '../services/AudioService';

const PRESETS = [
  { name: 'Нейтральный', id: 'flat', bands: [0, 0, 0, 0, 0, 0], preAmp: 0 },
  { name: 'Басы', id: 'bass', bands: [7, 5, 2, -1, -2, -3], preAmp: -2 },
  { name: 'Высокие', id: 'treble', bands: [-3, -2, -1, 2, 5, 7], preAmp: -2 },
  { name: 'Вокал', id: 'vocal', bands: [-2, -1, 4, 5, 2, 0], preAmp: -1 },
  { name: 'Мощный', id: 'powerful', bands: [6, 4, -1, 2, 5, 6], preAmp: -3 },
  { name: 'Электронная', id: 'electronic', bands: [5, 4, 0, 2, 5, 4], preAmp: -2 },
  { name: 'Рок', id: 'rock', bands: [5, 3, -1, 2, 4, 6], preAmp: -2 },
  { name: 'Хип-хоп', id: 'hiphop', bands: [7, 5, 1, 2, 1, 3], preAmp: -2 },
];

const FREQ_LABELS = ['60', '150', '400', '1k', '2.4k', '15k'];

const SVG_WIDTH = 400;
const SVG_HEIGHT = 140;
const PADDING_X = 20;
const PADDING_Y = 16;
const MAX_GAIN = 16; // -16dB to +16dB

interface EqualizerPopoverProps {
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const EqualizerPopover: React.FC<EqualizerPopoverProps> = ({ onClose, triggerRef }) => {
  const { eqPreset, eqBands, eqPreAmp, setEqPreset, setEqBand, setEqPreAmp } = usePlayerStore();
  const presetsScrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Local drag bands to avoid synchronous localStorage writes during drag
  const [dragBands, setDragBands] = useState<number[] | null>(null);
  const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null);
  const dragBandsRef = useRef<number[]>(eqBands);

  useEffect(() => {
    dragBandsRef.current = dragBands || eqBands;
  }, [dragBands, eqBands]);

  const currentBands = dragBands || eqBands;

  // Close when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef?.current && triggerRef.current.contains(target)) {
        return;
      }
      if ((target as HTMLElement)?.closest?.('[data-eq-trigger]')) {
        return;
      }
      if (containerRef.current && !containerRef.current.contains(target)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleOutsideClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [onClose]);

  // Horizontal wheel scroll for presets
  const handlePresetsWheel = (e: React.WheelEvent) => {
    if (presetsScrollRef.current) {
      presetsScrollRef.current.scrollLeft += e.deltaY;
    }
  };

  // Convert gain to Y coordinate (0 lag, synchronous)
  const gainToY = useCallback((gain: number) => {
    const usableHeight = SVG_HEIGHT - 2 * PADDING_Y;
    const clampedGain = Math.max(-MAX_GAIN, Math.min(MAX_GAIN, gain));
    return (SVG_HEIGHT / 2) - (clampedGain / MAX_GAIN) * (usableHeight / 2);
  }, []);

  // Convert Y coordinate to gain
  const yToGain = useCallback((y: number) => {
    const usableHeight = SVG_HEIGHT - 2 * PADDING_Y;
    const normalized = (SVG_HEIGHT / 2 - y) / (usableHeight / 2);
    const gain = Math.round(normalized * MAX_GAIN);
    return Math.max(-MAX_GAIN, Math.min(MAX_GAIN, gain));
  }, []);

  // Calculate points from current active bands
  const points = audioService.eqFrequencies.map((_, i) => {
    const usableWidth = SVG_WIDTH - 2 * PADDING_X;
    const x = PADDING_X + (i / (audioService.eqFrequencies.length - 1)) * usableWidth;
    const y = gainToY(currentBands[i] || 0);
    return { x, y };
  });

  // Catmull-Rom cubic spline
  const getSplinePath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i + 2 < pts.length ? pts[i + 2] : p2;

      const c1x = p1.x + (p2.x - p0.x) / 5.5;
      const c1y = p1.y + (p2.y - p0.y) / 5.5;
      const c2x = p2.x - (p3.x - p1.x) / 5.5;
      const c2y = p2.y - (p3.y - p1.y) / 5.5;

      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const splineD = getSplinePath(points);
  const areaD = `${splineD} L ${points[points.length - 1].x.toFixed(1)} ${SVG_HEIGHT} L ${points[0].x.toFixed(1)} ${SVG_HEIGHT} Z`;

  // Zero-lag pointer dragging: update audio instantly, update React state in-flight, commit to zustand on release
  const handlePointerDown = (index: number, e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setActiveDragIndex(index);
    setDragBands([...currentBands]);
  };

  const handlePointerMove = (index: number, e: React.PointerEvent) => {
    if (activeDragIndex !== index || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientY = e.clientY - rect.top;
    const svgY = (clientY / rect.height) * SVG_HEIGHT;
    const newGain = yToGain(svgY);
    
    // 1. Instant audio response
    audioService.setEqBand(index, newGain);

    // 2. Instant local state update for matching visual curve and dot
    const updated = [...dragBandsRef.current];
    updated[index] = newGain;
    dragBandsRef.current = updated;
    setDragBands(updated);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeDragIndex !== null) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}
      const finalGain = dragBandsRef.current[activeDragIndex] || 0;
      setEqBand(activeDragIndex, finalGain);
      setDragBands(null);
      setActiveDragIndex(null);
    }
  };

  // Direct canvas click/drag
  const handleSvgPointerDown = (e: React.PointerEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * SVG_WIDTH;
    const svgY = ((e.clientY - rect.top) / rect.height) * SVG_HEIGHT;

    let closestIdx = 0;
    let minDist = Infinity;
    points.forEach((pt, idx) => {
      const dist = Math.abs(pt.x - svgX);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });

    const newGain = yToGain(svgY);
    audioService.setEqBand(closestIdx, newGain);

    const updated = [...dragBandsRef.current];
    updated[closestIdx] = newGain;
    dragBandsRef.current = updated;
    setDragBands(updated);
    setActiveDragIndex(closestIdx);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleSvgPointerMove = (e: React.PointerEvent) => {
    if (activeDragIndex === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgY = ((e.clientY - rect.top) / rect.height) * SVG_HEIGHT;
    const newGain = yToGain(svgY);
    audioService.setEqBand(activeDragIndex, newGain);

    const updated = [...dragBandsRef.current];
    updated[activeDragIndex] = newGain;
    dragBandsRef.current = updated;
    setDragBands(updated);
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.96 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="absolute top-full mt-2 right-0 w-[410px] bg-[#121215] border border-white/10 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.92)] p-4 flex flex-col gap-3.5 z-50 select-none cursor-default"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Presets Horizontal Scrollable Row */}
      <div 
        ref={presetsScrollRef}
        onWheel={handlePresetsWheel}
        className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1 px-0.5"
      >
        <button
          onClick={() => {
            setDragBands(null);
            setEqPreset('flat', [0, 0, 0, 0, 0, 0], 0);
          }}
          className="w-7 h-7 rounded-full bg-[#1c1c22] hover:bg-[#282830] text-[var(--text-secondary)] hover:text-[var(--text-main)] flex items-center justify-center shrink-0 transition-colors border border-white/10"
          title="Сбросить эквалайзер"
        >
          <Plus size={14} />
        </button>

        {PRESETS.map(p => {
          const isSelected = eqPreset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => {
                setDragBands(null);
                setEqPreset(p.id, p.bands, p.preAmp);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 border ${
                isSelected 
                  ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)] shadow-md shadow-[var(--accent)]/30' 
                  : 'bg-[#1a1a20] border-white/10 text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[#26262e]'
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      {/* Spline Curve Area (Zero-lag real-time tracking) */}
      <div className="relative w-full flex flex-col items-center">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          preserveAspectRatio="none"
          className="w-full h-[140px] cursor-ns-resize overflow-visible"
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handlePointerUp}
        >
          <defs>
            <linearGradient id="popover-eq-glow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.55" />
              <stop offset="60%" stopColor="var(--accent)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Glowing Gradient Area (NO CSS transition to prevent lag!) */}
          <path 
            d={areaD} 
            fill="url(#popover-eq-glow)" 
            className="pointer-events-none"
          />

          {/* Spline Stroke (NO CSS transition to prevent lag!) */}
          <path 
            d={splineD} 
            fill="none" 
            stroke="var(--accent)" 
            strokeWidth="3" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="pointer-events-none"
          />

          {/* Draggable Red Nodes (Zero CSS transition delay, solid accent color) */}
          {points.map((pt, i) => (
            <g key={i}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={activeDragIndex === i ? 7 : 5.5}
                fill="var(--accent)"
                className="cursor-ns-resize"
                onPointerDown={(e) => handlePointerDown(i, e)}
                onPointerMove={(e) => handlePointerMove(i, e)}
                onPointerUp={handlePointerUp}
              />
            </g>
          ))}
        </svg>

        {/* Frequencies under the points */}
        <div className="w-full flex justify-between items-center px-4 mt-1">
          {FREQ_LABELS.map((label) => (
            <span 
              key={label} 
              className="text-[10px] font-mono text-[var(--text-secondary)] tracking-tight text-center min-w-[24px]"
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Pre-amp / Gain Slider (Усиление) */}
      <div className="flex items-center gap-3 pt-2.5 border-t border-white/10">
        <span className="text-[11px] font-medium text-[var(--text-secondary)] shrink-0">Усиление</span>
        <input
          type="range"
          min="-16"
          max="16"
          step="1"
          value={eqPreAmp}
          onChange={(e) => setEqPreAmp(parseFloat(e.target.value))}
          className="flex-1 h-[4px] bg-[#1c1c22] border border-white/10 rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--accent)] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:outline-none hover:[&::-webkit-slider-thumb]:scale-125 transition-transform"
          style={{
            background: `linear-gradient(to right, var(--accent) ${((eqPreAmp + 16) / 32) * 100}%, transparent ${((eqPreAmp + 16) / 32) * 100}%)`
          }}
        />
        <span className="text-[11px] font-mono text-[var(--text-main)] min-w-[28px] text-right font-medium">
          {eqPreAmp > 0 ? `+${eqPreAmp}` : eqPreAmp} dB
        </span>
      </div>

      {/* Close Chevron pointing downwards */}
      <div className="w-full flex items-center justify-center -mb-1 pt-1 border-t border-white/10">
        <button
          onClick={onClose}
          className="text-[var(--text-secondary)] hover:text-white transition-colors p-1 rounded-full hover:bg-white/5 cursor-pointer"
          title="Свернуть эквалайзер"
        >
          <ChevronDown size={18} />
        </button>
      </div>
    </motion.div>
  );
};
