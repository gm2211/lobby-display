/**
 * "Not yet on the lobby" panel: every unpublished change, each with its own Undo,
 * plus Preview / Publish / Discard. Shown as a side panel on wide screens and in
 * the "Review changes" sheet on iPhone and iPad (see Admin.tsx).
 *
 * Undo per kind:
 * - removing  -> POST /api/<section>/:id/unmark
 * - edited    -> POST /api/snapshots/restore-items from the latest published version
 * - added     -> DELETE /api/<section>/:id (marks it; never-published items vanish on publish)
 * - reordered / settings -> no per-item undo (Discard all covers them)
 */
import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import type { DraftChange } from '../../utils/draftChanges';
import { PreviewIcon, UndoIcon } from './EditorIcons';

const SECTION_LABEL: Record<DraftChange['section'], string> = {
  services: 'Services',
  events: 'Events',
  advisories: 'Advisories',
  config: 'Settings',
};
const KIND_LABEL: Record<DraftChange['kind'], string> = {
  added: 'added',
  edited: 'edited',
  removing: 'removing',
  reordered: 'reordered',
};

interface Props {
  changes: DraftChange[];
  hasChanges: boolean;
  /** Bumped when a publish lands, so we refetch the latest version number */
  publishedKey: unknown;
  onChanged: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onDiscard: () => void;
}

export function ChangesPanel({ changes, hasChanges, publishedKey, onChanged, onPreview, onPublish, onDiscard }: Props) {
  const [latestVersion, setLatestVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ version: number }[]>('/api/snapshots')
      .then(list => setLatestVersion(list[0]?.version ?? null))
      .catch(() => setLatestVersion(null));
  }, [publishedKey]);

  const canUndo = (c: DraftChange) =>
    c.id !== undefined && c.section !== 'config' &&
    (c.kind === 'removing' || c.kind === 'added' || (c.kind === 'edited' && latestVersion !== null));

  const undo = async (c: DraftChange) => {
    if (c.id === undefined || c.section === 'config') return;
    setBusy(c.key);
    try {
      if (c.kind === 'removing') await api.post(`/api/${c.section}/${c.id}/unmark`);
      else if (c.kind === 'added') await api.del(`/api/${c.section}/${c.id}`);
      else if (c.kind === 'edited' && latestVersion !== null) {
        await api.post('/api/snapshots/restore-items', { sourceVersion: latestVersion, items: { [c.section]: [c.id] } });
      }
    } catch {
      // The resync below shows the real state; the page-level toast reports write errors
    } finally {
      setBusy(null);
      onChanged();
    }
  };

  const count = changes.length;
  return (
    <div className="admin-changes">
      <div className="admin-changes-head">
        <strong>Not yet on the lobby</strong>
        <span>{hasChanges ? (count ? `${count} change${count === 1 ? '' : 's'}` : 'Changes') : 'Up to date'}</span>
      </div>
      {!hasChanges && <p className="admin-changes-empty">Everything you see here is live on the lobby screen.</p>}
      {hasChanges && count === 0 && <p className="admin-changes-empty">Some settings changed since the last publish.</p>}
      {changes.length > 0 && (
        <ul className="admin-changes-list">
          {changes.map(c => (
            <li key={c.key}>
              <span className="admin-changes-text">
                <span className="admin-changes-section">{SECTION_LABEL[c.section]}</span>
                <span className="admin-changes-label">
                  <span className={c.kind === 'removing' ? 'is-removing' : undefined}>{c.label}</span>
                  <span className="admin-changes-kind"> · {KIND_LABEL[c.kind]}</span>
                </span>
              </span>
              {canUndo(c) && (
                <button type="button" className="admin-changes-undo" disabled={busy === c.key} onClick={() => undo(c)}>
                  <UndoIcon />Undo
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="admin-changes-actions">
        <button type="button" className="admin-btn" disabled={!hasChanges} onClick={onPreview}><PreviewIcon />Preview lobby</button>
        <button type="button" className="admin-btn admin-btn-primary" disabled={!hasChanges} onClick={onPublish}>
          {count ? `Publish ${count} change${count === 1 ? '' : 's'}` : 'Publish'}
        </button>
        <button type="button" className="admin-btn admin-btn-danger" disabled={!hasChanges} onClick={onDiscard}>Discard all</button>
      </div>
    </div>
  );
}
