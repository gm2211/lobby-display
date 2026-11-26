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
import { useState, useEffect, useRef } from 'react';
import type { Service, BuildingConfig } from '../../../types';
import { api } from '../../../utils/api';
import { DEFAULTS } from '../../../constants';
import {
  smallBtn, smallBtnDanger, smallBtnSuccess, btn,
  inputStyle, sectionStyle, sectionChangedStyle, formGroupStyle,
  formLabelStyle, markedForDeletionStyle, itemChangedStyle, listCardStyle, smallBtnPrimary,
} from '../../../styles';
import { StatusSelect } from '../StatusSelect';
import { SpeedSlider } from '../SpeedSlider';
import type { CSSProperties } from 'react';

/** Small rounded label next to a service name (Draft / Deleting) */
function tagStyle(color: string, background: string): CSSProperties {
  return {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.4px',
    textTransform: 'uppercase',
    color,
    background,
    borderRadius: '999px',
    padding: '1px 7px',
    flexShrink: 0,
  };
}

/** Number input that allows free typing and commits on blur/Enter.
 *  Uses type="text" + inputMode="numeric" to avoid browser quirks with
 *  type="number" controlled inputs (some browsers don't fire onChange
 *  reliably during typing). Ignores external prop changes while focused. */
function NumberInput({ value, min, max, onCommit, style }: {
  value: number;
  min: number;
  max: number;
  onCommit: (val: number) => void;
  style?: React.CSSProperties;
}) {
  const [local, setLocal] = useState(String(value));
  const focusedRef = useRef(false);

  // Sync from parent, but never while the user is typing
  useEffect(() => {
    if (!focusedRef.current) {
      setLocal(String(value));
    }
  }, [value]);

  const commit = () => {
    focusedRef.current = false;
    const num = parseInt(local, 10);
    if (!isNaN(num) && num >= min && num <= max) {
      onCommit(num);
    } else {
      setLocal(String(value));
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={local}
      onFocus={() => { focusedRef.current = true; }}
      onChange={e => {
        // Allow only digits (and empty for clearing)
        const v = e.target.value;
        if (v === '' || /^\d+$/.test(v)) setLocal(v);
      }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={style}
    />
  );
}

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
        {hasChanged && <span style={{ color: 'var(--theme-color-secondary-600)', fontSize: '12px' }}>●</span>}
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

      {/* Services list: one card per service, same visual language as the Events list */}
      {services.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '13px' }}>
          {services.map(s => {
            const pub = getPublishedService(s.id);
            const isNewDraft = !pub;
            const isMarkedForDeletion = s.markedForDeletion;
            const statusChanged = pub && pub.status !== s.status;
            const notesChanged = pub && (s.notes || '') !== (pub.notes || '');
            const hasItemChanges = !isMarkedForDeletion && !isNewDraft && (statusChanged || notesChanged);
            const isExpanded = expandedNotes === s.id && !isMarkedForDeletion;

            const saveNotes = () => {
              const newNotes = editingNotes[s.id] ?? s.notes ?? '';
              updateNotes(s, newNotes);
              setEditingNotes(prev => {
                const copy = { ...prev };
                delete copy[s.id];
                return copy;
              });
              setExpandedNotes(null);
            };
            const cancelNotes = () => {
              setEditingNotes(prev => {
                const copy = { ...prev };
                delete copy[s.id];
                return copy;
              });
              setExpandedNotes(null);
            };

            return (
              <div
                key={s.id}
                className="service-card"
                style={{
                  ...listCardStyle,
                  background: '#fff',
                  flexWrap: 'wrap',
                  gap: '8px 12px',
                  ...(isMarkedForDeletion
                    ? { ...markedForDeletionStyle, borderColor: 'rgba(244, 67, 54, 0.3)' }
                    : {}),
                  ...(hasItemChanges ? itemChangedStyle : {}),
                }}
              >
                {/* Name + note */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    flex: '1 1 90px',
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      ...(isMarkedForDeletion ? { textDecoration: 'line-through', opacity: 0.5 } : {}),
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '14px', color: '#333' }}>{s.name}</span>
                    {isNewDraft && !isMarkedForDeletion && (
                      <span style={tagStyle('var(--theme-color-secondary-700)', 'var(--theme-color-secondary-50)')} title="Not published yet">
                        Draft
                      </span>
                    )}
                    {isMarkedForDeletion && (
                      <span style={tagStyle('#c62828', '#fff0f0')} title="Will be deleted on publish">
                        Deleting
                      </span>
                    )}
                  </div>

                  {isMarkedForDeletion ? (
                    s.notes ? <span style={{ fontSize: '12px', color: '#888', opacity: 0.6 }}>{s.notes}</span> : null
                  ) : isExpanded ? (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        style={{ ...inputStyle, flex: 1, minWidth: 0, fontSize: '13px', padding: '5px 10px' }}
                        placeholder="Note shown under the service…"
                        value={editingNotes[s.id] ?? s.notes ?? ''}
                        onChange={e => setEditingNotes({ ...editingNotes, [s.id]: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveNotes();
                          else if (e.key === 'Escape') cancelNotes();
                        }}
                        autoFocus
                      />
                      <button style={{ ...smallBtn, ...smallBtnPrimary, marginLeft: 0 }} onClick={saveNotes} title="Save note">
                        Save
                      </button>
                      <button style={{ ...smallBtn, marginLeft: 0 }} onClick={cancelNotes} title="Cancel">
                        Cancel
                      </button>
                    </div>
                  ) : s.notes ? (
                    <button
                      onClick={() => setExpandedNotes(s.id)}
                      title="Edit note"
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: '#777',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                      }}
                    >
                      {s.notes}
                      {notesChanged && <span style={{ color: 'var(--theme-color-secondary-600)', marginLeft: '4px' }}>(edited)</span>}
                    </button>
                  ) : (
                    <button
                      onClick={() => setExpandedNotes(s.id)}
                      style={{
                        ...smallBtn,
                        marginLeft: 0,
                        alignSelf: 'flex-start',
                        background: 'transparent',
                        borderStyle: 'dashed',
                        borderColor: '#ccc',
                        color: '#777',
                        fontSize: '11px',
                        padding: '2px 8px',
                      }}
                    >
                      + Add note
                    </button>
                  )}
                </div>

                {/* Status + actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexShrink: 0 }}>
                  {isMarkedForDeletion ? (
                    <>
                      <span style={{ fontSize: '12px', color: '#888' }}>{s.status}</span>
                      <button
                        style={{ ...smallBtn, ...smallBtnSuccess, marginLeft: 0 }}
                        onClick={() => unmarkForDeletion(s.id)}
                      >
                        Undo
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                        <StatusSelect value={s.status} onChange={v => changeStatus(s, v)} />
                        {statusChanged && (
                          <span style={{ fontSize: '10px', color: '#888' }}>
                            was {pub.status}
                          </span>
                        )}
                      </div>
                      <button
                        style={{ ...smallBtn, ...smallBtnDanger, marginLeft: 0, width: '30px', height: '30px', padding: 0 }}
                        onClick={() => markForDeletion(s.id)}
                        title="Delete"
                        aria-label={`Delete ${s.name}`}
                      >
                        ✕
                      </button>
                    </>
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
          <NumberInput
            value={config?.servicesFontSize ?? DEFAULTS.SERVICES_FONT_SIZE}
            min={10}
            max={36}
            onCommit={val => {
              api.put('/api/config', { servicesFontSize: val });
              onSave({ config: config ? { ...config, servicesFontSize: val } : null });
            }}
            style={{ ...inputStyle, width: '60px', padding: '2px 6px', fontSize: '12px' }}
          />
          px
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#666' }}>
          Notes font size
          <NumberInput
            value={config?.notesFontSize ?? DEFAULTS.NOTES_FONT_SIZE}
            min={10}
            max={36}
            onCommit={val => {
              api.put('/api/config', { notesFontSize: val });
              onSave({ config: config ? { ...config, notesFontSize: val } : null });
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
