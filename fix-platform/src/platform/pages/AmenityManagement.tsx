/**
 * AmenityManagement Page — MANAGER+ only
 *
 * Provides a full amenity management interface:
 * - Create amenity form (name, description, location, capacity, pricing)
 * - Edit existing amenities (inline editing per row)
 * - Toggle availability status (active/inactive → maps to availabilityStatus)
 * - Manage rules list (add/remove per amenity)
 * - Loading / error / empty states
 *
 * API:
 * - GET /api/platform/amenities          — list all amenities
 * - POST /api/platform/amenities         — create amenity
 * - PUT /api/platform/amenities/:id      — update amenity
 * - DELETE /api/platform/amenities/:id   — soft-delete amenity
 * - GET /api/platform/amenities/:id      — get amenity with rules
 * - POST /api/platform/amenities/:id/rules     — add rule
 * - DELETE /api/platform/amenities/:id/rules/:ruleId — delete rule
 */
import { useState, useEffect, useCallback, Fragment, type CSSProperties } from 'react';
import type { Amenity, AmenityRule, AvailabilityStatus } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { AlertTriangle, Dumbbell } from 'lucide-react';
import '../styles/tokens.css';

// --- Availability config ---

const AVAILABILITY_CONFIG: Record<
  AvailabilityStatus,
  { label: string; color: string; bg: string }
> = {
  AVAILABLE:   { label: 'Available',   color: '#2d7a47', bg: '#d4edda' },
  LIMITED:     { label: 'Limited',     color: '#c9921b', bg: '#fff3cd' },
  UNAVAILABLE: { label: 'Unavailable', color: '#b93040', bg: '#f8d7da' },
};

// --- Sub-components ---

function AvailabilityBadge({ status, amenityId }: { status: AvailabilityStatus; amenityId: number }) {
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
    <span style={style} data-testid={`availability-badge-${amenityId}`}>
      <span style={dotStyle} aria-hidden="true" />
      {label}
    </span>
  );
}

// --- Types for form state ---

interface CreateFormState {
  name: string;
  description: string;
  location: string;
}

interface EditFormState {
  name: string;
  description: string;
  location: string;
}

// --- Main component ---

export default function AmenityManagement() {
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [createForm, setCreateForm] = useState<CreateFormState>({
    name: '',
    description: '',
    location: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Edit state: which amenity is being edited
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    name: '',
    description: '',
    location: '',
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Rules state: which amenity's rules are expanded
  const [expandedRulesId, setExpandedRulesId] = useState<number | null>(null);
  const [expandedRulesData, setExpandedRulesData] = useState<AmenityRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [newRuleText, setNewRuleText] = useState('');
  const [addRuleLoading, setAddRuleLoading] = useState(false);

  // Per-amenity action loading
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});

  const fetchAmenities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Amenity[] | { items: Amenity[] }>('/api/platform/amenities');
      // Handle both array and paginated response shapes
      const items = Array.isArray(data) ? data : ((data as { items?: Amenity[] }).items ?? []);
      setAmenities(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load amenities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAmenities();
  }, [fetchAmenities]);

  // --- Create amenity ---
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!createForm.name.trim()) {
      setFormError('Amenity name is required');
      return;
    }

    setFormLoading(true);
    try {
      await api.post('/api/platform/amenities', {
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        location: createForm.location.trim(),
        active: true,
        sortOrder: 0,
      });
      setCreateForm({ name: '', description: '', location: '' });
      await fetchAmenities();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create amenity');
    } finally {
      setFormLoading(false);
    }
  };

  // --- Edit amenity ---
  const startEdit = (amenity: Amenity) => {
    setEditingId(amenity.id);
    setEditForm({
      name: amenity.name,
      description: amenity.description ?? '',
      location: amenity.location ?? '',
    });
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleSaveEdit = async (amenityId: number) => {
    setEditLoading(true);
    setEditError(null);
    try {
      await api.put(`/api/platform/amenities/${amenityId}`, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        location: editForm.location.trim(),
      });
      setEditingId(null);
      await fetchAmenities();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setEditLoading(false);
    }
  };

  // --- Availability toggle ---
  const handleToggleAvailability = async (amenity: Amenity) => {
    setActionLoading(prev => ({ ...prev, [amenity.id]: 'toggling' }));
    try {
      // Toggle active state: AVAILABLE → UNAVAILABLE (active=false), UNAVAILABLE → AVAILABLE (active=true)
      const newActive = amenity.availabilityStatus !== 'AVAILABLE';
      await api.put(`/api/platform/amenities/${amenity.id}`, { active: newActive });
      await fetchAmenities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update availability');
    } finally {
      setActionLoading(prev => {
        const next = { ...prev };
        delete next[amenity.id];
        return next;
      });
    }
  };

  // --- Delete amenity ---
  const handleDelete = async (amenityId: number) => {
    setActionLoading(prev => ({ ...prev, [amenityId]: 'deleting' }));
    try {
      await api.del(`/api/platform/amenities/${amenityId}`);
      await fetchAmenities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete amenity');
    } finally {
      setActionLoading(prev => {
        const next = { ...prev };
        delete next[amenityId];
        return next;
      });
    }
  };

  // --- Rules management ---
  const handleManageRules = async (amenity: Amenity) => {
    if (expandedRulesId === amenity.id) {
      setExpandedRulesId(null);
      setExpandedRulesData([]);
      setNewRuleText('');
      return;
    }

    setExpandedRulesId(amenity.id);
    setNewRuleText('');
    setRulesLoading(true);
    try {
      const detail = await api.get<Amenity>(`/api/platform/amenities/${amenity.id}`);
      setExpandedRulesData(detail.rules ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules');
    } finally {
      setRulesLoading(false);
    }
  };

  const handleAddRule = async (amenityId: number) => {
    if (!newRuleText.trim()) return;
    setAddRuleLoading(true);
    try {
      await api.post(`/api/platform/amenities/${amenityId}/rules`, {
        ruleType: 'CUSTOM',
        ruleValue: { text: newRuleText.trim() },
        active: true,
      });
      setNewRuleText('');
      // Reload rules for this amenity
      const detail = await api.get<Amenity>(`/api/platform/amenities/${amenityId}`);
      setExpandedRulesData(detail.rules ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add rule');
    } finally {
      setAddRuleLoading(false);
    }
  };

  const handleRemoveRule = async (amenityId: number, ruleId: number) => {
    try {
      await api.del(`/api/platform/amenities/${amenityId}/rules/${ruleId}`);
      // Reload rules
      const detail = await api.get<Amenity>(`/api/platform/amenities/${amenityId}`);
      setExpandedRulesData(detail.rules ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove rule');
    }
  };

  // --- Styles ---
  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  };

  const headerStyle: CSSProperties = {
    marginBottom: '28px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    marginBottom: '4px',
  };

  const subtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
  };

  const sectionTitleStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    marginBottom: '16px',
  };

  const formCardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '24px',
    marginBottom: '28px',
  };

  const formRowStyle: CSSProperties = {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '16px',
  };

  const fieldGroupStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: '1 1 200px',
    minWidth: '160px',
  };

  const labelStyle: CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--platform-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  const inputStyle: CSSProperties = {
    backgroundColor: 'var(--platform-bg)',
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
  };

  const submitBtnStyle: CSSProperties = {
    backgroundColor: 'var(--platform-accent)',
    color: '#fff',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '6px',
    padding: '9px 24px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: formLoading ? 'not-allowed' : 'pointer',
    alignSelf: 'flex-end',
    opacity: formLoading ? 0.7 : 1,
  };

  const tableContainerStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    overflow: 'hidden',
  };

  const tableStyle: CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  };

  const thStyle: CSSProperties = {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--platform-text-secondary)',
    backgroundColor: 'var(--platform-bg)',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const tdStyle: CSSProperties = {
    padding: '12px 16px',
    color: 'var(--platform-text-primary)',
    verticalAlign: 'middle',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border)',
  };

  const actionBtnStyle = (variant: 'primary' | 'danger' | 'secondary'): CSSProperties => ({
    backgroundColor: 'transparent',
    color: variant === 'primary' ? 'var(--platform-accent)' : variant === 'danger' ? '#b93040' : 'var(--platform-text-secondary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: variant === 'primary' ? 'var(--platform-accent)' : variant === 'danger' ? '#b93040' : 'var(--platform-border)',
    borderRadius: '5px',
    padding: '5px 10px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    marginRight: '6px',
  });

  const errorAlertStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    backgroundColor: 'rgba(185, 48, 64, 0.08)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(185, 48, 64, 0.3)',
    borderRadius: '8px',
    color: '#b93040',
    fontSize: '14px',
    marginBottom: '20px',
  };

  const formErrorStyle: CSSProperties = {
    fontSize: '13px',
    color: '#b93040',
    padding: '8px 12px',
    backgroundColor: 'rgba(185, 48, 64, 0.06)',
    borderRadius: '6px',
    marginTop: '4px',
  };

  const rulesSectionStyle: CSSProperties = {
    padding: '16px',
    backgroundColor: 'var(--platform-bg)',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--platform-border)',
  };

  const ruleItemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    marginBottom: '8px',
    fontSize: '13px',
    color: 'var(--platform-text-primary)',
  };

  const addRuleRowStyle: CSSProperties = {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
  };

  const inlineInputStyle: CSSProperties = {
    ...inputStyle,
    padding: '6px 10px',
    fontSize: '13px',
  };

  // --- Render ---

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h1 style={titleStyle}>Amenity Management</h1>
        <p style={subtitleStyle}>Create, edit, and manage building amenities</p>
      </div>

      {/* Global error */}
      {error && (
        <div style={errorAlertStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Create amenity form */}
      <div style={formCardStyle}>
        <h2 style={sectionTitleStyle}>Create Amenity</h2>
        <form
          onSubmit={handleCreate}
          data-testid="create-amenity-form"
          noValidate
        >
          <div style={formRowStyle}>
            {/* Name */}
            <div style={{ ...fieldGroupStyle, flex: '2 1 240px' }}>
              <label style={labelStyle} htmlFor="amenity-name">
                Name *
              </label>
              <input
                id="amenity-name"
                type="text"
                placeholder="e.g. Rooftop Pool, Fitness Center..."
                style={inputStyle}
                value={createForm.name}
                onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                aria-label="Amenity name"
                data-testid="amenity-name-input"
              />
            </div>

            {/* Location */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="amenity-location">
                Location
              </label>
              <input
                id="amenity-location"
                type="text"
                placeholder="e.g. Floor 3, Rooftop..."
                style={inputStyle}
                value={createForm.location}
                onChange={e => setCreateForm(f => ({ ...f, location: e.target.value }))}
                aria-label="Amenity location"
                data-testid="amenity-location-input"
              />
            </div>

            {/* Submit */}
            <div style={{ ...fieldGroupStyle, justifyContent: 'flex-end', flex: '0 0 auto', minWidth: 'unset' }}>
              <button
                type="submit"
                style={submitBtnStyle}
                disabled={formLoading}
                data-testid="amenity-submit-btn"
              >
                {formLoading ? 'Creating...' : 'Create Amenity'}
              </button>
            </div>
          </div>

          {/* Description row */}
          <div style={{ ...formRowStyle, marginBottom: '0' }}>
            <div style={{ ...fieldGroupStyle, flex: '1 1 100%' }}>
              <label style={labelStyle} htmlFor="amenity-description">
                Description
              </label>
              <textarea
                id="amenity-description"
                placeholder="Brief description of the amenity..."
                style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
                value={createForm.description}
                onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                aria-label="Amenity description"
                data-testid="amenity-description-input"
                rows={2}
              />
            </div>
          </div>

          {/* Form error */}
          {formError && (
            <div style={formErrorStyle} data-testid="form-error">
              {formError}
            </div>
          )}
        </form>
      </div>

      {/* Amenities table */}
      {amenities.length === 0 ? (
        <EmptyState
          message="No amenities found"
          description="Create your first amenity using the form above."
          icon={<Dumbbell size={22} />}
        />
      ) : (
        <div>
          <h2 style={{ ...sectionTitleStyle, marginBottom: '12px' }}>Amenities ({amenities.length})</h2>
          <div style={tableContainerStyle}>
            <table style={tableStyle} aria-label="Amenities list">
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Location</th>
                  <th style={thStyle}>Availability</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {amenities.map(amenity => (
                  <Fragment key={amenity.id}>
                    <tr
                      data-testid={`amenity-row-${amenity.id}`}
                    >
                      {/* Name / description */}
                      <td style={tdStyle}>
                        {editingId === amenity.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <input
                              type="text"
                              style={inlineInputStyle}
                              value={editForm.name}
                              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                              aria-label="Edit amenity name"
                              data-testid={`edit-name-${amenity.id}`}
                            />
                            <input
                              type="text"
                              style={inlineInputStyle}
                              value={editForm.description}
                              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                              aria-label="Edit amenity description"
                              data-testid={`edit-description-${amenity.id}`}
                              placeholder="Description..."
                            />
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontWeight: 600 }}>{amenity.name}</div>
                            {amenity.description && (
                              <div style={{ fontSize: '12px', color: 'var(--platform-text-secondary)', marginTop: '2px' }}>
                                {amenity.description.length > 80
                                  ? amenity.description.slice(0, 80) + '…'
                                  : amenity.description}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Location */}
                      <td style={{ ...tdStyle, color: 'var(--platform-text-secondary)' }}>
                        {editingId === amenity.id ? (
                          <input
                            type="text"
                            style={inlineInputStyle}
                            value={editForm.location}
                            onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                            aria-label="Edit amenity location"
                            data-testid={`edit-location-${amenity.id}`}
                            placeholder="Location..."
                          />
                        ) : (
                          amenity.location ?? '—'
                        )}
                      </td>

                      {/* Availability */}
                      <td style={tdStyle}>
                        <AvailabilityBadge
                          status={amenity.availabilityStatus}
                          amenityId={amenity.id}
                        />
                      </td>

                      {/* Actions */}
                      <td style={tdStyle}>
                        {editingId === amenity.id ? (
                          // Edit mode actions
                          <div data-testid={`edit-form-${amenity.id}`} style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              type="button"
                              style={actionBtnStyle('primary')}
                              onClick={() => handleSaveEdit(amenity.id)}
                              disabled={editLoading}
                              data-testid={`edit-save-${amenity.id}`}
                            >
                              {editLoading ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              style={actionBtnStyle('secondary')}
                              onClick={cancelEdit}
                              data-testid={`edit-cancel-${amenity.id}`}
                            >
                              Cancel
                            </button>
                            {editError && (
                              <span style={{ color: '#b93040', fontSize: '12px', alignSelf: 'center' }}>
                                {editError}
                              </span>
                            )}
                          </div>
                        ) : (
                          // Normal mode actions
                          <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap' }}>
                            {/* Edit */}
                            <button
                              type="button"
                              style={actionBtnStyle('secondary')}
                              onClick={() => startEdit(amenity)}
                              data-testid={`edit-amenity-${amenity.id}`}
                            >
                              Edit
                            </button>

                            {/* Availability toggle */}
                            <button
                              type="button"
                              style={actionBtnStyle(
                                amenity.availabilityStatus === 'AVAILABLE' ? 'danger' : 'primary'
                              )}
                              onClick={() => handleToggleAvailability(amenity)}
                              disabled={!!actionLoading[amenity.id]}
                              data-testid={`availability-toggle-${amenity.id}`}
                            >
                              {actionLoading[amenity.id] === 'toggling'
                                ? 'Updating...'
                                : amenity.availabilityStatus === 'AVAILABLE'
                                  ? 'Set Unavailable'
                                  : 'Set Available'}
                            </button>

                            {/* Rules */}
                            <button
                              type="button"
                              style={actionBtnStyle('secondary')}
                              onClick={() => handleManageRules(amenity)}
                              data-testid={`manage-rules-${amenity.id}`}
                            >
                              {expandedRulesId === amenity.id ? 'Hide Rules' : 'Rules'}
                            </button>

                            {/* Delete */}
                            <button
                              type="button"
                              style={actionBtnStyle('danger')}
                              onClick={() => handleDelete(amenity.id)}
                              disabled={!!actionLoading[amenity.id]}
                              data-testid={`delete-amenity-${amenity.id}`}
                            >
                              {actionLoading[amenity.id] === 'deleting' ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Rules section (expanded) */}
                    {expandedRulesId === amenity.id && (
                      <tr>
                        <td colSpan={4} style={{ padding: 0, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--platform-border)' }}>
                          <div style={rulesSectionStyle} data-testid={`rules-section-${amenity.id}`}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--platform-text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Rules for {amenity.name}
                            </div>

                            {rulesLoading ? (
                              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                                <LoadingSpinner size="sm" />
                              </div>
                            ) : expandedRulesData.length === 0 ? (
                              <p style={{ fontSize: '13px', color: 'var(--platform-text-secondary)', margin: '0 0 12px' }}>
                                No rules defined yet.
                              </p>
                            ) : (
                              <div>
                                {expandedRulesData.map(rule => (
                                  <div
                                    key={rule.id}
                                    style={ruleItemStyle}
                                    data-testid={`rule-item-${rule.id}`}
                                  >
                                    <span>{rule.rule}</span>
                                    <button
                                      type="button"
                                      style={{
                                        backgroundColor: 'transparent',
                                        color: '#b93040',
                                        borderWidth: 1,
                                        borderStyle: 'solid',
                                        borderColor: '#b93040',
                                        borderRadius: '4px',
                                        padding: '3px 8px',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                      }}
                                      onClick={() => handleRemoveRule(amenity.id, rule.id)}
                                      data-testid={`remove-rule-${rule.id}`}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Add rule */}
                            <div style={addRuleRowStyle}>
                              <input
                                type="text"
                                placeholder="Add a new rule..."
                                style={{ ...inlineInputStyle, flex: 1 }}
                                value={newRuleText}
                                onChange={e => setNewRuleText(e.target.value)}
                                aria-label="New rule text"
                                data-testid={`add-rule-input-${amenity.id}`}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddRule(amenity.id);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                style={{
                                  backgroundColor: 'var(--platform-accent)',
                                  color: '#fff',
                                  borderWidth: 0,
                                  borderStyle: 'solid',
                                  borderColor: 'transparent',
                                  borderRadius: '5px',
                                  padding: '6px 16px',
                                  fontSize: '13px',
                                  fontWeight: 500,
                                  cursor: addRuleLoading ? 'not-allowed' : 'pointer',
                                  opacity: addRuleLoading ? 0.7 : 1,
                                }}
                                onClick={() => handleAddRule(amenity.id)}
                                disabled={addRuleLoading}
                                data-testid={`add-rule-btn-${amenity.id}`}
                              >
                                {addRuleLoading ? 'Adding...' : 'Add Rule'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
