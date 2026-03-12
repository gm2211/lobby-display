/**
 * MarketplaceDetail page — /platform/marketplace/:id
 *
 * Shows full marketplace listing detail.
 *
 * Features:
 * - Title (h1), description, category badge, price (or "Free")
 * - Posted date, condition, status (ACTIVE/SOLD/etc)
 * - Contact section with seller info
 * - Edit link (if current user is the author/seller)
 * - Back link to /platform/marketplace
 * - Loading, error, not-found states
 *
 * API: GET /api/platform/marketplace/:id → MarketplaceListing
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
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

interface MarketplaceDetailProps {
  /** The current user's platform user ID — used to show the Edit link. */
  currentSellerId?: string;
}

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

function formatStatus(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'Active';
    case 'SOLD': return 'Sold';
    case 'EXPIRED': return 'Expired';
    case 'REMOVED': return 'Removed';
    default: return status;
  }
}

function getStatusColor(status: string): { bg: string; text: string; border: string } {
  switch (status) {
    case 'ACTIVE':
      return {
        bg: 'rgba(34, 197, 94, 0.1)',
        text: 'var(--platform-status-available)',
        border: 'var(--platform-status-available)',
      };
    case 'SOLD':
      return {
        bg: 'rgba(107, 114, 128, 0.1)',
        text: 'var(--platform-text-secondary)',
        border: 'var(--platform-border)',
      };
    case 'EXPIRED':
    case 'REMOVED':
      return {
        bg: 'rgba(239, 68, 68, 0.1)',
        text: 'var(--platform-status-unavailable)',
        border: 'var(--platform-status-unavailable)',
      };
    default:
      return {
        bg: 'rgba(107, 114, 128, 0.1)',
        text: 'var(--platform-text-secondary)',
        border: 'var(--platform-border)',
      };
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
// Main page
// ---------------------------------------------------------------------------

export default function MarketplaceDetail({ currentSellerId }: MarketplaceDetailProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await api.get<MarketplaceListing>(`/api/platform/marketplace/${id}`);
      setListing(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to load listing';
        if (msg.toLowerCase().includes('not found')) {
          setNotFound(true);
        } else {
          setError(msg);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // --- Styles ---

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '800px',
    margin: '0 auto',
  };

  const backBtnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '24px',
    padding: '6px 12px',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    color: 'var(--platform-text-secondary)',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '12px',
    padding: '28px 32px',
    marginBottom: '20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
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

  // --- Loading ---
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
        <LoadingSpinner size="lg" label="Loading listing..." />
      </div>
    );
  }

  // --- Not found ---
  if (notFound) {
    return (
      <div style={pageStyle}>
        <button style={backBtnStyle} onClick={() => navigate('/platform/marketplace')}>
          <span>←</span>
          <span>Back to Marketplace</span>
        </button>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            padding: '48px',
            textAlign: 'center' as const,
          }}
        >
          <ShoppingBag size={48} color="#888" />
          <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--platform-text-primary)' }}>
            Listing not found
          </h2>
          <p style={{ margin: 0, color: 'var(--platform-text-secondary)', fontSize: '14px' }}>
            This listing may have been removed or is no longer available.
          </p>
        </div>
      </div>
    );
  }

  // --- Error ---
  if (error) {
    return (
      <div style={pageStyle}>
        <button style={backBtnStyle} onClick={() => navigate('/platform/marketplace')}>
          <span>←</span>
          <span>Back to Marketplace</span>
        </button>
        <div style={errorStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{error}
          <button style={retryBtnStyle} onClick={load} aria-label="Retry">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!listing) return null;

  const isOwner = currentSellerId != null && currentSellerId === listing.sellerId;
  const catColors = getCategoryColor(listing.category);
  const statusColors = getStatusColor(listing.status);
  const isFree = listing.price === null || parseFloat(listing.price) === 0;

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
  };

  const statusBadgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    backgroundColor: statusColors.bg,
    color: statusColors.text,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: statusColors.border,
  };

  const editLinkStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 16px',
    backgroundColor: 'transparent',
    color: 'var(--platform-accent)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-accent)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    textDecoration: 'none',
    transition: 'background 0.15s, color 0.15s',
  };

  return (
    <div style={pageStyle}>
      {/* Back button */}
      <button style={backBtnStyle} onClick={() => navigate('/platform/marketplace')}>
        <span>←</span>
        <span>Back to Marketplace</span>
      </button>

      {/* Main card */}
      <div style={cardStyle}>
        {/* Badges row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
            flexWrap: 'wrap' as const,
          }}
        >
          <span style={categoryBadgeStyle}>{formatCategory(listing.category)}</span>
          <span style={statusBadgeStyle}>{formatStatus(listing.status)}</span>
        </div>

        {/* Title + price row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
            marginBottom: '16px',
            flexWrap: 'wrap' as const,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: '26px',
              fontWeight: 700,
              color: 'var(--platform-text-primary)',
              lineHeight: 1.3,
              flex: 1,
            }}
          >
            {listing.title}
          </h1>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: isFree ? 'var(--platform-status-available)' : 'var(--platform-text-primary)',
              flexShrink: 0,
            }}
          >
            {formatPrice(listing.price)}
          </div>
        </div>

        {/* Description */}
        <p
          style={{
            margin: '0 0 20px',
            fontSize: '15px',
            color: 'var(--platform-text-primary)',
            lineHeight: 1.7,
          }}
        >
          {listing.description}
        </p>

        {/* Divider */}
        <div
          style={{
            height: '1px',
            backgroundColor: 'var(--platform-border)',
            marginBottom: '20px',
          }}
        />

        {/* Meta info */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap' as const,
            gap: '20px',
            marginBottom: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
                color: 'var(--platform-text-secondary)',
              }}
            >
              Posted
            </span>
            <span
              style={{
                fontSize: '14px',
                color: 'var(--platform-text-primary)',
              }}
            >
              {formatDate(listing.createdAt)}
            </span>
          </div>

          {listing.condition && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.06em',
                  color: 'var(--platform-text-secondary)',
                }}
              >
                Condition
              </span>
              <span
                style={{
                  fontSize: '14px',
                  color: 'var(--platform-text-primary)',
                }}
              >
                {listing.condition}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Contact section */}
      <div
        style={{
          backgroundColor: 'var(--platform-surface)',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: 'var(--platform-border)',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--platform-text-primary)',
            marginBottom: '12px',
          }}
        >
          Contact Seller
        </div>
        <p
          style={{
            margin: '0 0 16px',
            fontSize: '14px',
            color: 'var(--platform-text-secondary)',
            lineHeight: 1.5,
          }}
        >
          Interested in this listing? Use the platform messaging system to reach out to the seller directly.
        </p>
        <button
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 24px',
            backgroundColor: 'var(--platform-accent)',
            color: '#fff',
            borderWidth: 0,
            borderStyle: 'solid',
            borderColor: 'transparent',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          aria-label="Contact Seller"
        >
          Contact Seller
        </button>
      </div>

      {/* Edit link (only for owner) */}
      {isOwner && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Link
            to={`/platform/marketplace/${listing.id}/edit`}
            style={editLinkStyle}
            aria-label="Edit listing"
          >
            <span aria-hidden="true">✏️</span>
            <span>Edit Listing</span>
          </Link>
        </div>
      )}
    </div>
  );
}
