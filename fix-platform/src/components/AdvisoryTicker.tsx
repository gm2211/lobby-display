import { useState, useEffect, useRef } from 'react';
import type { Advisory } from '../types';
import { DEFAULTS, COLORS } from '../constants';

/**
 * Horizontal advisory ticker with constant scroll speed.
 *
 * tickerSpeed = seconds for content to cross the viewport width.
 * The px/s rate stays the same regardless of how many advisories exist.
 * Content is doubled for seamless looping (same pattern as AutoScrollCards).
 */
export default function AdvisoryTicker({ advisories, tickerSpeed = DEFAULTS.TICKER_SPEED }: { advisories: Advisory[]; tickerSpeed?: number }) {
  const active = advisories.filter(a => a.active);
  const [shouldScroll, setShouldScroll] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const singleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active.length > 1) {
      setShouldScroll(true);
    } else if (contentRef.current && containerRef.current) {
      setShouldScroll(contentRef.current.scrollWidth > containerRef.current.clientWidth);
    } else {
      setShouldScroll(false);
    }
  }, [active]);

  // Scroll animation via CSS transform (constant speed)
  useEffect(() => {
    if (!shouldScroll || tickerSpeed <= 0) return;
    const container = containerRef.current;
    const inner = innerRef.current;
    const single = singleRef.current;
    if (!container || !inner || !single) return;

    let animId: number;
    let lastTime: number | null = null;
    let offset = 0;

    const step = (time: number) => {
      if (lastTime !== null) {
        const dt = time - lastTime;
        // px/s = containerWidth / tickerSpeed — constant visual speed
        const pxPerMs = container.clientWidth / (tickerSpeed * 1000);
        offset += pxPerMs * dt;

        // singleWidth = width of one copy of the labels
        const singleWidth = single.offsetWidth;
        if (singleWidth > 0 && offset >= singleWidth) {
          offset -= singleWidth;
        }

        inner.style.transform = `translateX(-${offset}px)`;
      }
      lastTime = time;
      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(animId);
      offset = 0;
      inner.style.transform = '';
    };
  }, [shouldScroll, tickerSpeed, active.length]);

  if (active.length === 0) return null;

  const labels = active.map(a => (
    <span key={a.id} style={styles.segment}>
      <span style={styles.message}>{a.message}</span>
    </span>
  ));

  return (
    <div style={styles.ticker} ref={containerRef}>
      <div style={{ ...styles.track, padding: shouldScroll ? '8px 0' : '8px 16px' }}>
        <div ref={innerRef} style={{ ...styles.scroll, willChange: shouldScroll ? 'transform' : 'auto', justifyContent: shouldScroll ? 'flex-start' : 'center' }}>
          <div ref={singleRef} style={styles.group}>
            {labels}
          </div>
          {shouldScroll && <div style={styles.group}>{labels}</div>}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  ticker: {
    background: COLORS.ADVISORY_BG,
    flexShrink: 0,
    overflow: 'hidden',
  },
  track: {
    overflow: 'hidden',
    padding: '8px 0',
  },
  scroll: {
    display: 'inline-flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
  },
  group: {
    display: 'inline-flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
  },
  segment: {
    display: 'inline-flex',
    alignItems: 'center',
    marginRight: '60px',
  },
  message: {
    fontSize: '18px',
    fontWeight: 500,
    color: '#222',
    whiteSpace: 'nowrap',
  },
};
