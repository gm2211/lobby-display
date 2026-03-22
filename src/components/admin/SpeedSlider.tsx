/**
 * SpeedSlider - Shared range slider for speed settings.
 *
 * PURPOSE:
 * Replaces number-only inputs with a visual range slider.
 * Used for scroll speed, ticker speed, and page speed settings.
 *
 * BEHAVIOR:
 * - Slider represents "speed": left = slow/stopped, right = fast
 * - Internally converts between speed (UI) and seconds (config)
 *   speed 0 = stopped (0 seconds), speed N = 61-N seconds
 * - Slider drag updates local state only (instant visual feedback)
 * - onCommit fires on pointer release (slider) or keyboard arrows
 * - External prop changes sync via useEffect
 *
 * RELATED FILES:
 * - src/components/admin/sections/EventsSection.tsx
 * - src/components/admin/sections/AdvisoriesSection.tsx
 * - src/components/admin/sections/ServicesSection.tsx
 */
import { useState, useEffect, useId } from 'react';

interface SpeedSliderProps {
  /** Label text, e.g. "Scroll speed" or "Page speed" */
  label: string;
  /** Current speed in seconds (from config). 0 = stopped, higher = slower. */
  value: number;
  /** Called ONLY on pointer release or keyboard arrow keys */
  onCommit: (val: number) => void;
}

/** Convert seconds (config value) to speed (slider value). */
function secondsToSpeed(seconds: number): number {
  if (seconds === 0) return 0;
  return Math.max(1, Math.min(60, 61 - seconds));
}

/** Convert speed (slider value) to seconds (config value). */
function speedToSeconds(speed: number): number {
  if (speed === 0) return 0;
  return Math.max(1, Math.min(60, 61 - speed));
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
    background: var(--theme-color-primary-500);
    cursor: pointer;
    border-width: 1px;
    border-style: solid;
    border-color: rgba(0, 0, 0, 0.1);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }
  .speed-slider-range::-webkit-slider-thumb:hover {
    background: var(--theme-color-primary-700);
  }
  .speed-slider-range::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--theme-color-primary-500);
    cursor: pointer;
    border-width: 1px;
    border-style: solid;
    border-color: rgba(0, 0, 0, 0.1);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }
  .speed-slider-range::-moz-range-thumb:hover {
    background: var(--theme-color-primary-700);
  }
  .speed-slider-range::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: #ddd;
  }
`;

export function SpeedSlider({ label, value, onCommit }: SpeedSliderProps) {
  const [localSpeed, setLocalSpeed] = useState(() => secondsToSpeed(value));
  const tickListId = useId();

  // Sync local state when prop changes externally (e.g. snapshot restore)
  useEffect(() => {
    setLocalSpeed(secondsToSpeed(value));
  }, [value]);

  // Compute background gradient for webkit (filled portion)
  const pct = (localSpeed / 60) * 100;
  const trackBackground = `linear-gradient(to right, var(--theme-color-primary-500) ${pct}%, #ddd ${pct}%)`;

  const ticks = Array.from({ length: 13 }, (_, i) => i * 5); // 0, 5, 10, ... 60

  const seconds = speedToSeconds(localSpeed);

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
        <span style={{ fontSize: '11px', color: '#aaa', whiteSpace: 'nowrap' }}>Slow</span>
        <input
          className="speed-slider-range"
          type="range"
          min={0}
          max={60}
          step={1}
          list={tickListId}
          value={localSpeed}
          onChange={e => setLocalSpeed(Number(e.target.value))}
          onPointerUp={() => onCommit(speedToSeconds(localSpeed))}
          onKeyUp={e => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
                e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              onCommit(speedToSeconds(localSpeed));
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
        <span style={{ fontSize: '11px', color: '#aaa', whiteSpace: 'nowrap' }}>Fast</span>
        <span style={{ whiteSpace: 'nowrap', color: '#888', textAlign: 'center', lineHeight: '1.2' }}>
          {localSpeed === 0
            ? <span style={{ fontSize: '13px' }}>Off</span>
            : <>
                <span style={{ fontSize: '13px' }}>{seconds}s</span>
                <br />
                <span style={{ fontSize: '9px', color: '#aaa' }}>per cycle</span>
              </>
          }
        </span>
      </div>
    </div>
  );
}
