/**
 * ServicesSection - Service status management section.
 *
 * PURPOSE:
 * Manages building service statuses (elevators, HVAC, etc).
 * Shows a table with inline status editing and notes.
 *
 * BEHAVIOR:
 * - Add new services via expandable form
 * - Inline status dropdown for quick changes
 * - Inline notes editing with click-to-expand
 * - Delete marks items for deletion (soft delete until publish)
 * - Yellow highlight on changed items
 *
 * PROPS:
 * - services: Current service list
 * - config: Building config (for scroll speed setting)
 * - onSave: Callback after any change (reloads data)
 * - hasChanged: Whether this section has unpublished changes
 * - publishedServices: Last published services for diff highlighting
 *
 * GOTCHAS / AI AGENT NOTES:
 * - Status changes update lastChecked timestamp automatically
 * - Notes editing uses local state until Enter/click confirm
 * - markedForDeletion shows strikethrough, actual delete on publish
 *
 * RELATED FILES:
 * - src/pages/Admin.tsx - Parent component
 * - src/types.ts - Service type
 * - src/components/admin/StatusSelect.tsx - Status dropdown
 */
import { useState } from 'react';
import type { Service, BuildingConfig } from '../../../types';
import { api } from '../../../utils/api';
import { STATUS_COLORS, DEFAULTS } from '../../../constants';
import {
  smallBtn, smallBtnDanger, smallBtnSuccess, btn,
  inputStyle, sectionStyle, sectionChangedStyle, formGroupStyle,
  formLabelStyle, markedForDeletionStyle, itemChangedStyle, draftIndicatorStyle,
} from '../../../styles';
import { StatusSelect } from '../StatusSelect';
import { SpeedSlider } from '../SpeedSlider';

interface ServicesSectionProps {
  /** Current service list */
  services: Service[];
  /** Building config for scroll speed */
  config: BuildingConfig | null;
  /** Callback after any change. Pass optimistic data for instant UI update. */
  onSave: (optimistic?: { services?: Service[] }) => void;
  /** Whether this section has unpublished changes */
  hasChanged: boolean;
  /** Last published services for diff */
  publishedServices: Service[] | null;
}

export function ServicesSection({
  services,
  config,
  onSave,
  hasChanged,
  publishedServices,
}: ServicesSectionProps) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('Operational');
  const [formExpanded, setFormExpanded] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<number, string>>({});
  const add = async () => {
    if (!name) return;
    // New item — can't predict ID, so await and sync
    await api.post('/api/services', { name, status, sortOrder: services.length });
    setName('');
    setFormExpanded(false);
    onSave();
  };

  const markForDeletion = (id: number) => {
    const updated = services.map(s => s.id === id ? { ...s, markedForDeletion: true } : s);
    api.del(`/api/services/${id}`);
    onSave({ services: updated });
  };

  const unmarkForDeletion = (id: number) => {
    const updated = services.map(s => s.id === id ? { ...s, markedForDeletion: false } : s);
    api.post(`/api/services/${id}/unmark`);
    onSave({ services: updated });
  };

  const changeStatus = (s: Service, newStatus: string) => {
    const updated = services.map(svc => svc.id === s.id ? { ...svc, status: newStatus as Service['status'], lastChecked: new Date().toISOString() } : svc);
    api.put(`/api/services/${s.id}`, { status: newStatus, lastChecked: new Date().toISOString() });
    onSave({ services: updated });
  };

  const updateNotes = (s: Service, notes: string) => {
    const updated = services.map(svc => svc.id === s.id ? { ...svc, notes } : svc);
    api.put(`/api/services/${s.id}`, { notes });
    onSave({ services: updated });
  };

  const getPublishedService = (id: number): Service | undefined => {
    return publishedServices?.find(ps => ps.id === id);
  };

  return (
    <section style={{ ...sectionStyle, ...(hasChanged ? sectionChangedStyle : {}) }}>
      <h2 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        Services
        {hasChanged && <span style={{ color: '#b07800', fontSize: '12px' }}>●</span>}
      </h2>

      {/* Add Service Form */}
      {formExpanded ? (
        <div style={formGroupStyle}>
          <span style={formLabelStyle}>Add New Service Status</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              style={inputStyle}
              placeholder="Service name"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') add();
              }}
              autoFocus
            />
            <StatusSelect value={status} onChange={setStatus} />
            <button style={btn} onClick={add}>
              Add
            </button>
            <button
              style={{ ...btn, background: '#888' }}
              onClick={() => {
                setFormExpanded(false);
                setName('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          style={{ ...btn, width: '100%', marginBottom: '12px' }}
          onClick={() => setFormExpanded(true)}
        >
          + Add Service
        </button>
      )}

      {/* Services Table */}
      {services.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: '13px',
            background: '#fafafa',
            borderRadius: '8px',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: '#eee',
            overflow: 'hidden',
          }}
        >
          {/* Header row */}
          <div
            className="services-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(120px, 1fr) 140px 1fr auto',
              background: '#f0f0f0',
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                fontWeight: 600,
                fontSize: '11px',
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Service
            </div>
            <div
              style={{
                padding: '8px 12px',
                fontWeight: 600,
                fontSize: '11px',
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Status
            </div>
            <div
              style={{
                padding: '8px 12px',
                fontWeight: 600,
                fontSize: '11px',
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Notes
            </div>
            <div
              style={{
                padding: '8px 12px',
                fontWeight: 600,
                fontSize: '11px',
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                textAlign: 'right',
              }}
            ></div>
          </div>

          {/* Service rows */}
          {services.map(s => {
            const pub = getPublishedService(s.id);
            const isNewDraft = !pub;
            const isMarkedForDeletion = s.markedForDeletion;
            const statusChanged = pub && pub.status !== s.status;
            const notesChanged = pub && (s.notes || '') !== (pub.notes || '');
            const hasItemChanges = !isMarkedForDeletion && !isNewDraft && (statusChanged || notesChanged);
            const isExpanded = expandedNotes === s.id && !isMarkedForDeletion;

            return (
              <div
                key={s.id}
                className="services-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(120px, 1fr) 140px 1fr auto',
                  borderTop: isMarkedForDeletion
                    ? '1px solid rgba(244, 67, 54, 0.3)'
                    : '1px solid #eee',
                  ...(isMarkedForDeletion ? markedForDeletionStyle : {}),
                  ...(hasItemChanges ? itemChangedStyle : {}),
                }}
              >
                {/* Service name */}
                <div
                  style={{
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    ...(isMarkedForDeletion ? { textDecoration: 'line-through', opacity: 0.5 } : {}),
                  }}
                >
                  {isNewDraft && !isMarkedForDeletion && (
                    <span style={draftIndicatorStyle} title="New draft item">
                      ●
                    </span>
                  )}
                  {isMarkedForDeletion && (
                    <span style={{ color: '#f44336', fontSize: '10px' }} title="Will be deleted on publish">
                      🗑
                    </span>
                  )}
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                </div>

                {/* Status */}
                <div
                  style={{
                    padding: '6px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '2px',
                  }}
                >
                  {isMarkedForDeletion ? (
                    <span style={{ color: STATUS_COLORS[s.status], opacity: 0.5 }}>{s.status}</span>
                  ) : (
                    <>
                      <StatusSelect
                        value={s.status}
                        onChange={v => changeStatus(s, v)}
                        style={{ padding: '2px 4px', fontSize: '11px' }}
                      />
                      {statusChanged && (
                        <span style={{ fontSize: '9px', color: '#888' }}>
                          was: <span style={{ color: STATUS_COLORS[pub.status] }}>{pub.status}</span>
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Notes */}
                <div
                  style={{
                    padding: '6px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    minWidth: 0,
                  }}
                >
                  {isMarkedForDeletion ? (
                    <span style={{ fontSize: '11px', color: '#666', opacity: 0.5 }}>{s.notes || '—'}</span>
                  ) : isExpanded ? (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: 1 }}>
                      <input
                        style={{ ...inputStyle, flex: 1, fontSize: '11px', padding: '4px 8px' }}
                        placeholder="Note..."
                        value={editingNotes[s.id] ?? s.notes ?? ''}
                        onChange={e => setEditingNotes({ ...editingNotes, [s.id]: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const newNotes = editingNotes[s.id] ?? s.notes ?? '';
                            updateNotes(s, newNotes);
                            setEditingNotes(prev => {
                              const copy = { ...prev };
                              delete copy[s.id];
                              return copy;
                            });
                            setExpandedNotes(null);
                          } else if (e.key === 'Escape') {
                            setEditingNotes(prev => {
                              const copy = { ...prev };
                              delete copy[s.id];
                              return copy;
                            });
                            setExpandedNotes(null);
                          }
                        }}
                        autoFocus
                      />
                      <button
                        style={{ ...smallBtn, padding: '2px 6px', fontSize: '10px', marginLeft: 0 }}
                        onClick={() => {
                          const newNotes = editingNotes[s.id] ?? s.notes ?? '';
                          updateNotes(s, newNotes);
                          setEditingNotes(prev => {
                            const copy = { ...prev };
                            delete copy[s.id];
                            return copy;
                          });
                          setExpandedNotes(null);
                        }}
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <span
                      style={{
                        fontSize: '11px',
                        color: s.notes ? '#999' : '#555',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                      onClick={() => setExpandedNotes(s.id)}
                      title={s.notes || 'Click to add note'}
                    >
                      {s.notes || '+ note'}
                      {notesChanged && <span style={{ color: '#b07800', marginLeft: '4px' }}>*</span>}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div
                  style={{
                    padding: '6px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '4px',
                  }}
                >
                  {isMarkedForDeletion ? (
                    <button
                      style={{
                        ...smallBtn,
                        ...smallBtnSuccess,
                        padding: '2px 8px',
                        fontSize: '10px',
                        marginLeft: 0,
                      }}
                      onClick={() => unmarkForDeletion(s.id)}
                    >
                      Undo
                    </button>
                  ) : (
                    <button
                      style={{
                        ...smallBtn,
                        ...smallBtnDanger,
                        padding: '2px 6px',
                        fontSize: '10px',
                        marginLeft: 0,
                      }}
                      onClick={() => markForDeletion(s.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Page Speed Setting */}
      <SpeedSlider
        label="Page speed"
        value={config?.servicesScrollSpeed ?? DEFAULTS.SERVICES_SCROLL_SPEED}
        onCommit={val => {
          api.put('/api/config', { servicesScrollSpeed: val });
          onSave({ config: config ? { ...config, servicesScrollSpeed: val } : null });
        }}
      />

      {/* Font Settings */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#666' }}>
          Service font size
          <input
            type="number"
            min={10}
            max={36}
            value={config?.servicesFontSize ?? DEFAULTS.SERVICES_FONT_SIZE}
            onChange={e => {
              const val = Number(e.target.value);
              if (val >= 10 && val <= 36) {
                api.put('/api/config', { servicesFontSize: val });
                onSave({ config: config ? { ...config, servicesFontSize: val } : null });
              }
            }}
            style={{ ...inputStyle, width: '60px', padding: '2px 6px', fontSize: '12px' }}
          />
          px
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#666' }}>
          Notes font size
          <input
            type="number"
            min={10}
            max={36}
            value={config?.notesFontSize ?? DEFAULTS.NOTES_FONT_SIZE}
            onChange={e => {
              const val = Number(e.target.value);
              if (val >= 10 && val <= 36) {
                api.put('/api/config', { notesFontSize: val });
                onSave({ config: config ? { ...config, notesFontSize: val } : null });
              }
            }}
            style={{ ...inputStyle, width: '60px', padding: '2px 6px', fontSize: '12px' }}
          />
          px
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#666' }}>
          Notes font weight
          <select
            value={config?.notesFontWeight ?? DEFAULTS.NOTES_FONT_WEIGHT}
            onChange={e => {
              const val = Number(e.target.value);
              api.put('/api/config', { notesFontWeight: val });
              onSave({ config: config ? { ...config, notesFontWeight: val } : null });
            }}
            style={{ ...inputStyle, padding: '2px 6px', fontSize: '12px' }}
          >
            <option value={400}>Normal (400)</option>
            <option value={500}>Medium (500)</option>
            <option value={600}>Semibold (600)</option>
            <option value={700}>Bold (700)</option>
          </select>
        </label>
      </div>
    </section>
  );
}
