/**
 * ServicesSection - Service status management section.
 *
 * PURPOSE:
 * Manages building service statuses (elevators, HVAC, etc).
 * One card per service (same card + action bar as Events): name, note and
 * state chips on top; a Status · Note · Delete bar underneath.
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
  smallBtn, btn, inputStyle, sectionStyle, sectionChangedStyle, formGroupStyle,
  formLabelStyle, smallBtnPrimary, smallBtnInfo,
  editorCardStyle, editorCardChangedStyle, editorCardDeletedStyle, editorCardTopStyle,
  editorCardBodyStyle, editorCardTitleStyle, editorCardTextStyle, editorCardMetaStyle,
  actionBarStyle, actionBarButtonStyle, actionBarButtonFirstStyle, actionBarPrimaryStyle,
  actionBarDangerStyle, actionBarUndoStyle, chipStyle, chipDraftStyle, chipEditedStyle, chipRemovingStyle,
} from '../../../styles';
import { EditIcon, TrashIcon, UndoIcon } from '../EditorIcons';
import { StatusSelect } from '../StatusSelect';
import { SpeedSlider } from '../SpeedSlider';

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

/** Name and note of a service that will be removed on publish */
const struck: React.CSSProperties = { textDecoration: 'line-through', opacity: 0.5 };

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

      {/* Services list: one card per service, same components as the Events list */}
      {services.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
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
                style={{
                  ...editorCardStyle,
                  ...(hasItemChanges ? editorCardChangedStyle : {}),
                  ...(isMarkedForDeletion ? editorCardDeletedStyle : {}),
                }}
              >
                <div style={{ ...editorCardTopStyle, paddingLeft: '12px' /* no drag handle */ }}>
                  <div style={editorCardBodyStyle}>
                    <span style={{ ...editorCardTitleStyle, ...(isMarkedForDeletion ? struck : {}) }}>{s.name}</span>
                    {isExpanded ? (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                          placeholder="Note shown under the service"
                          value={editingNotes[s.id] ?? s.notes ?? ''}
                          onChange={e => setEditingNotes({ ...editingNotes, [s.id]: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveNotes();
                            else if (e.key === 'Escape') cancelNotes();
                          }}
                          autoFocus
                        />
                        <button style={{ ...smallBtn, ...smallBtnPrimary, marginLeft: 0, padding: '8px 12px' }} onClick={saveNotes}>
                          Save
                        </button>
                        <button style={{ ...smallBtn, ...smallBtnInfo, marginLeft: 0, padding: '8px 12px' }} onClick={cancelNotes}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      s.notes && (
                        <span style={{ ...editorCardTextStyle, ...(isMarkedForDeletion ? struck : {}) }}>{s.notes}</span>
                      )
                    )}
                    {(isNewDraft || hasItemChanges || isMarkedForDeletion) && (
                      <div style={editorCardMetaStyle}>
                        {isMarkedForDeletion ? (
                          <span style={{ ...chipStyle, ...chipRemovingStyle }}>Removing</span>
                        ) : isNewDraft ? (
                          <span style={{ ...chipStyle, ...chipDraftStyle }}>Draft</span>
                        ) : (
                          <span style={{ ...chipStyle, ...chipEditedStyle }}>Edited</span>
                        )}
                        {statusChanged && !isMarkedForDeletion && <span>was {pub.status}</span>}
                        {notesChanged && !isMarkedForDeletion && <span>note changed</span>}
                      </div>
                    )}
                  </div>
                </div>
                {isMarkedForDeletion ? (
                  <div style={actionBarStyle(1)}>
                    <button
                      style={{ ...actionBarButtonStyle, ...actionBarButtonFirstStyle, ...actionBarUndoStyle }}
                      onClick={() => unmarkForDeletion(s.id)}
                    >
                      <UndoIcon />Undo remove
                    </button>
                  </div>
                ) : (
                  <div style={{ ...actionBarStyle(3), gridTemplateColumns: '1.35fr 1fr 1fr' /* "Operational" fits on a phone */ }}>
                    <StatusSelect
                      variant="bar"
                      value={s.status}
                      onChange={v => changeStatus(s, v)}
                      style={{ ...actionBarButtonFirstStyle, ...actionBarPrimaryStyle }}
                    />
                    <button
                      style={actionBarButtonStyle}
                      onClick={() => (isExpanded ? cancelNotes() : setExpandedNotes(s.id))}
                    >
                      <EditIcon />{s.notes ? 'Edit note' : 'Add note'}
                    </button>
                    <button
                      style={{ ...actionBarButtonStyle, ...actionBarDangerStyle }}
                      onClick={() => markForDeletion(s.id)}
                    >
                      <TrashIcon />Delete
                    </button>
                  </div>
                )}
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
