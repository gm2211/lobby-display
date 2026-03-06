/**
 * AdvisoriesSection - Advisory ticker management section.
 *
 * PURPOSE:
 * Manages advisory messages shown in the bottom ticker.
 * Supports enabling/disabling individual advisories.
 *
 * BEHAVIOR:
 * - Add/edit advisories via expandable form
 * - Toggle active state with switch (disabled advisories still exist but don't show)
 * - Delete marks items for deletion (soft delete until publish)
 * - Yellow highlight on changed items
 * - Diff indicator shows previous message value
 *
 * PROPS:
 * - advisories: Current advisory list
 * - config: Building config (for ticker speed setting)
 * - onSave: Callback after any change (reloads data)
 * - hasChanged: Whether this section has unpublished changes
 * - publishedAdvisories: Last published advisories for diff highlighting
 *
 * GOTCHAS / AI AGENT NOTES:
 * - Active toggle is separate from edit - can toggle without opening edit
 * - activeChanged shows arrow indicator (ON → OFF or vice versa)
 *
 * RELATED FILES:
 * - src/pages/Admin.tsx - Parent component
 * - src/types.ts - Advisory type
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Advisory, BuildingConfig } from '../../../types';
import { api } from '../../../utils/api';
import { DEFAULTS } from '../../../constants';
import {
  smallBtn, smallBtnDanger, smallBtnSuccess, smallBtnPrimary, smallBtnInfo, btn,
  inputStyle, sectionStyle, sectionChangedStyle, formGroupStyle,
  formLabelStyle, listHeaderStyle, listCardStyle,
  markedForDeletionStyle, itemChangedStyle, draftIndicatorStyle,
} from '../../../styles';
import { SpeedSlider } from '../SpeedSlider';

/** Toggle switch style */
const toggleStyle: CSSProperties = {
  width: '36px',
  height: '20px',
  borderRadius: '4px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#ccc',
  cursor: 'pointer',
  position: 'relative',
  padding: 0,
  transition: 'background 0.2s, border-color 0.2s',
};

/** Toggle knob style */
const toggleKnobStyle: CSSProperties = {
  position: 'absolute',
  top: '2px',
  left: '2px',
  width: '14px',
  height: '14px',
  borderRadius: '3px',
  background: '#fff',
  transition: 'transform 0.2s',
  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
};

interface AdvisoriesSectionProps {
  /** Current advisory list */
  advisories: Advisory[];
  /** Building config for ticker speed */
  config: BuildingConfig | null;
  /** Callback after any change. Pass optimistic data for instant UI update. */
  onSave: (optimistic?: { advisories?: Advisory[] }) => void;
  /** Whether this section has unpublished changes */
  hasChanged: boolean;
  /** Last published advisories for diff */
  publishedAdvisories: Advisory[] | null;
}

export function AdvisoriesSection({
  advisories,
  config,
  onSave,
  hasChanged,
  publishedAdvisories,
}: AdvisoriesSectionProps) {
  const empty = { message: '' };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formExpanded, setFormExpanded] = useState(false);
  const isFormOpen = formExpanded || editingId !== null;

  const markForDeletion = (id: number) => {
    const updated = advisories.map(a => a.id === id ? { ...a, markedForDeletion: true } : a);
    api.del(`/api/advisories/${id}`);
    onSave({ advisories: updated });
  };

  const unmarkForDeletion = (id: number) => {
    const updated = advisories.map(a => a.id === id ? { ...a, markedForDeletion: false } : a);
    api.post(`/api/advisories/${id}/unmark`);
    onSave({ advisories: updated });
  };

  const submit = async () => {
    if (!form.message.trim()) return;
    if (editingId) {
      const updated = advisories.map(a => a.id === editingId ? { ...a, ...form } : a);
      api.put(`/api/advisories/${editingId}`, form);
      onSave({ advisories: updated });
    } else {
      // New item — can't predict the ID, so just fire and sync
      await api.post('/api/advisories', form);
      onSave();
    }
    setForm(empty);
    setEditingId(null);
    setFormExpanded(false);
  };

  const startEdit = (a: Advisory) => {
    setEditingId(a.id);
    setFormExpanded(true);
    setForm({ message: a.message });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormExpanded(false);
    setForm(empty);
  };

  const cloneAdvisory = (a: Advisory) => {
    setEditingId(null);
    setFormExpanded(true);
    setForm({ message: a.message });
  };

  const toggleActive = (a: Advisory) => {
    const updated = advisories.map(adv => adv.id === a.id ? { ...adv, active: !adv.active } : adv);
    api.put(`/api/advisories/${a.id}`, { active: !a.active });
    onSave({ advisories: updated });
  };

  return (
    <section style={{ ...sectionStyle, ...(hasChanged ? sectionChangedStyle : {}) }}>
      <h2 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        Advisories
        {hasChanged && <span style={{ color: '#b07800', fontSize: '12px' }}>●</span>}
      </h2>

      {/* Add/Edit Advisory Form */}
      {isFormOpen ? (
        <div style={formGroupStyle}>
          <span style={formLabelStyle}>{editingId ? 'Edit Advisory' : 'Add New Advisory'}</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10px', color: '#888' }}>
                Message <span style={{ color: '#f44336' }}>*</span>
              </span>
              <input
                style={{ ...inputStyle, width: '100%', height: '38px', boxSizing: 'border-box' }}
                placeholder="Advisory message"
                value={form.message}
                onChange={e => setForm({ ...form, message: e.target.value })}
                onKeyDown={e => {
                  if (e.key === 'Enter') submit();
                }}
              />
            </div>
            <button style={btn} onClick={submit}>
              {editingId ? 'Save Draft' : 'Add Advisory to Draft'}
            </button>
            <button style={{ ...btn, background: '#888' }} onClick={cancelEdit}>
              {editingId ? 'Cancel' : 'Close'}
            </button>
          </div>
        </div>
      ) : (
        <button
          style={{ ...btn, width: '100%', marginBottom: '16px' }}
          onClick={() => setFormExpanded(true)}
        >
          + Add New Advisory
        </button>
      )}

      {/* Advisories List */}
      {advisories.length > 0 && (
        <div style={listHeaderStyle}>
          <span>Current Advisories</span>
          <span style={{ fontSize: '11px', color: '#666' }}>
            {advisories.length} item{advisories.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      <div>
        {advisories.map(a => {
          const pub = publishedAdvisories?.find(pa => pa.id === a.id);
          const isNewDraft = !pub;
          const isMarkedForDeletion = a.markedForDeletion;
          const isBeingEdited = editingId === a.id;
          const messageChanged = pub && pub.message !== a.message;
          const activeChanged = pub && pub.active !== a.active;
          const hasChanges = !isMarkedForDeletion && !isNewDraft && messageChanged;

          return (
            <div
              key={a.id}
              style={{
                ...listCardStyle,
                flexDirection: 'column',
                gap: '8px',
                opacity: isMarkedForDeletion ? 1 : a.active ? 1 : 0.5,
                ...(isMarkedForDeletion
                  ? { ...markedForDeletionStyle, borderColor: 'rgba(244, 67, 54, 0.3)' }
                  : {}),
                ...(isBeingEdited ? { borderWidth: '2px', borderColor: '#00838f' } : {}),
                ...(!isBeingEdited && hasChanges ? itemChangedStyle : {}),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '8px' }}>
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
                <div
                  style={{
                    flex: 1,
                    ...(isMarkedForDeletion ? { textDecoration: 'line-through', opacity: 0.5 } : {}),
                  }}
                >
                  <span style={{ color: '#333' }}>{a.message}</span>
                </div>
                <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {isMarkedForDeletion ? (
                    <button
                      style={{ ...smallBtn, ...smallBtnSuccess }}
                      onClick={() => unmarkForDeletion(a.id)}
                    >
                      Undo
                    </button>
                  ) : (
                    <>
                      {activeChanged && (
                        <span style={{ fontSize: '10px', color: '#b07800', opacity: 0.9 }}>
                          {pub.active ? 'ON' : 'OFF'} →
                        </span>
                      )}
                      <button
                        style={{
                          ...toggleStyle,
                          background: a.active ? 'rgba(76, 175, 80, 0.18)' : '#f5f5f5',
                          borderColor: a.active ? '#81c784' : '#ccc',
                        }}
                        onClick={() => toggleActive(a)}
                        title={a.active ? 'Active - click to disable' : 'Inactive - click to enable'}
                      >
                        <span
                          style={{
                            ...toggleKnobStyle,
                            transform: a.active ? 'translateX(16px)' : 'translateX(0)',
                          }}
                        />
                      </button>
                      <button
                        style={{ ...smallBtn, ...smallBtnInfo }}
                        onClick={() => cloneAdvisory(a)}
                        title="Clone"
                      >
                        ⧉
                      </button>
                      <button
                        style={{ ...smallBtn, ...(isBeingEdited ? smallBtnInfo : smallBtnPrimary) }}
                        onClick={() => (isBeingEdited ? cancelEdit() : startEdit(a))}
                      >
                        ✎
                      </button>
                      <button
                        style={{ ...smallBtn, ...smallBtnDanger }}
                        onClick={() => markForDeletion(a.id)}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </span>
              </div>

              {/* Diff indicators */}
              {!isMarkedForDeletion && messageChanged && (
                <div style={{ fontSize: '11px', color: '#b07800', opacity: 0.9, paddingLeft: '16px' }}>
                  <span>Was: "{pub.message}"</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Ticker Speed Setting */}
      <SpeedSlider
        label="Scroll speed"
        value={config?.tickerSpeed ?? DEFAULTS.TICKER_SPEED}
        onCommit={val => {
          api.put('/api/config', { tickerSpeed: val });
          onSave({ config: config ? { ...config, tickerSpeed: val } : null });
        }}
      />
    </section>
  );
}
