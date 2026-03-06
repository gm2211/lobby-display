/**
 * EventsSection - Event card management section.
 *
 * PURPOSE:
 * Manages dashboard event cards (announcements, updates).
 * Shows a card list with edit/preview capabilities.
 *
 * BEHAVIOR:
 * - Add/edit events via expandable form with markdown editor
 * - Preview events as they'll appear on dashboard
 * - Delete marks items for deletion (soft delete until publish)
 * - Yellow highlight on changed items
 * - Title is required (shows validation error with shake animation)
 *
 * PROPS:
 * - events: Current event list
 * - config: Building config (for scroll speed setting)
 * - onSave: Callback after any change (reloads data)
 * - hasChanged: Whether this section has unpublished changes
 * - publishedEvents: Last published events for diff highlighting
 *
 * GOTCHAS / AI AGENT NOTES:
 * - Form details stored as string, converted to array on submit
 * - ImagePicker and MarkdownEditor are extracted components
 * - Preview modal shows EventCardPreview component
 * - shake/field-error CSS classes defined in Admin.tsx
 *
 * RELATED FILES:
 * - src/pages/Admin.tsx - Parent component
 * - src/types.ts - Event type
 * - src/components/admin/MarkdownEditor.tsx - Details editor
 * - src/components/admin/ImagePicker.tsx - Image selector
 * - src/components/admin/EventCardPreview.tsx - Card preview
 */
import { useState } from 'react';
import type { Event, BuildingConfig } from '../../../types';
import { api } from '../../../utils/api';
import { DEFAULTS } from '../../../constants';
import {
  smallBtn, smallBtnDanger, smallBtnSuccess, smallBtnPrimary, smallBtnInfo,
  btn, modalOverlay,
  inputStyle, sectionStyle, sectionChangedStyle, formGroupStyle,
  formLabelStyle, listHeaderStyle, listCardStyle,
  markedForDeletionStyle, itemChangedStyle, draftIndicatorStyle,
} from '../../../styles';
import { ImagePicker } from '../ImagePicker';
import { MarkdownEditor } from '../MarkdownEditor';
import { EventCardPreview } from '../EventCardPreview';
import { SpeedSlider } from '../SpeedSlider';

interface EventsSectionProps {
  /** Current event list */
  events: Event[];
  /** Building config for scroll speed */
  config: BuildingConfig | null;
  /** Callback after any change. Pass optimistic data for instant UI update. */
  onSave: (optimistic?: { events?: Event[] }) => void;
  /** Whether this section has unpublished changes */
  hasChanged: boolean;
  /** Last published events for diff */
  publishedEvents: Event[] | null;
}

export function EventsSection({
  events,
  config,
  onSave,
  hasChanged,
  publishedEvents,
}: EventsSectionProps) {
  const empty = { title: '', subtitle: '', details: '- ', imageUrl: '' }; // Start with bullet list
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formExpanded, setFormExpanded] = useState(false);
  const [previewEvent, setPreviewEvent] = useState<Event | null>(null);
  const [previewingForm, setPreviewingForm] = useState(false);
  const [errors, setErrors] = useState<{ title?: boolean }>({});
  const [shake, setShake] = useState(false);

  const isFormOpen = formExpanded || editingId !== null;

  const markForDeletion = (id: number) => {
    const updated = events.map(e => e.id === id ? { ...e, markedForDeletion: true } : e);
    api.del(`/api/events/${id}`);
    onSave({ events: updated });
  };

  const unmarkForDeletion = (id: number) => {
    const updated = events.map(e => e.id === id ? { ...e, markedForDeletion: false } : e);
    api.post(`/api/events/${id}/unmark`);
    onSave({ events: updated });
  };

  const submit = async () => {
    if (!form.title.trim()) {
      setErrors({ title: true });
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }
    setErrors({});
    const body = {
      title: form.title,
      subtitle: form.subtitle,
      details: form.details.split('\n').filter(Boolean),
      imageUrl: form.imageUrl,
      sortOrder: events.length,
    };
    if (editingId) {
      const updated = events.map(e => e.id === editingId ? { ...e, title: body.title, subtitle: body.subtitle, details: body.details, imageUrl: body.imageUrl } : e);
      api.put(`/api/events/${editingId}`, body);
      onSave({ events: updated });
    } else {
      // New item — can't predict ID, so await and sync
      await api.post('/api/events', body);
      onSave();
    }
    setForm(empty);
    setEditingId(null);
    setFormExpanded(false);
  };

  const startEdit = (e: Event) => {
    setEditingId(e.id);
    setFormExpanded(true);
    setForm({
      title: e.title,
      subtitle: e.subtitle,
      details: (e.details || []).join('\n'),
      imageUrl: e.imageUrl,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormExpanded(false);
    setForm(empty);
  };

  const cloneEvent = (e: Event) => {
    setEditingId(null);
    setFormExpanded(true);
    setForm({
      title: e.title,
      subtitle: e.subtitle,
      details: (e.details || []).join('\n'),
      imageUrl: e.imageUrl,
    });
  };

  return (
    <section style={{ ...sectionStyle, ...(hasChanged ? sectionChangedStyle : {}) }}>
      <h2 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        Events
        {hasChanged && <span style={{ color: '#b07800', fontSize: '12px' }}>●</span>}
      </h2>

      {/* Add/Edit Event Form */}
      {isFormOpen ? (
        <div style={formGroupStyle}>
          <span style={formLabelStyle}>{editingId ? 'Edit Event' : 'Add New Event'}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '10px', color: '#888' }}>
                  Title <span style={{ color: '#f44336' }}>*</span>
                </span>
                <input
                  className={`${errors.title ? 'field-error' : ''} ${shake && errors.title ? 'shake' : ''}`}
                  style={{ ...inputStyle, width: '100%' }}
                  placeholder="Title"
                  value={form.title}
                  onChange={e => {
                    setForm({ ...form, title: e.target.value });
                    setErrors({});
                  }}
                />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '10px', color: '#888' }}>Subtitle</span>
                <input
                  style={{ ...inputStyle, width: '100%' }}
                  placeholder="Subtitle"
                  value={form.subtitle}
                  onChange={e => setForm({ ...form, subtitle: e.target.value })}
                />
              </div>
            </div>
            <ImagePicker
              label="Image"
              value={form.imageUrl}
              onChange={imageUrl => setForm({ ...form, imageUrl })}
            />
            <MarkdownEditor
              key={editingId ?? 'new'}
              value={form.details}
              onChange={details => setForm({ ...form, details })}
              cardPreview={{ title: form.title, subtitle: form.subtitle, imageUrl: form.imageUrl }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={btn} onClick={submit}>
                {editingId ? 'Save Draft' : 'Add Event to Draft'}
              </button>
              <button style={{ ...btn, background: '#00838f' }} onClick={() => setPreviewingForm(true)}>
                Preview
              </button>
              <button style={{ ...btn, background: '#888' }} onClick={cancelEdit}>
                {editingId ? 'Cancel' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          style={{ ...btn, width: '100%', marginBottom: '16px' }}
          onClick={() => setFormExpanded(true)}
        >
          + Add New Event
        </button>
      )}

      {/* Form Preview Modal */}
      {previewingForm && (
        <div style={modalOverlay} onClick={() => setPreviewingForm(false)}>
          <div onClick={ev => ev.stopPropagation()} style={{ position: 'relative' }}>
            <EventCardPreview
              title={form.title || 'Untitled Event'}
              subtitle={form.subtitle}
              imageUrl={form.imageUrl}
              details={form.details}
            />
            <button
              style={{ ...smallBtn, position: 'absolute', top: '-8px', right: '-8px', background: '#666', color: '#fff', borderColor: '#555' }}
              onClick={() => setPreviewingForm(false)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Events List */}
      {events.length > 0 && (
        <div style={listHeaderStyle}>
          <span>Current Events</span>
          <span style={{ fontSize: '11px', color: '#666' }}>
            {events.length} item{events.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      <div>
        {events.map(e => {
          const pub = publishedEvents?.find(pe => pe.id === e.id);
          const isNewDraft = !pub;
          const isMarkedForDeletion = e.markedForDeletion;
          const hasChanges =
            !isMarkedForDeletion &&
            !isNewDraft &&
            pub &&
            (pub.title !== e.title ||
              pub.subtitle !== e.subtitle ||
              pub.imageUrl !== e.imageUrl ||
              JSON.stringify(pub.details) !== JSON.stringify(e.details));

          return (
            <div
              key={e.id}
              style={{
                ...listCardStyle,
                ...(isMarkedForDeletion
                  ? { ...markedForDeletionStyle, borderColor: 'rgba(244, 67, 54, 0.3)' }
                  : {}),
                ...(hasChanges ? itemChangedStyle : {}),
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  flex: 1,
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
                {e.imageUrl && (
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '6px',
                      backgroundImage: `url(${e.imageUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                  <span style={{ fontWeight: 600, color: '#333' }}>{e.title}</span>
                  <span style={{ fontSize: '12px', color: '#888' }}>{e.subtitle}</span>
                  <span style={{ fontSize: '10px', color: '#666' }}>
                    {e.details.length} detail{e.details.length !== 1 ? 's' : ''}
                    {e.imageUrl && ' • has image'}
                  </span>
                </div>
              </div>
              <span style={{ display: 'flex', gap: '4px' }}>
                {isMarkedForDeletion ? (
                  <button
                    style={{ ...smallBtn, ...smallBtnSuccess }}
                    onClick={() => unmarkForDeletion(e.id)}
                  >
                    Undo
                  </button>
                ) : (
                  <>
                    <button
                      style={{ ...smallBtn, ...smallBtnInfo, fontSize: '10px' }}
                      onClick={() => setPreviewEvent(e)}
                    >
                      Preview
                    </button>
                    <button
                      style={{ ...smallBtn, ...smallBtnInfo }}
                      onClick={() => cloneEvent(e)}
                      title="Clone"
                    >
                      ⧉
                    </button>
                    <button
                      style={{ ...smallBtn, ...smallBtnPrimary }}
                      onClick={() => startEdit(e)}
                      title="Edit"
                    >
                      ✎
                    </button>
                    <button
                      style={{ ...smallBtn, ...smallBtnDanger }}
                      onClick={() => markForDeletion(e.id)}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Event Preview Modal */}
      {previewEvent && (
        <div style={modalOverlay} onClick={() => setPreviewEvent(null)}>
          <div onClick={ev => ev.stopPropagation()} style={{ position: 'relative' }}>
            <EventCardPreview
              title={previewEvent.title}
              subtitle={previewEvent.subtitle}
              imageUrl={previewEvent.imageUrl}
              details={previewEvent.details.join('\n')}
            />
            <button
              style={{ ...smallBtn, position: 'absolute', top: '-8px', right: '-8px', background: '#666', color: '#fff', borderColor: '#555' }}
              onClick={() => setPreviewEvent(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Scroll Speed Setting */}
      <SpeedSlider
        label="Scroll speed"
        value={config?.scrollSpeed ?? DEFAULTS.SCROLL_SPEED}
        onCommit={val => {
          api.put('/api/config', { scrollSpeed: val });
          onSave({ config: config ? { ...config, scrollSpeed: val } : null });
        }}
      />
    </section>
  );
}
