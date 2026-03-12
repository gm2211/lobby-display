/**
 * AmenityListing page — /platform/amenities
 *
 * Displays building amenities in a responsive card grid:
 * - Name, description excerpt, category, capacity, pricing
 * - Availability indicator: available (green), limited (yellow), unavailable (red)
 * - Thumbnail from first image if available
 * - Filter/search by name or category
 * - Click navigates to amenity detail (/platform/amenities/:id)
 * - Responsive: 3 columns desktop, 2 tablet, 1 mobile
 *
 * API: GET /api/platform/amenities → { items: Amenity[], nextCursor? }
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Amenity, AvailabilityStatus, AmenitiesListResponse } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { Users, AlertTriangle, Building2, Dumbbell, MapPin } from 'lucide-react';
import '../styles/tokens.css';

// --- Availability config ---

const AVAILABILITY_CONFIG: Record<
  AvailabilityStatus,
  { label: string; color: string; bg: string }
> = {
  AVAILABLE:   { label: 'Available',   color: 'var(--platform-status-available)',   bg: 'var(--platform-status-available-bg)' },
  LIMITED:     { label: 'Limited',     color: 'var(--platform-status-limited)',     bg: 'var(--platform-status-limited-bg)' },
  UNAVAILABLE: { label: 'Unavailable', color: 'var(--platform-status-unavailable)', bg: 'var(--platform-status-unavailable-bg)' },
};

// --- Sub-components ---

function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  const { label, color, bg } = AVAILABILITY_CONFIG[status];
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 600,
    color,
    backgroundColor: bg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color,
    whiteSpace: 'nowrap',
  };
  const dotStyle: CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: color,
    flexShrink: 0,
  };
  return (
    <span style={style} data-testid={`availability-${status}`}>
      <span style={dotStyle} aria-hidden="true" />
      {label}
    </span>
  );
}

function descriptionExcerpt(text: string, maxLen = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

function formatPrice(pricePerHour: number | null, pricePerDay: number | null): string {
  if (pricePerHour != null) return `$${pricePerHour.toFixed(0)}/hr`;
  if (pricePerDay != null) return `$${pricePerDay.toFixed(0)}/day`;
  return 'Free';
}

// --- Amenity Card ---

interface AmenityCardProps {
  amenity: Amenity;
}

function AmenityCard({ amenity }: AmenityCardProps) {
  const [hovered, setHovered] = useState(false);
  const thumbnail = amenity.images
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];

  const cardStyle: CSSProperties = {
    backgroundColor: hovered ? 'var(--platform-surface-hover)' : 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hovered ? 'var(--platform-accent)' : 'var(--platform-border)',
    borderRadius: '12px',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
    boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.10)' : 'none',
    display: 'flex',
    flexDirection: 'column',
    textDecoration: 'none',
    color: 'inherit',
  };

  const thumbnailStyle: CSSProperties = {
    width: '100%',
    height: '180px',
    objectFit: 'cover',
    display: 'block',
    flexShrink: 0,
  };

  const thumbnailPlaceholderStyle: CSSProperties = {
    width: '100%',
    height: '180px',
    backgroundColor: 'var(--platform-bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '40px',
    flexShrink: 0,
  };

  const bodyStyle: CSSProperties = {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    flex: 1,
  };

  const topRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '8px',
  };

  const nameStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: 0,
    flex: 1,
    lineHeight: 1.3,
  };

  const categoryBadgeStyle: CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '4px',
    backgroundColor: 'var(--platform-bg)',
    color: 'var(--platform-text-secondary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  const descStyle: CSSProperties = {
    fontSize: '13px',
    color: 'var(--platform-text-secondary)',
    lineHeight: 1.5,
    margin: 0,
  };

  const metaRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  };

  const metaItemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '13px',
    color: 'var(--platform-text-secondary)',
  };

  const footerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingTop: '8px',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--platform-border)',
  };

  const priceStyle: CSSProperties = {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--platform-accent)',
  };

  return (
    <Link
      to={`/platform/amenities/${amenity.id}`}
      style={cardStyle}
      data-testid={`amenity-card-${amenity.id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`${amenity.name} — ${AVAILABILITY_CONFIG[amenity.availabilityStatus].label}`}
    >
      {/* Thumbnail */}
      {thumbnail ? (
        <img
          src={thumbnail.url}
          alt={thumbnail.caption ?? amenity.name}
          style={thumbnailStyle}
        />
      ) : (
        <div style={thumbnailPlaceholderStyle} aria-hidden="true">
          <Building2 size={32} color="#ccc" />
        </div>
      )}

      {/* Body */}
      <div style={bodyStyle}>
        {/* Name + Category */}
        <div style={topRowStyle}>
          <h3 style={nameStyle}>{amenity.name}</h3>
          <span style={categoryBadgeStyle}>{amenity.category}</span>
        </div>

        {/* Description */}
        {amenity.description && (
          <p style={descStyle}>{descriptionExcerpt(amenity.description)}</p>
        )}

        {/* Capacity + Location */}
        <div style={metaRowStyle}>
          {amenity.capacity != null && (
            <span style={metaItemStyle}>
              <Users size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }} />
              {amenity.capacity} capacity
            </span>
          )}
          {amenity.location && (
            <span style={metaItemStyle}>
              <MapPin size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }} />
              {amenity.location}
            </span>
          )}
          {amenity.requiresApproval && (
            <span style={{ ...metaItemStyle, color: 'var(--platform-status-limited)' }}>
              <span aria-hidden="true">✓</span>
              Approval required
            </span>
          )}
        </div>

        {/* Footer: Price + Availability */}
        <div style={footerStyle}>
          <span style={priceStyle}>
            {formatPrice(amenity.pricePerHour, amenity.pricePerDay)}
          </span>
          <AvailabilityBadge status={amenity.availabilityStatus} />
        </div>
      </div>
    </Link>
  );
}

// --- Main page ---

export default function AmenityListing() {
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const fetchAmenities = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<AmenitiesListResponse>('/api/platform/amenities');
      setAmenities(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load amenities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAmenities();
  }, [fetchAmenities]);

  // Derive unique categories
  const categories = Array.from(
    new Set(amenities.map(a => a.category).filter(Boolean))
  ).sort();

  // Apply search + category filter (client-side)
  const filtered = amenities.filter(a => {
    if (categoryFilter && a.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !a.name.toLowerCase().includes(q) &&
        !a.category.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  // --- Styles ---

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  };

  const headerStyle: CSSProperties = {
    marginBottom: '24px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: '0 0 4px',
  };

  const subtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    margin: 0,
  };

  const filtersStyle: CSSProperties = {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
    flexWrap: 'wrap',
    alignItems: 'center',
  };

  const searchInputStyle: CSSProperties = {
    flex: '1 1 200px',
    minWidth: '160px',
    padding: '8px 14px',
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
  };

  const selectStyle: CSSProperties = {
    padding: '8px 14px',
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    outline: 'none',
    minWidth: '140px',
  };

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '20px',
  };

  const errorStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '32px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#ef4444',
    fontSize: '14px',
    textAlign: 'center',
  };

  const retryBtnStyle: CSSProperties = {
    padding: '8px 20px',
    backgroundColor: 'transparent',
    color: '#ef4444',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#ef4444',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  };

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h1 style={titleStyle}>Amenities</h1>
        <p style={subtitleStyle}>Browse and book building amenities</p>
      </div>

      {/* Filters */}
      <div style={filtersStyle}>
        <input
          type="text"
          placeholder="Search amenities..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={searchInputStyle}
          aria-label="Search amenities"
        />
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={selectStyle}
            aria-label="Filter by category"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <LoadingSpinner size="lg" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={errorStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{error}
          <button style={retryBtnStyle} onClick={fetchAmenities} aria-label="Retry">
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          message="No amenities found"
          description={
            search || categoryFilter
              ? 'Try adjusting your search or filter.'
              : 'No amenities are available at this time.'
          }
          icon={<Dumbbell size={22} />}
        />
      )}

      {/* Card grid */}
      {!loading && !error && filtered.length > 0 && (
        <>
          <style>{`
            @media (max-width: 900px) {
              .amenity-grid { grid-template-columns: repeat(2, 1fr) !important; }
            }
            @media (max-width: 580px) {
              .amenity-grid { grid-template-columns: 1fr !important; }
            }
          `}</style>
          <div style={gridStyle} className="amenity-grid">
            {filtered.map(amenity => (
              <AmenityCard key={amenity.id} amenity={amenity} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
