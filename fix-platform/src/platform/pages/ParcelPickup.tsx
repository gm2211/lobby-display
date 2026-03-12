/**
 * ParcelPickup Page — /platform/parcels/:id/pickup
 *
 * Pickup confirmation page for a single parcel.
 * Only accessible to CONCIERGE/MANAGER/SECURITY roles.
 *
 * Features:
 * - Fetches parcel from GET /api/platform/parcels/:id
 * - Displays: tracking number, carrier, recipient name, unit number,
 *   description, status badge, received date
 * - Confirm Pickup button calls PUT /api/platform/parcels/:id/pickup
 * - Shows picked-up state if status is already PICKED_UP
 * - Back link to /platform/parcels
 * - Loading, error, not-found states
 *
 * RELATED FILES:
 * - server/routes/platform/parcels.ts        - API endpoints
 * - src/platform/types.ts                    - Parcel type
 * - tests/component/platform/ParcelPickup.test.tsx
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Parcel, ParcelStatus } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Package, AlertTriangle } from 'lucide-react';
import '../styles/tokens.css';

// --- Status badge config ---

type StatusConfig = { label: string; color: string; bg: string };

const STATUS_CONFIG: Record<ParcelStatus, StatusConfig> = {
  RECEIVED:  { label: 'Received',  color: 'var(--platform-status-received)',  bg: 'var(--platform-status-received-bg)' },
  NOTIFIED:  { label: 'Notified',  color: 'var(--platform-status-notified)',  bg: 'var(--platform-status-notified-bg)' },
  PICKED_UP: { label: 'Picked Up', color: 'var(--platform-status-picked-up)', bg: 'var(--platform-status-picked-up-bg)' },
};

// --- Helper functions ---

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// --- Sub-components ---

function StatusBadge({ status }: { status: ParcelStatus }) {
  const { label, color, bg } = STATUS_CONFIG[status];
  const style: CSSProperties = {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 600,
    color,
    backgroundColor: bg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color,
    whiteSpace: 'nowrap',
  };
  return (
    <span style={style} data-testid={`status-badge-${status}`}>
      {label}
    </span>
  );
}

function InfoRow({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--platform-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </span>
      <span
        data-testid={testId}
        style={{
          fontSize: '15px',
          color: 'var(--platform-text-primary)',
          fontWeight: 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// --- Main component ---

export default function ParcelPickup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await api.get<Parcel>(`/api/platform/parcels/${id}`);
      setParcel(data);
    } catch (err) {
      if (
        (err instanceof Error && err.message.includes('404')) ||
        (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404)
      ) {
        setNotFound(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load parcel');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleConfirmPickup = async () => {
    if (!id) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const updated = await api.put<Parcel>(`/api/platform/parcels/${id}/pickup`, {});
      setParcel(updated);
      setConfirmed(true);
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Failed to confirm pickup');
    } finally {
      setConfirming(false);
    }
  };

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
    background: 'transparent',
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
    overflow: 'hidden',
    marginBottom: '20px',
  };

  const cardHeaderStyle: CSSProperties = {
    padding: '20px 24px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border)',
    backgroundColor: 'var(--platform-bg)',
  };

  const cardBodyStyle: CSSProperties = {
    padding: '24px',
  };

  const sectionTitleStyle: CSSProperties = {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--platform-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '0',
    marginTop: 0,
  };

  const h1Style: CSSProperties = {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: '0 0 8px',
  };

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '20px',
    marginBottom: '24px',
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

  const confirmBtnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    backgroundColor: '#2e7d32',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#2e7d32',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 600,
    cursor: confirming ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
    opacity: confirming ? 0.7 : 1,
  };

  const successStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    backgroundColor: '#f0fff4',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#2e7d32',
    borderRadius: '8px',
    color: '#2e7d32',
    fontSize: '14px',
  };

  const alreadyPickedUpStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '16px 20px',
    backgroundColor: '#f0fff4',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#2e7d32',
    borderRadius: '8px',
    color: '#2e7d32',
    fontSize: '14px',
  };

  // --- Render states ---

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
        <LoadingSpinner size="lg" label="Loading parcel..." />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={pageStyle}>
        <button style={backBtnStyle} onClick={() => navigate('/platform/parcels')}>
          <span>←</span>
          <span>Back to parcels</span>
        </button>
        <div
          style={{
            ...cardStyle,
            padding: '48px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div><Package size={48} color="#888" /></div>
          <h1 style={{ ...h1Style, fontSize: '20px' }}>Parcel not found</h1>
          <p style={{ color: 'var(--platform-text-secondary)', fontSize: '14px', margin: 0 }}>
            This parcel may have been removed or does not exist.
          </p>
        </div>
      </div>
    );
  }

  if (error || !parcel) {
    return (
      <div style={pageStyle}>
        <button style={backBtnStyle} onClick={() => navigate('/platform/parcels')}>
          <span>←</span>
          <span>Back to parcels</span>
        </button>
        <div style={errorStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          <span>{error ?? 'Failed to load parcel.'}</span>
        </div>
      </div>
    );
  }

  const isPickedUp = parcel.status === 'PICKED_UP';

  return (
    <div style={pageStyle}>
      {/* Back link */}
      <button
        style={backBtnStyle}
        onClick={() => navigate('/platform/parcels')}
      >
        <span>←</span>
        <span>Back to parcels</span>
      </button>

      {/* Parcel detail card */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <p style={{ ...sectionTitleStyle, marginBottom: '6px' }}>Parcel Pickup</p>
              <h1 style={h1Style}>
                {parcel.trackingNumber}
              </h1>
              <StatusBadge status={parcel.status} />
            </div>
          </div>
        </div>

        <div style={cardBodyStyle}>
          {/* Info grid */}
          <div style={gridStyle}>
            <InfoRow
              label="Tracking Number"
              value={
                <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700 }}>
                  {parcel.trackingNumber}
                </span>
              }
            />
            <InfoRow label="Carrier" value={parcel.carrier} />
            <InfoRow
              label="Recipient"
              value={parcel.recipientName}
            />
            <InfoRow
              label="Unit"
              value={
                <span style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700 }}>
                  {parcel.unitNumber}
                </span>
              }
            />
            <InfoRow
              label="Received"
              value={formatDate(parcel.receivedAt)}
            />
            <InfoRow
              label="Description"
              testId="parcel-description"
              value={parcel.description ?? <span style={{ fontStyle: 'italic', color: 'var(--platform-text-secondary)' }}>—</span>}
            />
          </div>
        </div>
      </div>

      {/* Pickup action card */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <p style={sectionTitleStyle}>Pickup Confirmation</p>
        </div>
        <div style={cardBodyStyle}>
          {isPickedUp ? (
            <div style={alreadyPickedUpStyle} data-testid="pickup-confirmed">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                <span>✓</span>
                <span>Already picked up</span>
              </div>
              {parcel.pickedUpAt && (
                <span style={{ fontSize: '13px', color: 'var(--platform-text-secondary)' }}>
                  Picked up on {formatDate(parcel.pickedUpAt)}
                </span>
              )}
            </div>
          ) : confirmed ? (
            <div style={successStyle} data-testid="pickup-confirmed">
              <span>✓</span>
              <span>Pickup confirmed successfully.</span>
            </div>
          ) : (
            <div>
              <p style={{
                fontSize: '14px',
                color: 'var(--platform-text-secondary)',
                marginBottom: '20px',
                marginTop: 0,
              }}>
                Confirm that this parcel has been picked up by the recipient. This action cannot be undone.
              </p>

              {confirmError && (
                <div style={{ ...errorStyle, marginBottom: '16px' }} role="alert">
                  <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
                  <span>{confirmError}</span>
                </div>
              )}

              <button
                style={confirmBtnStyle}
                onClick={handleConfirmPickup}
                disabled={confirming}
                aria-label="Confirm pickup"
              >
                {confirming ? (
                  <>
                    <LoadingSpinner size="sm" label="Confirming..." />
                    <span>Confirming...</span>
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    <span>Confirm Pickup</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
