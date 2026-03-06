import { useState, useEffect, useCallback } from 'react';
import type { Snapshot, SnapshotDiff, Service, Event, Advisory } from '../../types';
import { api } from '../../utils/api';
import {
  smallBtn, smallBtnDanger, smallBtnSuccess, smallBtnPrimary, smallBtnInfo,
  modalOverlay, modal,
} from '../../styles';

interface SnapshotHistoryProps {
  onRestore: () => void;
  onItemRestore?: () => void; // Called for single-item restores (doesn't close modal)
}

export function SnapshotHistory({ onRestore, onItemRestore }: SnapshotHistoryProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);

  useEffect(() => {
    api.get<Snapshot[]>('/api/snapshots').then(setSnapshots);
  }, []);

  // Navigation for preview
  const goToPrevVersion = useCallback(() => {
    if (previewVersion === null || snapshots.length === 0) return;
    const currentIndex = snapshots.findIndex(s => s.version === previewVersion);
    if (currentIndex < snapshots.length - 1) {
      setPreviewVersion(snapshots[currentIndex + 1].version);
    }
  }, [previewVersion, snapshots]);

  const goToNextVersion = useCallback(() => {
    if (previewVersion === null || snapshots.length === 0) return;
    const currentIndex = snapshots.findIndex(s => s.version === previewVersion);
    if (currentIndex > 0) {
      setPreviewVersion(snapshots[currentIndex - 1].version);
    }
  }, [previewVersion, snapshots]);

  // Keyboard navigation
  useEffect(() => {
    if (previewVersion === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevVersion();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNextVersion();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPreviewVersion(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewVersion, goToPrevVersion, goToNextVersion]);

  // Prevent body scroll when preview modal is open
  useEffect(() => {
    if (previewVersion !== null) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [previewVersion]);

  const loadDiff = async (version: number) => {
    if (selectedVersion === version) {
      setSelectedVersion(null);
      setDiff(null);
      return;
    }
    setLoading(true);
    setSelectedVersion(version);
    const data = await api.get<SnapshotDiff>(`/api/snapshots/${version}/diff/draft`);
    setDiff(data);
    setLoading(false);
  };

  const reloadDiff = async () => {
    if (selectedVersion === null) return;
    const data = await api.get<SnapshotDiff>(`/api/snapshots/${selectedVersion}/diff/draft`);
    setDiff(data);
  };

  const restoreFull = async (version: number) => {
    if (!confirm(`Restore entire snapshot v${version} as draft? You'll need to publish to make it live.`)) return;
    await api.post(`/api/snapshots/restore/${version}`);
    setSelectedVersion(null);
    setDiff(null);
    onRestore();
  };

  const deleteSnapshot = async (version: number) => {
    if (!confirm(`Delete snapshot v${version}? This cannot be undone.`)) return;
    await api.del(`/api/snapshots/${version}`);
    api.get<Snapshot[]>('/api/snapshots').then(setSnapshots);
  };

  const purgeAllHistory = async () => {
    if (!confirm('Delete all old snapshots and keep only the latest version? This cannot be undone.')) return;
    await api.del('/api/snapshots');
    api.get<Snapshot[]>('/api/snapshots').then(setSnapshots);
  };

  // Exclude the current (latest) version from history - it's the current state
  const historicalSnapshots = snapshots.slice(1);

  if (historicalSnapshots.length === 0) {
    return (
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Version History</h2>
        <p style={{ color: '#888', fontSize: '14px' }}>No previous versions yet.</p>
      </section>
    );
  }

  return (
    <section style={styles.section}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ ...styles.sectionTitle, margin: 0 }}>Version History</h2>
        {historicalSnapshots.length > 0 && (
          <button
            style={{ ...smallBtn, ...smallBtnDanger, fontSize: '11px' }}
            onClick={purgeAllHistory}
          >
            Purge Old Versions
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {historicalSnapshots.map((s) => (
          <div key={s.version}>
            <div
              style={{ ...styles.snapshotRow, cursor: 'pointer' }}
              onClick={() => loadDiff(s.version)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontWeight: 600, color: '#1a5c5a' }}>v{s.version}</span>
                <span style={{ color: '#888', fontSize: '13px' }}>
                  {new Date(s.publishedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
                <span style={{ color: '#666', fontSize: '12px' }}>
                  by {s.publishedBy}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                {selectedVersion === s.version && (
                  <>
                    <button
                      style={{ ...smallBtn, ...smallBtnPrimary }}
                      onClick={() => setPreviewVersion(s.version)}
                    >
                      Preview
                    </button>
                    <button
                      style={{ ...smallBtn, ...smallBtnSuccess }}
                      onClick={() => restoreFull(s.version)}
                    >
                      Restore All
                    </button>
                  </>
                )}
                <button
                  style={{ ...smallBtn, ...smallBtnDanger }}
                  onClick={() => deleteSnapshot(s.version)}
                  title="Delete this snapshot"
                >
                  ✕
                </button>
              </div>
            </div>

            {selectedVersion === s.version && (
              <div style={styles.diffPanel}>
                {loading ? (
                  <p style={{ color: '#888' }}>Loading diff...</p>
                ) : diff ? (
                  <SnapshotDiffView
                    diff={diff}
                    sourceVersion={s.version}
                    onRestore={onRestore}
                    onItemRestore={onItemRestore}
                    reloadDiff={reloadDiff}
                    onClose={() => {
                      setSelectedVersion(null);
                      setDiff(null);
                    }}
                  />
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>

      {previewVersion !== null && (() => {
        const currentIndex = snapshots.findIndex(s => s.version === previewVersion);
        const hasPrev = currentIndex < snapshots.length - 1;
        const hasNext = currentIndex > 0;
        return (
          <div style={modalOverlay} onClick={() => setPreviewVersion(null)}>
            {/* Left arrow */}
            <button
              style={{
                ...styles.navArrow,
                left: '16px',
                opacity: hasPrev ? 1 : 0.3,
                cursor: hasPrev ? 'pointer' : 'default',
              }}
              onClick={e => { e.stopPropagation(); goToPrevVersion(); }}
              disabled={!hasPrev}
              title={hasPrev ? `Previous: v${snapshots[currentIndex + 1]?.version}` : 'No older version'}
            >
              ←
            </button>

            <div style={modal} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <strong style={{ color: '#333' }}>Preview — Version {previewVersion}</strong>
                  <span style={{ color: '#666', fontSize: '12px' }}>← → to navigate, Esc to close</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    style={{ ...smallBtn, ...smallBtnSuccess }}
                    onClick={() => {
                      restoreFull(previewVersion);
                      setPreviewVersion(null);
                    }}
                  >
                    Restore This Version
                  </button>
                  <button style={smallBtn} onClick={() => setPreviewVersion(null)}>
                    Close
                  </button>
                </div>
              </div>
              <iframe
                src={`/?snapshot=${previewVersion}`}
                style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }}
              />
            </div>

            {/* Right arrow */}
            <button
              style={{
                ...styles.navArrow,
                right: '16px',
                opacity: hasNext ? 1 : 0.3,
                cursor: hasNext ? 'pointer' : 'default',
              }}
              onClick={e => { e.stopPropagation(); goToNextVersion(); }}
              disabled={!hasNext}
              title={hasNext ? `Next: v${snapshots[currentIndex - 1]?.version}` : 'No newer version'}
            >
              →
            </button>
          </div>
        );
      })()}
    </section>
  );
}

interface SnapshotDiffViewProps {
  diff: SnapshotDiff;
  sourceVersion: number;
  onRestore: () => void;
  onItemRestore?: () => void;
  reloadDiff: () => Promise<void>;
  onClose: () => void;
}

function SnapshotDiffView({ diff, sourceVersion, onRestore, onItemRestore, reloadDiff, onClose }: SnapshotDiffViewProps) {
  const hasAnyDiff =
    diff.services.added.length > 0 ||
    diff.services.removed.length > 0 ||
    diff.services.changed.length > 0 ||
    diff.events.added.length > 0 ||
    diff.events.removed.length > 0 ||
    diff.events.changed.length > 0 ||
    diff.advisories.added.length > 0 ||
    diff.advisories.removed.length > 0 ||
    diff.advisories.changed.length > 0 ||
    (diff.config?.changed?.length ?? 0) > 0;

  if (!hasAnyDiff) {
    return (
      <div style={{ padding: '12px', color: '#888' }}>
        No differences between v{sourceVersion} and current.
      </div>
    );
  }

  const restoreSingleItem = async (type: 'services' | 'events' | 'advisories', id: number) => {
    await api.post('/api/snapshots/restore-items', {
      sourceVersion,
      items: { [type]: [id] },
    });
    // Reload diff to show updated state, then notify parent
    await reloadDiff();
    (onItemRestore || onRestore)();
  };

  const columnStyle: React.CSSProperties = { flex: 1, minWidth: 0 };
  const headerStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: '#888', padding: '8px 12px', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: '#eee' };
  const cellStyle: React.CSSProperties = { padding: '8px 12px', fontSize: '13px', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: '#f0f0f0' };
  const removedBg = 'rgba(244, 67, 54, 0.10)';
  const addedBg = 'rgba(76, 175, 80, 0.10)';
  const changedBg = 'rgba(180, 120, 0, 0.08)';

  return (
    <div style={{ padding: '12px 0' }}>
      {/* Side-by-side header */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '16px' }}>
        <div style={{ ...columnStyle, ...headerStyle, background: 'rgba(244, 67, 54, 0.1)', borderRadius: '6px 0 0 0' }}>
          v{sourceVersion}
        </div>
        <div style={{ ...columnStyle, ...headerStyle, background: 'rgba(76, 175, 80, 0.1)', borderRadius: '0 6px 0 0' }}>
          Current
        </div>
      </div>

      {/* Services */}
      {(diff.services.added.length > 0 || diff.services.removed.length > 0 || diff.services.changed.length > 0) && (
        <SideBySideSection title="SERVICES">
          {diff.services.removed.map((s) => (
            <SideBySideRow
              key={s.id}
              left={<span style={{ color: '#f44336' }}>− {s.name} <span style={{ color: '#888', fontSize: '11px' }}>({s.status})</span></span>}
              right={null}
              leftBg={removedBg}
              onRestore={() => restoreSingleItem('services', s.id)}
            />
          ))}
          {diff.services.added.map((s) => (
            <SideBySideRow
              key={s.id}
              left={null}
              right={<span style={{ color: '#4caf50' }}>+ {s.name} <span style={{ color: '#888', fontSize: '11px' }}>({s.status})</span></span>}
              rightBg={addedBg}
            />
          ))}
          {diff.services.changed.map((c) => (
            <SideBySideRow
              key={c.from.id}
              left={<span style={{ color: '#b07800' }}>{c.from.name} <span style={{ color: '#888', fontSize: '11px' }}>({c.from.status})</span></span>}
              right={<span style={{ color: '#b07800' }}>{c.to.name} <span style={{ color: '#888', fontSize: '11px' }}>({c.to.status})</span></span>}
              leftBg={changedBg}
              rightBg={changedBg}
              onRestore={() => restoreSingleItem('services', c.from.id)}
            />
          ))}
        </SideBySideSection>
      )}

      {/* Events */}
      {(diff.events.added.length > 0 || diff.events.removed.length > 0 || diff.events.changed.length > 0) && (
        <SideBySideSection title="EVENTS">
          {diff.events.removed.map((e) => (
            <SideBySideRow
              key={e.id}
              left={<span style={{ color: '#f44336' }}>− {e.title}</span>}
              right={null}
              leftBg={removedBg}
              onRestore={() => restoreSingleItem('events', e.id)}
            />
          ))}
          {diff.events.added.map((e) => (
            <SideBySideRow
              key={e.id}
              left={null}
              right={<span style={{ color: '#4caf50' }}>+ {e.title}</span>}
              rightBg={addedBg}
            />
          ))}
          {diff.events.changed.map((c) => (
            <SideBySideRow
              key={c.from.id}
              left={<span style={{ color: '#b07800' }}>{c.from.title}</span>}
              right={<span style={{ color: '#b07800' }}>{c.to.title}</span>}
              leftBg={changedBg}
              rightBg={changedBg}
              onRestore={() => restoreSingleItem('events', c.from.id)}
            />
          ))}
        </SideBySideSection>
      )}

      {/* Advisories */}
      {(diff.advisories.added.length > 0 || diff.advisories.removed.length > 0 || diff.advisories.changed.length > 0) && (
        <SideBySideSection title="ADVISORIES">
          {diff.advisories.removed.map((a) => (
            <SideBySideRow
              key={a.id}
              left={<span style={{ color: '#f44336' }}>− {a.message}</span>}
              right={null}
              leftBg={removedBg}
              onRestore={() => restoreSingleItem('advisories', a.id)}
            />
          ))}
          {diff.advisories.added.map((a) => (
            <SideBySideRow
              key={a.id}
              left={null}
              right={<span style={{ color: '#4caf50' }}>+ {a.message}</span>}
              rightBg={addedBg}
            />
          ))}
          {diff.advisories.changed.map((c) => (
            <SideBySideRow
              key={c.from.id}
              left={<span style={{ color: '#b07800' }}>{c.from.message}</span>}
              right={<span style={{ color: '#b07800' }}>{c.to.message}</span>}
              leftBg={changedBg}
              rightBg={changedBg}
              onRestore={() => restoreSingleItem('advisories', c.from.id)}
            />
          ))}
        </SideBySideSection>
      )}

      {/* Config */}
      {(diff.config?.changed?.length ?? 0) > 0 && (
        <SideBySideSection title="CONFIG">
          {diff.config.changed.map((c) => (
            <SideBySideRow
              key={c.field}
              left={<span style={{ color: '#b07800' }}>{c.field}: {c.from || '(empty)'}</span>}
              right={<span style={{ color: '#b07800' }}>{c.field}: {c.to || '(empty)'}</span>}
              leftBg={changedBg}
              rightBg={changedBg}
            />
          ))}
        </SideBySideSection>
      )}
    </div>
  );
}

function SideBySideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#888', letterSpacing: '0.5px', marginBottom: '8px' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {children}
      </div>
    </div>
  );
}

function SideBySideRow({ left, right, leftBg, rightBg, onRestore }: {
  left: React.ReactNode;
  right: React.ReactNode;
  leftBg?: string;
  rightBg?: string;
  onRestore?: () => void;
}) {
  const cellStyle: React.CSSProperties = {
    flex: 1,
    padding: '8px 12px',
    fontSize: '13px',
    minHeight: '36px',
    display: 'flex',
    alignItems: 'center',
  };

  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      <div style={{ ...cellStyle, background: leftBg || '#f5f5f5', borderRadius: '4px 0 0 4px' }}>
        {left || <span style={{ color: '#999' }}>—</span>}
      </div>
      <div style={{ ...cellStyle, background: rightBg || '#f5f5f5', borderRadius: '0 4px 4px 0', justifyContent: 'space-between' }}>
        <span>{right || <span style={{ color: '#999' }}>—</span>}</span>
        {onRestore && (
          <button
            style={{ ...smallBtn, ...smallBtnSuccess, fontSize: '10px', marginLeft: '8px' }}
            onClick={onRestore}
          >
            Restore
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    background: '#fff',
    borderRadius: '10px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#e0e0e0',
    padding: '20px',
    marginBottom: '20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    width: '85vw',
    height: '85vh',
    background: '#fff',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
  },
  navArrow: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'rgba(26, 92, 90, 0.85)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: '50%',
    width: '48px',
    height: '48px',
    color: '#fff',
    fontSize: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1001,
  },
  sectionTitle: {
    margin: '0 0 12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#1a5c5a',
  },
  snapshotRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    background: '#fafafa',
    borderRadius: '8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#eee',
  },
  diffPanel: {
    marginTop: '8px',
    marginLeft: '16px',
    padding: '12px',
    background: '#f9f9f9',
    borderRadius: '8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#eee',
  },
  // Button styles (smallBtn*) are now imported from ../../styles
};
