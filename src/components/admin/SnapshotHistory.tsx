/**
 * History page ("time machine", design C).
 *
 * A full-screen layer over the admin page:
 *   header (back to editor, ⋯ menu)
 *   scrubber: ◀ vN ▶ plus a slider with one dot per publish
 *   [scrolling area] the lobby screen as it looked at vN (real dashboard in an
 *                    iframe, scaled down), then the list of what differs from now
 *   tray: Back to live · Restore vN
 *
 * Only the middle area scrolls; header, scrubber and tray never move.
 * "Now" means the current draft (what the editor shows), so a per-item restore
 * makes its row disappear right away. Everything here changes the draft only:
 * nothing reaches the lobby until the user publishes.
 *
 * Styles live in SnapshotHistory.css (class rules only, see CLAUDE.md on
 * border shorthand).
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Snapshot, SnapshotDiff, Service, Event, Advisory } from '../../types';
import { api } from '../../utils/api';
import './SnapshotHistory.css';

interface SnapshotHistoryProps {
  /** Close the history page and go back to the editor. */
  onClose: () => void;
  /** Called after a full restore (the page closes). */
  onRestore: () => void;
  /** Called after a single-item change (the page stays open). */
  onItemRestore?: () => void;
}

type Kind = 'services' | 'events' | 'advisories';
type RowState = 'only-then' | 'not-then' | 'removing' | 'different';
interface Row {
  key: string;
  kind: Kind | 'config';
  state: RowState;
  title: string;
  detail: string;
  action?: { label: string; danger?: boolean; run: () => Promise<unknown> };
}

const STATE_LABEL: Record<RowState, string> = {
  'only-then': 'Only then',
  'not-then': 'Not then',
  removing: 'Removing',
  different: 'Different',
};
const KIND_LABEL: Record<Row['kind'], string> = {
  services: 'Service',
  events: 'Event',
  advisories: 'Advisory',
  config: 'Setting',
};
const CONFIG_LABEL: Record<string, string> = {
  dashboardTitle: 'Dashboard title',
  titleFontSize: 'Title size',
  timezone: 'Timezone',
  logoUrl: 'Logo',
  customLogos: 'Logos',
  themePreset: 'Theme',
  fontFamily: 'Font',
  fontScale: 'Text size',
  colorPrimary: 'Primary color',
  colorSecondary: 'Secondary color',
  newBadgeMode: 'NEW badge',
  newBadgeDays: 'NEW badge days',
  newBadgeColor: 'NEW badge color',
};

/** Size the lobby screen is rendered at before being scaled to fit. */
const LOBBY_W = 1280;
const LOBBY_H = 720;

function short(v: unknown, max = 40): string {
  const s = v === null || v === undefined || v === '' ? '(empty)' : String(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function formatWhen(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

export function hasAnyDiff(diff: SnapshotDiff): boolean {
  return (['services', 'events', 'advisories'] as const).some(k =>
    diff[k].added.length + diff[k].removed.length + diff[k].changed.length > 0,
  ) || (diff.config?.changed?.length ?? 0) > 0;
}

function serviceText(s: Service) {
  return `${s.status}${s.notes ? ` · ${s.notes}` : ''}`;
}

/**
 * Turn a "vN → now" diff into the rows of the "Different from now" list.
 * Exported for tests.
 */
export function buildRows(
  diff: SnapshotDiff,
  version: number,
  act: {
    restore: (kind: Kind, id: number) => Promise<unknown>;
    remove: (kind: Kind, id: number) => Promise<unknown>;
    keep: (kind: Kind, id: number) => Promise<unknown>;
  },
): Row[] {
  const rows: Row[] = [];
  const name = (kind: Kind, item: Service | Event | Advisory) =>
    kind === 'services' ? (item as Service).name : kind === 'events' ? (item as Event).title : (item as Advisory).message;

  (['services', 'events', 'advisories'] as const).forEach(kind => {
    const d = diff[kind];
    // In vN, gone now
    (d.removed as (Service | Event | Advisory)[]).forEach(item => rows.push({
      key: `${kind}-r-${item.id}`, kind, state: 'only-then', title: name(kind, item),
      detail: `On the lobby in v${version}, not now`,
      action: { label: 'Use this', run: () => act.restore(kind, item.id) },
    }));
    // Changed between vN and now
    (d.changed as { from: Service | Event | Advisory; to: Service | Event | Advisory }[]).forEach(({ from, to }) => {
      let detail: string;
      if (kind === 'services') {
        const f = from as Service, t = to as Service;
        detail = f.status !== t.status
          ? `${f.status} then · ${t.status} now`
          : f.name !== t.name ? `Was "${short(f.name)}"` : `Note then: ${short(f.notes)}`;
      } else if (kind === 'events') {
        const f = from as Event, t = to as Event;
        detail = f.title !== t.title ? `Now "${short(t.title)}"`
          : f.imageUrl !== t.imageUrl ? 'Different image'
            : f.subtitle !== t.subtitle ? `Subtitle then: ${short(f.subtitle)}` : 'Different details';
      } else {
        const f = from as Advisory, t = to as Advisory;
        detail = f.active !== t.active ? `${f.active ? 'Showing' : 'Hidden'} then · ${t.active ? 'showing' : 'hidden'} now` : `Now "${short(t.message)}"`;
      }
      rows.push({
        key: `${kind}-c-${from.id}`, kind, state: 'different', title: name(kind, from), detail,
        action: { label: 'Use this', run: () => act.restore(kind, from.id) },
      });
    });
    // There now, not in vN
    (d.added as (Service | Event | Advisory)[]).forEach(item => {
      const marked = (item as { markedForDeletion?: boolean }).markedForDeletion;
      rows.push(marked
        ? {
          key: `${kind}-a-${item.id}`, kind, state: 'removing', title: name(kind, item),
          detail: 'Removed in your draft, goes away when you publish',
          action: { label: 'Keep', run: () => act.keep(kind, item.id) },
        }
        : {
          key: `${kind}-a-${item.id}`, kind, state: 'not-then', title: name(kind, item),
          detail: `Added after v${version}`,
          action: { label: 'Remove', danger: true, run: () => act.remove(kind, item.id) },
        });
    });
  });

  (diff.config?.changed ?? []).forEach(c => {
    const label = CONFIG_LABEL[c.field] ?? c.field;
    rows.push({
      key: `config-${c.field}`, kind: 'config', state: 'different', title: label,
      detail: c.field === 'customLogos' || c.field === 'logoUrl' ? 'Different logo' : `${short(c.from, 24)} then · ${short(c.to, 24)} now`,
    });
  });
  return rows;
}

/** The real lobby screen at a version, rendered at TV size and scaled to fit. */
function LobbyPreview({ version }: { version: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / LOBBY_W);
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={boxRef} className="tm-lobby">
      <iframe
        key={version}
        title={`Lobby screen at v${version}`}
        src={`/?snapshot=${version}`}
        tabIndex={-1}
        style={{ width: `${LOBBY_W}px`, height: `${LOBBY_H}px`, transform: `scale(${scale})` }}
      />
    </div>
  );
}

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
  </svg>
);

export function SnapshotHistory({ onClose, onRestore, onItemRestore }: SnapshotHistoryProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [index, setIndex] = useState(0); // 0 = live (newest)
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [diffFor, setDiffFor] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const loadSnapshots = useCallback(async (keepVersion?: number) => {
    const list = await api.get<Snapshot[]>('/api/snapshots');
    setSnapshots(list);
    setIndex(prev => {
      if (keepVersion !== undefined) {
        const i = list.findIndex(s => s.version === keepVersion);
        if (i >= 0) return i;
      }
      return Math.min(prev, Math.max(0, list.length - 1));
    });
    return list;
  }, []);

  // Open on the version before live: the usual question is "what was there before?"
  useEffect(() => {
    loadSnapshots().then(list => setIndex(list.length > 1 ? 1 : 0)).catch(() => setError("Couldn't load the history."));
  }, [loadSnapshots]);

  const current = snapshots?.[index];
  const version = current?.version;

  const loadDiff = useCallback(async (v: number) => {
    try {
      const d = await api.get<SnapshotDiff>(`/api/snapshots/${v}/diff/draft`);
      setDiff(d);
      setDiffFor(v);
    } catch {
      setError("Couldn't compare this version with now.");
    }
  }, []);
  useEffect(() => {
    if (version !== undefined) loadDiff(version);
  }, [version, loadDiff]);

  // ← → step through versions (older / newer), Esc closes
  const total = snapshots?.length ?? 0;
  const older = useCallback(() => setIndex(i => Math.min(i + 1, total - 1)), [total]);
  const newer = useCallback(() => setIndex(i => Math.max(i - 1, 0)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); older(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); newer(); }
      else if (e.key === 'Escape') { e.preventDefault(); if (menuOpen) setMenuOpen(false); else onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [older, newer, onClose, menuOpen]);

  const run = async (key: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      after?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const itemChanged = async () => {
    if (version !== undefined) await loadDiff(version);
    (onItemRestore || onRestore)();
  };

  const rows = useMemo(() => {
    if (!diff || diffFor === null) return [];
    return buildRows(diff, diffFor, {
      restore: (kind, id) => api.post('/api/snapshots/restore-items', { sourceVersion: diffFor, items: { [kind]: [id] } }),
      remove: (kind, id) => api.del(`/api/${kind}/${id}`),
      keep: (kind, id) => api.post(`/api/${kind}/${id}/unmark`),
    });
  }, [diff, diffFor]);

  const restoreAll = () => {
    if (version === undefined) return;
    if (!confirm(`Restore v${version} as your draft? Nothing changes on the lobby until you publish.`)) return;
    run('restore-all', () => api.post(`/api/snapshots/restore/${version}`), onRestore);
  };

  const deleteVersion = () => {
    setMenuOpen(false);
    if (version === undefined || index === 0) return;
    if (!confirm(`Delete v${version} from the history? This cannot be undone.`)) return;
    run('delete', () => api.del(`/api/snapshots/${version}`), () => { loadSnapshots(); });
  };

  const purge = () => {
    setMenuOpen(false);
    if (!confirm('Delete every old version and keep only the live one? This cannot be undone.')) return;
    run('purge', () => api.del('/api/snapshots'), () => { loadSnapshots().then(() => setIndex(0)); });
  };

  const live = snapshots?.[0];
  const isLive = index === 0;
  const when = current ? formatWhen(current.publishedAt) : null;
  const behind = index === 0 ? 'Live now' : index === 1 ? '1 version before live' : `${index} versions before live`;
  const diffReady = diffFor === version && diff !== null;

  return (
    <div className="tm" role="dialog" aria-modal="true" aria-label="History">
      <div className="tm-top">
        <div className="tm-bar">
          <button type="button" className="tm-back" onClick={onClose}>
            <Chevron dir="left" />Editor
          </button>
          <div className="tm-title">
            <h2>History</h2>
            <span>{live ? <>● Live on the lobby · v{live.version}</> : ' '}</span>
          </div>
          <div className="tm-menu-wrap">
            <button type="button" className="tm-icon" aria-label="More" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="2" /><circle cx="10" cy="10" r="2" /><circle cx="16" cy="10" r="2" /></svg>
            </button>
            {menuOpen && (
              <>
                <div className="tm-menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="tm-menu" role="menu">
                  <button type="button" role="menuitem" className="is-danger" disabled={isLive || !current} onClick={deleteVersion}>
                    Delete {current && !isLive ? `v${current.version}` : 'this version'}
                  </button>
                  <button type="button" role="menuitem" className="is-danger" disabled={total < 2} onClick={purge}>Delete all old versions</button>
                </div>
              </>
            )}
          </div>
        </div>

        {current && when && (
          <div className="tm-scrub">
            <div className="tm-scrub-row">
              <button type="button" className="tm-arrow" onClick={older} disabled={index >= total - 1} aria-label="Older version">
                <Chevron dir="left" />
              </button>
              <div className="tm-cur" aria-live="polite">
                <b>v{current.version} · {when.date}</b>
                <small>{when.time} · {current.publishedBy} · {behind}</small>
              </div>
              <button type="button" className="tm-arrow" onClick={newer} disabled={index === 0} aria-label="Newer version">
                <Chevron dir="right" />
              </button>
            </div>
            {total > 1 && (
              <div className="tm-track">
                {total <= 60 && (
                  <div className="tm-dots" aria-hidden="true">
                    {snapshots!.map((s, i) => (
                      <i key={s.version} className={i === 0 ? 'is-live' : undefined} style={{ left: `${((total - 1 - i) / (total - 1)) * 100}%` }} />
                    ))}
                  </div>
                )}
                <input
                  type="range"
                  min={0}
                  max={total - 1}
                  step={1}
                  value={total - 1 - index}
                  aria-label="Version"
                  aria-valuetext={`v${current.version}`}
                  onChange={e => setIndex(total - 1 - Number(e.target.value))}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="tm-scroll">
        <div className="tm-body">
          {error && <div className="tm-error" role="alert">{error}</div>}
          {!snapshots && !error && <p className="tm-muted">Loading history…</p>}
          {snapshots && snapshots.length === 0 && (
            <p className="tm-muted">Nothing has been published yet. Every publish will show up here.</p>
          )}
          {current && (
            <div className="tm-grid">
              <div>
                <LobbyPreview version={current.version} />
                <p className="tm-note">
                  The lobby screen as it looked at v{current.version}.{' '}
                  <a href={`/?snapshot=${current.version}`} target="_blank" rel="noopener noreferrer">Open full size</a>
                </p>
              </div>
              <section className="tm-card" aria-label="Different from now">
                <div className="tm-card-head">
                  <h3>Different from now</h3>
                  {diffReady && rows.length > 0 && <span className="tm-count">{rows.length}</span>}
                </div>
                {!diffReady && <p className="tm-muted tm-pad">Comparing…</p>}
                {diffReady && rows.length === 0 && (
                  <p className="tm-muted tm-pad">
                    {isLive ? 'Your draft matches what is on the lobby.' : `Nothing differs: your draft already matches v${current.version}.`}
                  </p>
                )}
                {diffReady && rows.map(row => (
                  <div key={row.key} className="tm-row">
                    <span className={`tm-chip is-${row.state}`}>{STATE_LABEL[row.state]}</span>
                    <div className="tm-row-txt">
                      <span className="tm-row-title">{row.title}</span>
                      <span className="tm-row-detail">{KIND_LABEL[row.kind]} · {row.detail}</span>
                    </div>
                    {row.action && (
                      <button
                        type="button"
                        className={`tm-mini${row.action.danger ? ' is-danger' : ''}`}
                        disabled={busy !== null}
                        onClick={() => run(row.key, row.action!.run, itemChanged)}
                      >
                        {busy === row.key ? '…' : row.action.label}
                      </button>
                    )}
                  </div>
                ))}
                {diffReady && rows.some(r => r.kind === 'config') && (
                  <p className="tm-muted tm-pad tm-small">Settings come back with Restore v{current.version}.</p>
                )}
              </section>
            </div>
          )}
        </div>
      </div>

      {current && (
        <div className="tm-tray">
          <div className="tm-tray-txt">
            <b>{isLive ? 'Viewing the live version' : `Viewing v${current.version}`}</b>
            <small>Restoring changes your draft only. Publish to put it on the lobby.</small>
          </div>
          {!isLive && <button type="button" className="tm-btn" onClick={() => setIndex(0)}>Back to live</button>}
          <button
            type="button"
            className="tm-btn is-primary"
            disabled={busy !== null || (isLive && diffReady && rows.length === 0)}
            onClick={restoreAll}
          >
            Restore v{current.version}
          </button>
        </div>
      )}
    </div>
  );
}
