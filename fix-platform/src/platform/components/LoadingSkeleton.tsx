/**
 * LoadingSkeleton — Content placeholder skeleton for loading states.
 *
 * PURPOSE:
 * Renders shimmering placeholder blocks to represent content that is
 * still being loaded. Supports row and card variants.
 *
 * USAGE:
 * ```tsx
 * // Simple rows (default):
 * <LoadingSkeleton rows={3} />
 *
 * // Card layout:
 * <LoadingSkeleton variant="card" rows={2} />
 *
 * // Custom widths per row:
 * <LoadingSkeleton rowWidths={['100%', '75%', '50%']} />
 * ```
 *
 * GOTCHAS:
 * - Shimmer uses CSS keyframes injected once per document
 * - Uses all-longhand CSS properties (no shorthand mixing)
 */
import type { CSSProperties } from 'react';

type SkeletonVariant = 'rows' | 'card';

interface LoadingSkeletonProps {
  /** Number of skeleton rows/cards to show. Default: 3 */
  rows?: number;
  /** Layout variant. Default: 'rows' */
  variant?: SkeletonVariant;
  /** Per-row width overrides (CSS width values). Falls back to default widths. */
  rowWidths?: string[];
}

const SHIMMER_KEYFRAMES = `
@keyframes __skeleton-shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
`;

let _shimmerInjected = false;

function injectShimmer() {
  if (_shimmerInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = SHIMMER_KEYFRAMES;
  document.head.appendChild(style);
  _shimmerInjected = true;
}

const DEFAULT_ROW_WIDTHS = ['100%', '85%', '70%', '90%', '60%'];

const shimmerBase: CSSProperties = {
  borderRadius: '4px',
  backgroundImage: 'linear-gradient(90deg, #eeeeee 25%, #f5f5f5 50%, #eeeeee 75%)',
  backgroundSize: '800px 100%',
  animation: '__skeleton-shimmer 1.4s ease-in-out infinite',
};

export function LoadingSkeleton({
  rows = 3,
  variant = 'rows',
  rowWidths,
}: LoadingSkeletonProps) {
  injectShimmer();

  if (variant === 'card') {
    return (
      <div style={styles.cardGrid} aria-busy="true" aria-label="Loading...">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={styles.card}>
            {/* Card thumbnail */}
            <div style={{ ...shimmerBase, ...styles.cardThumb }} />
            <div style={styles.cardBody}>
              {/* Title line */}
              <div style={{ ...shimmerBase, ...styles.cardTitle, width: '70%' }} />
              {/* Subtitle line */}
              <div style={{ ...shimmerBase, ...styles.cardSubtitle, width: '50%' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Default: rows variant
  return (
    <div style={styles.rowContainer} aria-busy="true" aria-label="Loading...">
      {Array.from({ length: rows }).map((_, i) => {
        const width = rowWidths?.[i] ?? DEFAULT_ROW_WIDTHS[i % DEFAULT_ROW_WIDTHS.length];
        return (
          <div
            key={i}
            style={{ ...shimmerBase, ...styles.row, width }}
          />
        );
      })}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  rowContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '4px 0',
  },
  row: {
    height: '16px',
  },
  cardGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  card: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
    background: '#fafafa',
    borderRadius: '8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#eee',
    padding: '12px',
  },
  cardThumb: {
    width: '48px',
    height: '48px',
    borderRadius: '8px',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingTop: '4px',
  },
  cardTitle: {
    height: '14px',
  },
  cardSubtitle: {
    height: '12px',
  },
};
