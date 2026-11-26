/**
 * EventsSection - Event card management section.
 *
 * PURPOSE:
 * Manages dashboard event cards (announcements, updates).
 * Shows a single-column list of cards (all widths, so order is easy to read).
 * Each card: drag handle, title, 2-line subtitle, status chips (New / Draft /
 * Edited / Removing), and a full-width action bar: Edit · Preview · Copy · Delete.
 * Card/bar/chip styles live in src/styles/editorCard.ts (shared with Services).
 *
 * BEHAVIOR:
 * - "+ Add New Event" (and Copy) open the form at the top of the section;
 *   Edit opens the same form in place, inside that event's card
 * - Preview events as they'll appear on dashboard
 * - Delete marks items for deletion (soft delete until publish)
 * - Yellow highlight on changed items
 * - Title is required (shows validation error with shake animation)
 * - Drag the ⋮⋮ handle (mouse or touch) or use arrow keys on it to reorder;
 *   order is saved via POST /api/events/reorder and goes live on publish
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
 * - Editing must NOT send sortOrder, or the event would jump to the end
 *
 * RELATED FILES:
 * - src/pages/Admin.tsx - Parent component
 * - src/types.ts - Event type
 * - src/components/admin/MarkdownEditor.tsx - Details editor
 * - src/components/admin/ImagePicker.tsx - Image selector
 * - src/components/admin/EventCardPreview.tsx - Card preview
 */
import { useRef, useState } from 'react';
import type { Event, BuildingConfig } from '../../../types';
import { api } from '../../../utils/api';
import { DEFAULTS } from '../../../constants';
import {
  smallBtn, btn, modalOverlay,
  inputStyle, sectionStyle, sectionChangedStyle, formGroupStyle,
  formLabelStyle, listHeaderStyle,
  editorCardStyle, editorCardChangedStyle, editorCardDeletedStyle, editorCardTopStyle,
  editorCardHandleStyle, editorCardBodyStyle, editorCardTitleStyle, editorCardTextStyle,
  editorCardMetaStyle, actionBarStyle, actionBarButtonStyle, actionBarButtonFirstStyle,
  actionBarPrimaryStyle, actionBarDangerStyle, actionBarUndoStyle,
  chipStyle, chipNewStyle, chipDraftStyle, chipEditedStyle, chipRemovingStyle,
} from '../../../styles';
import { isEventNew } from '../../../../shared/newBadge';
import { EditIcon, PreviewIcon, CopyIcon, TrashIcon, UndoIcon } from '../EditorIcons';
import { ImagePicker } from '../ImagePicker';
import { MarkdownEditor } from '../MarkdownEditor';
import { EventCardPreview } from '../EventCardPreview';
import { SpeedSlider } from '../SpeedSlider';
import { NewBadgeSetting } from '../NewBadgeSetting';
import { useDragReorder } from '../useDragReorder';

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

  const topFormRef = useRef<HTMLDivElement>(null);

  const saveOrder = (ordered: Event[]) => {
    const updated = ordered.map((e, i) => ({ ...e, sortOrder: i }));
    // On failure, resync from the server so the list shows the real order
    api.post('/api/events/reorder', { ids: updated.map(e => e.id) }).catch(() => onSave());
    onSave({ events: updated });
  };
  const { rowRef, rowStyle, handleProps } = useDragReorder(events, saveOrder);

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
    };
    if (editingId) {
      const updated = events.map(e => e.id === editingId ? { ...e, title: body.title, subtitle: body.subtitle, details: body.details, imageUrl: body.imageUrl } : e);
      api.put(`/api/events/${editingId}`, body);
      onSave({ events: updated });
    } else {
      // New item — can't predict ID, so await and sync
      const sortOrder = events.reduce((max, e) => Math.max(max, e.sortOrder + 1), 0);
      await api.post('/api/events', { ...body, sortOrder });
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
    // The copy opens in the "Add New Event" form at the top of the section
    requestAnimationFrame(() => topFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const renderForm = (inline = false) => (
      <div ref={inline ? undefined : topFormRef} style={inline ? { padding: '12px' } : formGroupStyle}>
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
            <button style={{ ...btn, background: 'var(--theme-color-primary-400)' }} onClick={() => setPreviewingForm(true)}>
              Preview
            </button>
            <button style={{ ...btn, background: '#888' }} onClick={cancelEdit}>
              {editingId ? 'Cancel' : 'Close'}
            </button>
          </div>
        </div>
      </div>
  );

  return (
    <section style={{ ...sectionStyle, ...(hasChanged ? sectionChangedStyle : {}) }}>
      <h2 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        Events
        {hasChanged && <span style={{ color: 'var(--theme-color-secondary-600)', fontSize: '12px' }}>●</span>}
      </h2>

      {/* Add Event Form (editing opens in place, inside the event's card) */}
      {formExpanded && editingId === null ? renderForm() : (
        <button
          style={{ ...btn, width: '100%', marginBottom: '16px' }}
          onClick={() => { cancelEdit(); setFormExpanded(true); }}
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

      {/* Events List: one column at every width so the order is easy to read */}
      {events.length > 0 && (
        <div style={listHeaderStyle}>
          <span>Current Events{events.length > 1 && <span style={{ fontWeight: 400, color: '#888' }}> · drag ⋮⋮ to reorder</span>}</span>
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
          // NEW badge as residents see it now (from the published copy)
          const isLiveNew = !!pub && !isMarkedForDeletion && isEventNew(pub, config);
          const isEditing = editingId === e.id;

          return (
            <div
              key={e.id}
              ref={rowRef(e.id)}
              data-testid="event-card"
              style={{
                ...editorCardStyle,
                ...(isMarkedForDeletion ? editorCardDeletedStyle : {}),
                ...(hasChanges ? editorCardChangedStyle : {}),
                ...rowStyle(e.id),
              }}
            >
              {isEditing ? renderForm(true) : (
                <>
                  <div style={editorCardTopStyle}>
                    {events.length > 1 ? (
                      <span
                        {...handleProps(e.id)}
                        style={{ ...handleProps(e.id).style, ...editorCardHandleStyle }}
                      >
                        ⋮⋮
                      </span>
                    ) : (
                      <span style={{ width: '8px', flexShrink: 0 }} />
                    )}
                    <div
                      style={{
                        ...editorCardBodyStyle,
                        ...(isMarkedForDeletion ? { opacity: 0.55 } : {}),
                      }}
                    >
                      <span style={{ ...editorCardTitleStyle, ...(isMarkedForDeletion ? { textDecoration: 'line-through' } : {}) }}>
                        {e.title}
                      </span>
                      {e.subtitle && <span style={editorCardTextStyle}>{e.subtitle}</span>}
                      <span style={editorCardMetaStyle}>
                        {isMarkedForDeletion ? (
                          <span style={{ ...chipStyle, ...chipRemovingStyle }} title="Will be removed on publish">Removing</span>
                        ) : isNewDraft ? (
                          <span style={{ ...chipStyle, ...chipDraftStyle }} title="Not published yet">Draft</span>
                        ) : (
                          <>
                            {isLiveNew && <span style={{ ...chipStyle, ...chipNewStyle }} title="Shows a NEW badge in the lobby">New</span>}
                            {hasChanges && <span style={{ ...chipStyle, ...chipEditedStyle }} title="Edited since the last publish">Edited</span>}
                          </>
                        )}
                        <span>{e.details.length} detail{e.details.length !== 1 ? 's' : ''}</span>
                        {e.imageUrl && <span>has image</span>}
                      </span>
                    </div>
                    {e.imageUrl && (
                      <div
                        style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '8px',
                          backgroundImage: `url(${e.imageUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          flexShrink: 0,
                          ...(isMarkedForDeletion ? { opacity: 0.4 } : {}),
                        }}
                      />
                    )}
                  </div>
                  {isMarkedForDeletion ? (
                    <div style={actionBarStyle(1)}>
                      <button
                        style={{ ...actionBarButtonStyle, ...actionBarButtonFirstStyle, ...actionBarUndoStyle }}
                        onClick={() => unmarkForDeletion(e.id)}
                      >
                        <UndoIcon /> Undo remove
                      </button>
                    </div>
                  ) : (
                    <div style={actionBarStyle(4)}>
                      <button
                        style={{ ...actionBarButtonStyle, ...actionBarButtonFirstStyle, ...actionBarPrimaryStyle }}
                        onClick={() => startEdit(e)}
                      >
                        <EditIcon /> Edit
                      </button>
                      <button style={actionBarButtonStyle} onClick={() => setPreviewEvent(e)}>
                        <PreviewIcon /> Preview
                      </button>
                      <button style={actionBarButtonStyle} onClick={() => cloneEvent(e)} title="Duplicate as a new event">
                        <CopyIcon /> Copy
                      </button>
                      <button
                        style={{ ...actionBarButtonStyle, ...actionBarDangerStyle }}
                        onClick={() => markForDeletion(e.id)}
                      >
                        <TrashIcon /> Delete
                      </button>
                    </div>
                  )}
                </>
              )}
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
      <NewBadgeSetting config={config} onSave={onSave as (o?: Record<string, unknown>) => void} />
    </section>
  );
}
