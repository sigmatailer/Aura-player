import React, { useState, useEffect, useRef } from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { audioService } from '../services/AudioService';

const PRESETS = [
  { name: 'Нейтральный', id: 'flat', bands: [0, 0, 0, 0, 0, 0], preAmp: 0 },
  { name: 'Басы', id: 'bass', bands: [6, 4, 1, -1, -2, -3], preAmp: -2 },
  { name: 'Высокие', id: 'treble', bands: [-3, -2, -1, 2, 4, 5], preAmp: -2 },
  { name: 'Вокал', id: 'vocal', bands: [-2, -1, 3, 4, 2, 0], preAmp: -1 },
  { name: 'Мощный', id: 'powerful', bands: [5, 3, -1, 2, 4, 5], preAmp: -3 },
];

const VerticalSlider: React.FC<{
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
}> = ({ value, min, max, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const updateFromPointer = (clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clampedY = Math.max(rect.top, Math.min(rect.bottom, clientY));
    const ratio = 1 - (clampedY - rect.top) / rect.height; // 0 at bottom, 1 at top
    const newVal = Math.round(min + ratio * (max - min));
    onChange(newVal);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    updateFromPointer(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.stopPropagation();
      updateFromPointer(e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.touches[0]) {
      updateFromPointer(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.touches[0]) {
      updateFromPointer(e.touches[0].clientY);
    }
  };

  const percent = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      className="relative h-24 w-full min-w-[44px] flex items-center justify-center cursor-pointer select-none touch-none py-1"
    >
      {/* Background Track */}
      <div className="w-1.5 h-full rounded-full bg-[#2a2a2a] relative overflow-hidden pointer-events-none">
        <div
          className="absolute bottom-0 left-0 right-0 bg-[var(--accent)] rounded-full transition-all"
          style={{ height: `${percent}%` }}
        />
      </div>
      {/* Center 0dB mark */}
      <div className="absolute left-1/2 -translate-x-1/2 w-3 h-0.5 bg-white/20 pointer-events-none" style={{ bottom: '50%' }} />
      {/* Thumb Handle */}
      <div
        className="absolute w-5 h-5 rounded-full bg-[var(--accent)] shadow-md shadow-black/80 ring-2 ring-white/30 pointer-events-none active:scale-125 transition-transform"
        style={{
          bottom: `calc(${percent}% - 10px)`
        }}
      />
    </div>
  );
};

export const EqualizerModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { eqPreset, eqBands, eqPreAmp, setEqPreset, setEqBand, setEqPreAmp } = usePlayerStore();

  useEffect(() => {
    const handler = () => setIsOpen(true);
    document.addEventListener('toggle-eq', handler);
    return () => document.removeEventListener('toggle-eq', handler);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}>
      <div 
        className="w-[96vw] max-w-[500px] bg-[var(--bg-surface)] border border-[var(--border-main)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-main)]">
          <div className="flex items-center gap-2 text-[var(--text-main)] font-bold">
            <SlidersHorizontal size={18} />
            Эквалайзер
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 sm:p-6 flex flex-col gap-5">
          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => setEqPreset(p.id, p.bands, p.preAmp)}
                className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${eqPreset === p.id ? 'bg-[var(--accent)] text-[var(--text-main)]' : 'bg-[var(--bg-main)] border border-[var(--border-main)] text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:border-[var(--accent)]'}`}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Bands */}
          <div className="relative flex justify-between items-end h-[210px] gap-1 sm:gap-2 mt-2 px-1">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none z-0">
              <polyline 
                  fill="none" 
                  stroke="rgba(255, 255, 255, 0.4)" 
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  points={audioService.eqFrequencies.map((_, i) => {
                    const val = eqBands[i] || 0;
                    const x = (i + 0.5) * (100 / 6);
                    const y = 20 + (1 - (val + 24) / 48) * 45;
                    return `${x},${y}`;
                  }).join(' ')}
              />
            </svg>
            {audioService.eqFrequencies.map((freq, index) => {
              const labels = ['Саббас', 'Бас', 'Н. Ср', 'Середина', 'В. Ср', 'Высокие'];
              return (
              <div key={freq} className="flex flex-col items-center gap-1.5 flex-1 relative z-10">
                <div className="text-[11px] font-medium text-[var(--accent)] h-4">
                  {eqBands[index] > 0 ? '+' : ''}{eqBands[index] !== 0 ? eqBands[index] : ''}
                </div>
                
                <div className="flex justify-center mb-2">
                  <VerticalSlider
                    value={eqBands[index]}
                    min={-24}
                    max={24}
                    onChange={(val) => setEqBand(index, val)}
                  />
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  {eqBands[index] > 0 ? '+' : ''}{eqBands[index]}
                </div>
                <div className="text-[10px] font-bold text-[var(--text-secondary)] whitespace-nowrap">
                  {freq >= 1000 ? (freq / 1000) + 'k' : freq}
                </div>
                <div className="text-[9px] text-[var(--text-secondary)] opacity-70 whitespace-nowrap text-center">
                  {labels[index]}
                </div>
              </div>
            );})}
          </div>

          {/* Pre-amp */}
          <div className="flex items-center gap-4 pt-2 border-t border-[var(--border-main)] mt-2">
            <div className="text-sm font-bold text-[var(--text-secondary)] w-20">Усиление</div>
            <input
              type="range"
              min="-24"
              max="24"
              step="1"
              value={eqPreAmp}
              onChange={(e) => setEqPreAmp(parseFloat(e.target.value))}
              className="flex-1 h-2 rounded-full appearance-none outline-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, var(--accent) ${((eqPreAmp + 24) / 48) * 100}%, #333333 ${((eqPreAmp + 24) / 48) * 100}%)`,
                border: '1px solid rgba(255,255,255,0.1)'
              }}
            />
            <div className="text-xs font-mono w-8 text-right text-[var(--text-main)]">
              {eqPreAmp > 0 ? '+' : ''}{eqPreAmp}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

