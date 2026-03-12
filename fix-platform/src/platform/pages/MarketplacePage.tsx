/**
 * MarketplacePage — /platform/marketplace
 *
 * Browse marketplace listings with category filter sidebar, search, and price range filter.
 *
 * Features:
 * - Fetches listings from GET /api/platform/marketplace
 * - Category filter sidebar (FOR_SALE, WANTED, FREE, SERVICES)
 * - Search bar to filter by title/description (client-side)
 * - Price range filter (min/max inputs)
 * - Grid of listing cards: title, price, category badge, thumbnail placeholder, seller name
 * - Click listing card → /platform/marketplace/:id
 * - "New Listing" button → /platform/marketplace/new
 * - Loading spinner while fetching
 * - Empty state when no listings match filters
 * - Error state with retry
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { MarketplaceListing, ListingCategory } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { ShoppingBag, Image } from 'lucide-react';
import '../styles/tokens.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES: Array<{ value: ListingCategory; label: string }> = [
  { value: 'FOR_SALE', label: 'For Sale' },
  { value: 'WANTED', label: 'Wanted' },
  { value: 'FREE', label: 'Free' },
  { value: 'SERVICES', label: 'Services' },
];

const CATEGORY_COLORS: Record<ListingCategory, { bg: string; color: string }> = {
  FOR_SALE: { bg: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' },
  WANTED: { bg: 'rgba(201, 146, 27, 0.12)', color: '#c9921b' },
  FREE: { bg: 'rgba(34, 197, 94, 0.12)', color: '#16a34a' },
  SERVICES: { bg: 'rgba(139, 92, 246, 0.12)', color: '#7c3aed' },
};

// ---------------------------------------------------------------------------
// ListingCard
// ---------------------------------------------------------------------------

interface ListingCardProps {
  listing: MarketplaceListing;
}

function ListingCard({ listing }: ListingCardProps) {
  const category = listing.category as ListingCategory;
  const catColors = CATEGORY_COLORS[category] ?? { bg: 'rgba(128,128,128,0.12)', color: '#666' };
  const categoryLabel = CATEGORIES.find(c => c.value === category)?.label ?? category;

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'border-color 0.15s',
  };

  const thumbnailStyle: CSSProperties = {
    width: '100%',
    height: '140px',
    backgroundColor: 'var(--platform-bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };


  const bodyStyle: CSSProperties = {
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flex: 1,
  };

  const headerRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '8px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--platform-text-primary)',
    margin: 0,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const priceStyle: CSSProperties = {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--platform-accent)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  const badgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '999px',
    backgroundColor: catColors.bg,
    color: catColors.color,
    whiteSpace: 'nowrap',
    alignSelf: 'flex-start',
  };

  const sellerStyle: CSSProperties = {
    fontSize: '12px',
    color: 'var(--platform-text-muted)',
    marginTop: 'auto',
  };

  const price =
    listing.price != null
      ? `$${listing.price}`
      : 'Free';

  return (
    <Link
      to={`/platform/marketplace/${listing.id}`}
      style={cardStyle}
      aria-label={listing.title}
      data-testid={`listing-card-${listing.id}`}
    >
      {/* Thumbnail placeholder */}
      <div style={thumbnailStyle} data-testid={`listing-thumbnail-${listing.id}`}>
        <Image size={32} aria-hidden="true" style={{ opacity: 0.3, color: 'var(--platform-text-muted)' }} />
      </div>

      <div style={bodyStyle}>
        {/* Title + Price */}
        <div style={headerRowStyle}>
          <p style={titleStyle}>{listing.title}</p>
          <span style={priceStyle}>{price}</span>
        </div>

        {/* Category badge */}
        <span style={badgeStyle}>{categoryLabel}</span>

        {/* Seller name */}
        <span style={sellerStyle}>by {listing.authorName}</span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// CategoryButton
// ---------------------------------------------------------------------------

interface CategoryButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function CategoryButton({ label, active, onClick }: CategoryButtonProps) {
  const style: CSSProperties = {
    width: '100%',
    textAlign: 'left',
    padding: '10px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    backgroundColor: active ? 'var(--platform-accent)' : 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: active ? 'var(--platform-accent)' : 'transparent',
    fontSize: '14px',
    fontWeight: 600,
    color: active ? '#fff' : 'var(--platform-text-primary)',
    marginBottom: '4px',
    fontFamily: 'inherit',
  };

  return (
    <button
      style={style}
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MarketplacePage() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ListingCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<MarketplaceListing[]>('/api/platform/marketplace');
      setListings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load marketplace listings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const handleRetry = () => {
    loadListings();
  };

  // Client-side filtering
  const filteredListings = listings.filter(listing => {
    // Category filter
    if (selectedCategory && listing.category !== selectedCategory) return false;

    // Search filter (title + description)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesTitle = listing.title.toLowerCase().includes(q);
      const matchesDesc = listing.description.toLowerCase().includes(q);
      if (!matchesTitle && !matchesDesc) return false;
    }

    // Price range filter — skip free items (null price) from price range filtering
    if (listing.price != null) {
      if (minPrice !== '' && listing.price < parseFloat(minPrice)) return false;
      if (maxPrice !== '' && listing.price > parseFloat(maxPrice)) return false;
    }

    return true;
  });

  // ---- Styles ----

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '12px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: 0,
  };

  const newListingBtnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'var(--platform-accent)',
    color: '#fff',
    borderRadius: '6px',
    padding: '8px 18px',
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  };

  const layoutStyle: CSSProperties = {
    display: 'flex',
    gap: '24px',
    alignItems: 'flex-start',
  };

  const sidebarStyle: CSSProperties = {
    width: '220px',
    flexShrink: 0,
  };

  const sidebarSectionStyle: CSSProperties = {
    marginBottom: '24px',
  };

  const sidebarHeaderStyle: CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--platform-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '10px',
    paddingBottom: '8px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border)',
  };

  const mainStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
  };

  const searchStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    marginBottom: '16px',
    fontFamily: 'inherit',
  };

  const priceRowStyle: CSSProperties = {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px',
  };

  const priceInputStyle: CSSProperties = {
    backgroundColor: 'var(--platform-bg)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '7px 10px',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '16px',
  };

  const errorStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#ef4444',
    fontSize: '14px',
    marginBottom: '16px',
  };

  const retryBtnStyle: CSSProperties = {
    backgroundColor: 'transparent',
    color: '#ef4444',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#ef4444',
    borderRadius: '6px',
    padding: '4px 12px',
    fontSize: '13px',
    cursor: 'pointer',
    marginLeft: 'auto',
    flexShrink: 0,
    fontFamily: 'inherit',
  };

  // ---- Initial loading state ----

  if (loading && listings.length === 0 && !error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
        <LoadingSpinner label="Loading marketplace..." />
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h1 style={titleStyle}>Marketplace</h1>
        <Link to="/platform/marketplace/new" style={newListingBtnStyle} aria-label="New Listing">
          + New Listing
        </Link>
      </div>

      {/* Error banner */}
      {error && (
        <div style={errorStyle} role="alert">
          <span>Failed to load marketplace: {error}</span>
          <button
            style={retryBtnStyle}
            onClick={handleRetry}
            aria-label="Retry"
          >
            Retry
          </button>
        </div>
      )}

      {/* Layout */}
      <div style={layoutStyle}>
        {/* Sidebar */}
        <div style={sidebarStyle}>
          {/* Category filter */}
          <div style={sidebarSectionStyle}>
            <div style={sidebarHeaderStyle}>Category</div>
            <CategoryButton
              label="All"
              active={selectedCategory === null}
              onClick={() => setSelectedCategory(null)}
            />
            {CATEGORIES.map(cat => (
              <CategoryButton
                key={cat.value}
                label={cat.label}
                active={selectedCategory === cat.value}
                onClick={() => setSelectedCategory(cat.value)}
              />
            ))}
          </div>

          {/* Price range filter */}
          <div style={sidebarSectionStyle}>
            <div style={sidebarHeaderStyle}>Price Range</div>
            <div style={priceRowStyle}>
              <input
                type="number"
                min={0}
                step="0.01"
                style={priceInputStyle}
                value={minPrice}
                onChange={e => setMinPrice(e.target.value)}
                placeholder="Min"
                aria-label="Min price"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                style={priceInputStyle}
                value={maxPrice}
                onChange={e => setMaxPrice(e.target.value)}
                placeholder="Max"
                aria-label="Max price"
              />
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={mainStyle}>
          {/* Search */}
          <input
            type="text"
            placeholder="Search listings..."
            style={searchStyle}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search listings"
          />

          {/* Loading (while refreshing) */}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <LoadingSpinner label="Loading listings..." />
            </div>
          )}

          {/* Listing grid */}
          {!loading && filteredListings.length === 0 && !error ? (
            <EmptyState
              icon={<ShoppingBag size={22} />}
              message="No listings found"
              description={
                searchQuery || selectedCategory || minPrice || maxPrice
                  ? 'Try adjusting your filters.'
                  : 'Be the first to post a listing!'
              }
            />
          ) : !loading ? (
            <div style={gridStyle} data-testid="listings-grid">
              {filteredListings.map(listing => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
