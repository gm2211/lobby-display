/**
 * SpeedSlider - Shared range slider for speed settings.
 *
 * PURPOSE:
 * Replaces number-only inputs with a visual range slider + number input combo.
 * Used for scroll speed, ticker speed, and page speed settings.
 *
 * BEHAVIOR:
 * - Slider drag updates local state only (instant visual feedback)
 * - onCommit fires on pointer release (slider) or blur/Enter (number input)
 * - External prop changes sync via useEffect
 *
 * RELATED FILES:
 * - src/components/admin/sections/EventsSection.tsx
 * - src/components/admin/sections/AdvisoriesSection.tsx
 * - src/components/admin/sections/ServicesSection.tsx
 */
import { useState, useEffect, useId } from 'react';
import { inputStyle } from '../../styles/admin';

interface SpeedSliderProps {
  /** Label text, e.g. "Scroll speed" or "Page speed" */
  label: string;
  /** Current speed in seconds (from config) */
  value: number;
  /** Called ONLY on pointer release or number input blur/Enter */
  onCommit: (val: number) => void;
}

/** CSS for range input styling (webkit + moz) */
const sliderCSS = `
  .speed-slider-range {
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  }
  .speed-slider-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #1a5c5a;
    cursor: pointer;
    border-width: 1px;
    border-style: solid;
    border-color: rgba(0, 0, 0, 0.1);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }
  .speed-slider-range::-webkit-slider-thumb:hover {
    background: #0f3d3b;
  }
  .speed-slider-range::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #1a5c5a;
    cursor: pointer;
    border-width: 1px;
    border-style: solid;
    border-color: rgba(0, 0, 0, 0.1);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }
  .speed-slider-range::-moz-range-thumb:hover {
    background: #0f3d3b;
  }
  .speed-slider-range::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: #ddd;
  }
`;

export function SpeedSlider({ label, value, onCommit }: SpeedSliderProps) {
  const [localValue, setLocalValue] = useState(value);
  const tickListId = useId();

  // Sync local state when prop changes externally (e.g. snapshot restore)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Compute background gradient for webkit (filled portion)
  const pct = (localValue / 60) * 100;
  const trackBackground = `linear-gradient(to right, #1a5c5a ${pct}%, #ddd ${pct}%)`;

  const ticks = Array.from({ length: 13 }, (_, i) => i * 5); // 0, 5, 10, ... 60

  return (
    <div style={{ marginTop: '12px' }}>
      <style>{sliderCSS}</style>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#333',
          fontSize: '14px',
        }}
      >
        <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
        <input
          className="speed-slider-range"
          type="range"
          min={0}
          max={60}
          step={1}
          list={tickListId}
          value={localValue}
          onChange={e => setLocalValue(Number(e.target.value))}
          onPointerUp={() => onCommit(localValue)}
          onKeyUp={e => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
                e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              onCommit(localValue);
            }
          }}
          style={{
            flex: 1,
            minWidth: '120px',
            background: trackBackground,
          }}
        />
        <datalist id={tickListId}>
          {ticks.map(t => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <input
          type="number"
          min={0}
          max={60}
          value={localValue}
          onChange={e => setLocalValue(Number(e.target.value))}
          onBlur={() => {
            const clamped = Math.max(0, Math.min(60, localValue));
            setLocalValue(clamped);
            onCommit(clamped);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              (e.target as HTMLInputElement).blur();
            }
          }}
          style={{
            ...inputStyle,
            width: '55px',
            textAlign: 'center',
            padding: '6px 4px',
          }}
        />
        <span style={{ whiteSpace: 'nowrap', color: '#888', fontSize: '13px' }}>
          {localValue === 0 ? 'Stopped' : 'seconds'}
        </span>
      </div>
    </div>
  );
}
