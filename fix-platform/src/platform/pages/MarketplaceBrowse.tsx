/**
 * MarketplaceBrowse page — /platform/marketplace
 *
 * Resident-facing marketplace browse page.
 *
 * Features:
 * - Grid/list of listings: title, category badge, price, posted date
 * - Click → navigate to /platform/marketplace/:id
 * - Category filter (All, FOR_SALE, WANTED, FREE, SERVICES)
 * - Client-side search by title
 * - "New Listing" button → /platform/marketplace/new
 * - Loading, empty, error states
 *
 * API: GET /api/platform/marketplace → { listings, pagination }
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { AlertTriangle, ShoppingBag } from 'lucide-react';
import '../styles/tokens.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ListingImage {
  id: string;
  listingId: string;
  url: string;
  sortOrder: number;
}

interface MarketplaceListing {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  price: string | null;
  category: string;
  condition: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  images: ListingImage[];
}

interface MarketplaceListResponse {
  listings: MarketplaceListing[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

type CategoryFilter = '' | 'FOR_SALE' | 'WANTED' | 'FREE' | 'SERVICES';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(price: string | null): string {
  if (price === null) return 'Free';
  const num = parseFloat(price);
  if (isNaN(num)) return 'Free';
  return `$${num.toFixed(2).replace(/\.00$/, '')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCategory(category: string): string {
  switch (category) {
    case 'FOR_SALE': return 'For Sale';
    case 'WANTED': return 'Wanted';
    case 'FREE': return 'Free';
    case 'SERVICES': return 'Services';
    default: return category;
  }
}

function getCategoryColor(category: string): { bg: string; text: string; border: string } {
  switch (category) {
    case 'FOR_SALE':
      return {
        bg: 'rgba(59, 130, 246, 0.1)',
        text: 'var(--platform-accent)',
        border: 'var(--platform-accent)',
      };
    case 'WANTED':
      return {
        bg: 'rgba(245, 158, 11, 0.1)',
        text: '#f59e0b',
        border: '#f59e0b',
      };
    case 'FREE':
      return {
        bg: 'rgba(34, 197, 94, 0.1)',
        text: 'var(--platform-status-available)',
        border: 'var(--platform-status-available)',
      };
    case 'SERVICES':
      return {
        bg: 'rgba(168, 85, 247, 0.1)',
        text: '#a855f7',
        border: '#a855f7',
      };
    default:
      return {
        bg: 'rgba(107, 114, 128, 0.1)',
        text: 'var(--platform-text-secondary)',
        border: 'var(--platform-border)',
      };
  }
}

// ---------------------------------------------------------------------------
// ListingCard
// ---------------------------------------------------------------------------

interface ListingCardProps {
  listing: MarketplaceListing;
}

function ListingCard({ listing }: ListingCardProps) {
  const [hovered, setHovered] = useState(false);
  const catColors = getCategoryColor(listing.category);
  const isFree = listing.price === null || parseFloat(listing.price) === 0;

  const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '18px 20px',
    backgroundColor: hovered ? 'var(--platform-surface-hover)' : 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hovered ? 'var(--platform-accent)' : 'var(--platform-border)',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
    boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.10)' : '0 1px 4px rgba(0,0,0,0.07)',
    textDecoration: 'none',
    color: 'inherit',
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '10px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: 0,
    flex: 1,
    lineHeight: 1.3,
  };

  const priceStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: isFree ? 'var(--platform-status-available)' : 'var(--platform-text-primary)',
    flexShrink: 0,
    whiteSpace: 'nowrap' as const,
  };

  const categoryBadgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    backgroundColor: catColors.bg,
    color: catColors.text,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: catColors.border,
    width: 'fit-content',
  };

  const metaStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap' as const,
  };

  const metaItemStyle: CSSProperties = {
    fontSize: '12px',
    color: 'var(--platform-text-secondary)',
  };

  return (
    <Link
      to={`/platform/marketplace/${listing.id}`}
      style={cardStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={listing.title}
      data-testid={`listing-card-${listing.id}`}
    >
      {/* Category badge */}
      <div style={categoryBadgeStyle}>{formatCategory(listing.category)}</div>

      {/* Header: title + price */}
      <div style={headerStyle}>
        <h3 style={titleStyle}>{listing.title}</h3>
        <span style={priceStyle}>{formatPrice(listing.price)}</span>
      </div>

      {/* Description excerpt */}
      {listing.description && (
        <p
          style={{
            margin: 0,
            fontSize: '13px',
            color: 'var(--platform-text-secondary)',
            lineHeight: 1.5,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
          }}
        >
          {listing.description}
        </p>
      )}

      {/* Meta */}
      <div style={metaStyle}>
        <span style={metaItemStyle}>Posted {formatDate(listing.createdAt)}</span>
        {listing.condition && (
          <span style={metaItemStyle}>Condition: {listing.condition}</span>
        )}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const CATEGORY_FILTERS: { label: string; value: CategoryFilter }[] = [
  { label: 'All', value: '' },
  { label: 'For Sale', value: 'FOR_SALE' },
  { label: 'Wanted', value: 'WANTED' },
  { label: 'Free', value: 'FREE' },
  { label: 'Services', value: 'SERVICES' },
];

export default function MarketplaceBrowse() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<MarketplaceListResponse>('/api/platform/marketplace');
      setListings(data.listings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  // Client-side filtering
  const filtered = listings.filter((l) => {
    if (categoryFilter && l.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!l.title.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // --- Styles ---

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '1100px',
    margin: '0 auto',
  };

  const headerRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap' as const,
    gap: '16px',
    marginBottom: '24px',
  };

  const titleBlockStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: 0,
  };

  const subtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    margin: 0,
  };

  const newListingLinkStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '9px 20px',
    backgroundColor: 'var(--platform-accent)',
    color: '#fff',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
    transition: 'opacity 0.15s',
  };

  const controlsStyle: CSSProperties = {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    marginBottom: '20px',
  };

  const searchInputStyle: CSSProperties = {
    padding: '8px 14px',
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    minWidth: '200px',
    flex: 1,
    maxWidth: '320px',
    fontFamily: 'inherit',
  };

  const filterBtnStyle = (active: boolean): CSSProperties => ({
    padding: '7px 14px',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    backgroundColor: active ? 'var(--platform-accent)' : 'var(--platform-surface)',
    color: active ? '#fff' : 'var(--platform-text-secondary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: active ? 'var(--platform-accent)' : 'var(--platform-border)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
    whiteSpace: 'nowrap' as const,
  });

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
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
    textAlign: 'center' as const,
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
    fontFamily: 'inherit',
  };

  return (
    <div style={pageStyle}>
      {/* Page header */}
      <div style={headerRowStyle}>
        <div style={titleBlockStyle}>
          <h1 style={titleStyle}>Marketplace</h1>
          <p style={subtitleStyle}>Browse resident listings: items, services, and more</p>
        </div>
        <Link
          to="/platform/marketplace/new"
          style={newListingLinkStyle}
          aria-label="New Listing"
        >
          <span aria-hidden="true">+</span>
          <span>New Listing</span>
        </Link>
      </div>

      {/* Controls: search + category filter */}
      <div style={controlsStyle}>
        <input
          type="text"
          placeholder="Search listings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={searchInputStyle}
          aria-label="Search listings"
        />
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
          {CATEGORY_FILTERS.map(({ label, value }) => (
            <button
              key={value || 'all'}
              style={filterBtnStyle(categoryFilter === value)}
              onClick={() => setCategoryFilter(value)}
              aria-pressed={categoryFilter === value}
            >
              {label}
            </button>
          ))}
        </div>
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
          <button style={retryBtnStyle} onClick={fetchListings} aria-label="Retry">
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag size={22} />}
              message="No listings found"
              description={
                categoryFilter || searchQuery
                  ? 'Try adjusting your filters or search.'
                  : 'No marketplace listings yet. Be the first to post!'
              }
            />
          ) : (
            <div style={gridStyle}>
              {filtered.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
