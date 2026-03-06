import { useState, useEffect, useRef } from 'react';
import EventCard from './EventCard';
import type { Event } from '../types';

/**
 * Auto-scrolling event cards with seamless loop.
 *
 * Uses CSS transform: translateY() instead of native scrolling because
 * Safari has a bug where scrollTop/scrollBy silently fail on
 * position:absolute + overflow:auto elements inside flexbox containers.
 *
 * How it works:
 * 1. Wrapper clips content with overflow:hidden (not auto)
 * 2. Inner content is translated upward via transform: translateY(-Npx)
 * 3. Content is doubled for seamless looping
 * 4. When offset reaches the first copy's height, it resets to 0
 */
export default function AutoScrollCards({ events, scrollSpeed }: { events: Event[]; scrollSpeed: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const singleRef = useRef<HTMLDivElement>(null);
  const [needsScroll, setNeedsScroll] = useState(false);

  const shouldScroll = events.length > 0 && scrollSpeed > 0;
  const isDoubled = shouldScroll && needsScroll;

  // Check if content overflows and we need scrolling.
  useEffect(() => {
    const container = containerRef.current;
    const singleContent = singleRef.current;
    if (!container || !singleContent || !shouldScroll) {
      setNeedsScroll(false);
      return;
    }
    const checkOverflow = () => {
      setNeedsScroll(singleContent.offsetHeight > container.clientHeight);
    };
    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(container);
    return () => observer.disconnect();
  }, [shouldScroll, events.length]);

  // Run the scroll animation via CSS transform
  const offsetRef = useRef(0);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shouldScroll || !needsScroll) return;
    const container = containerRef.current;
    const inner = innerRef.current;
    const single = singleRef.current;
    if (!container || !inner || !single) return;

    let animId: number;
    let lastTime: number | null = null;
    let accumulated = 0;
    offsetRef.current = 0;

    const step = (time: number) => {
      if (lastTime !== null) {
        const dt = time - lastTime;
        // Single copy height + gap is our wrap point
        const singleHeight = single.offsetHeight + 12; // 12px gap between groups
        const pxPerMs = singleHeight / (scrollSpeed * 1000);
        accumulated += pxPerMs * dt;

        if (accumulated >= 1) {
          const px = Math.floor(accumulated);
          offsetRef.current += px;
          accumulated -= px;

          // Wrap around seamlessly
          if (offsetRef.current >= singleHeight) {
            offsetRef.current -= singleHeight;
          }

          inner.style.transform = `translateY(-${offsetRef.current}px)`;
        }
      }
      lastTime = time;
      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(animId);
      // Reset transform so cards aren't stuck offset when scrolling stops
      offsetRef.current = 0;
      inner.style.transform = '';
    };
  }, [shouldScroll, needsScroll, scrollSpeed, events.length]);

  return (
    <div className="auto-scroll-wrapper" style={styles.cardsWrapper}>
      <div ref={containerRef} className="auto-scroll-container" style={styles.cards}>
        <div ref={innerRef} style={styles.cardsInner}>
          <div ref={singleRef} style={styles.cardsGroup}>
            {events.map((e) => <EventCard key={`orig-${e.id}`} event={e} />)}
          </div>
          {isDoubled && (
            <div style={styles.cardsGroup}>
              {events.map((e) => <EventCard key={`dup-${e.id}`} event={e} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  cardsWrapper: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  cards: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  cardsInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    willChange: 'transform',
  },
  cardsGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
};
