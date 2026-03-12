import { useState, useEffect, useRef, useCallback } from 'react';
import type { Service, BuildingConfig } from '../types';
import { STATUS_COLORS, DEFAULTS } from '../constants';
import { timeAgo } from '../utils/timeAgo';

const ROW_HEIGHT = 40; // pixels per row
const VISIBLE_ROWS = 10; // show all rows for typical lists, only paginate at 11+
const MAX_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;

// Column widths for table-layout: fixed alignment between header and body
const COL_WIDTHS = { service: '22%', status: '6%', notes: '55%', lastChecked: '17%' };

interface Props {
  services: Service[];
  scrollSpeed?: number; // seconds per page, 0 = no auto-scroll
  config?: BuildingConfig | null;
}

export default function ServiceTable({ services, scrollSpeed = DEFAULTS.SERVICES_SCROLL_SPEED, config }: Props) {
  const servicesFontSize = `${config?.servicesFontSize ?? DEFAULTS.SERVICES_FONT_SIZE}px`;
  const notesFontSize = `${config?.notesFontSize ?? DEFAULTS.NOTES_FONT_SIZE}px`;
  const notesFontWeight = config?.notesFontWeight ?? DEFAULTS.NOTES_FONT_WEIGHT;
  const totalRows = services.length;
  const needsScroll = totalRows > VISIBLE_ROWS;
  const totalPages = needsScroll ? Math.ceil(totalRows / VISIBLE_ROWS) : 1;

  const [currentPage, setCurrentPage] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Page transition effect
  const goToPage = useCallback((page: number) => {
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentPage(page);
      setProgress(0); // Reset progress only after page changes
      setTimeout(() => setIsAnimating(false), 50);
    }, 300);
  }, []);

  // Auto-scroll timer with progress tracking
  useEffect(() => {
    if (!needsScroll || scrollSpeed <= 0) return;

    const startTime = Date.now();
    const duration = scrollSpeed * 1000;

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min(elapsed / duration, 1);
      setProgress(newProgress);

      if (newProgress >= 1) {
        const nextPage = (currentPage + 1) % totalPages;
        goToPage(nextPage);
      }
    };

    const interval = setInterval(updateProgress, 50);
    return () => clearInterval(interval);
  }, [needsScroll, scrollSpeed, currentPage, totalPages, goToPage]);

  // Get services for current page
  const startIdx = currentPage * VISIBLE_ROWS;
  const visibleServices = services.slice(startIdx, startIdx + VISIBLE_ROWS);

  // Pad with empty rows if needed to maintain consistent height
  const paddedServices: (Service | null)[] = [...visibleServices];
  while (paddedServices.length < VISIBLE_ROWS && needsScroll) {
    paddedServices.push(null);
  }

  const colgroup = (
    <colgroup>
      <col style={{ width: COL_WIDTHS.service }} />
      <col style={{ width: COL_WIDTHS.status }} />
      <col style={{ width: COL_WIDTHS.notes }} />
      <col style={{ width: COL_WIDTHS.lastChecked }} />
    </colgroup>
  );

  return (
    <div className="service-table-container" style={styles.container}>
      {/* Header table - always visible */}
      <table style={{ ...styles.table, tableLayout: 'fixed', marginBottom: 0 }}>
        {colgroup}
        <thead>
          <tr>
            <th style={styles.th}>Service</th>
            <th style={styles.thStatus}>Status</th>
            <th style={styles.th}>Notes</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Last Updated</th>
          </tr>
        </thead>
      </table>

      {/* Body table - animated on page change */}
      <div
        ref={containerRef}
        className="service-table-wrapper"
        style={{
          ...styles.tableWrapper,
          maxHeight: needsScroll ? MAX_HEIGHT : undefined,
          opacity: isAnimating ? 0 : 1,
          transition: 'opacity 0.3s ease-in-out',
        }}
      >
        <table style={{ ...styles.table, tableLayout: 'fixed' }}>
          {colgroup}
          <tbody>
            {paddedServices.map((s, idx) => (
              s ? (
                <tr key={s.id} style={{ height: ROW_HEIGHT }}>
                  <td style={{ ...styles.td, fontSize: servicesFontSize }}>{s.name}</td>
                  <td style={{...styles.td, textAlign: 'center', padding: '8px 4px'}}>
                    <span style={{ ...styles.dot, background: STATUS_COLORS[s.status] || '#888' }} />
                  </td>
                  <td style={{ ...styles.td, color: '#666', fontStyle: 'italic', fontSize: notesFontSize, fontWeight: notesFontWeight }}>
                    {s.notes || '—'}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right', color: '#888' }}>
                    {timeAgo(s.lastChecked)}
                  </td>
                </tr>
              ) : (
                <tr key={`empty-${idx}`} style={{ height: ROW_HEIGHT }}>
                  <td style={styles.td}>&nbsp;</td>
                  <td style={styles.td}>&nbsp;</td>
                  <td style={styles.td}>&nbsp;</td>
                  <td style={styles.td}>&nbsp;</td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>

      {/* Page indicator (airport-style) */}
      {needsScroll && totalPages > 1 && (
        <div style={styles.pageIndicator}>
          <span style={styles.pageText}>
            Page {currentPage + 1} of {totalPages}
          </span>
          <div style={styles.pageDots}>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => goToPage(i)}
                style={{
                  ...styles.pageDot,
                  background: i === currentPage ? '#00bcd4' : '#ccc',
                  cursor: 'pointer',
                  border: 'none',
                  padding: 0,
                  position: 'relative' as const,
                  overflow: 'hidden',
                }}
                aria-label={`Go to page ${i + 1}`}
              >
                {/* Progress fill for current page */}
                {i === currentPage && scrollSpeed > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${progress * 100}%`,
                    background: 'rgba(255, 255, 255, 0.4)',
                    transition: 'width 50ms linear',
                  }} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#fff',
    borderRadius: 0,
    overflow: 'hidden',
    flexShrink: 0,
  },
  tableWrapper: {
    overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    fontFamily: "'Nunito', sans-serif",
    fontSize: '13px',
    color: '#555',
    fontWeight: 600,
    padding: '10px 20px',
    textAlign: 'left',
    borderBottom: '1px solid #e0d8d0',
    background: '#faf8f5',
  },
  thStatus: {
    fontFamily: "'Nunito', sans-serif",
    fontSize: '13px',
    color: '#555',
    fontWeight: 600,
    padding: '10px 4px',
    textAlign: 'center',
    borderBottom: '1px solid #e0d8d0',
    background: '#faf8f5',
  },
  td: {
    padding: '8px 20px',
    fontSize: '15px',
    color: '#333',
    borderBottom: '1px solid #eee',
  },
  dot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  },
  pageIndicator: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 20px',
    background: '#faf8f5',
    borderTop: '1px solid #e0d8d0',
  },
  pageText: {
    fontSize: '12px',
    color: '#888',
    fontWeight: 500,
  },
  pageDots: {
    display: 'flex',
    gap: '6px',
  },
  pageDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    transition: 'background 0.3s',
  },
};
