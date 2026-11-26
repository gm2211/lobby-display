import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Service, Event, Advisory, BuildingConfig } from '../types';
import { api, mutations } from '../utils/api';
import { smallBtn, headerBtn, headerBtnSecondary, modalOverlay, modal } from '../styles';
import {
  SnapshotHistory,
  ConfigSection,
  AppearanceSection,
  ServicesSection,
  EventsSection,
  AdvisoriesSection,
  UsersSection,
} from '../components/admin';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { RuntimeThemeOverride } from '../theme/RuntimeThemeOverride';

type SectionChanges = {
  config: boolean;
  services: boolean;
  events: boolean;
  advisories: boolean;
};

type PublishedData = {
  services: Service[];
  events: Event[];
  advisories: Advisory[];
  config: BuildingConfig | null;
} | null;

export default function Admin() {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [advisories, setAdvisories] = useState<Advisory[]>([]);
  const [config, setConfig] = useState<BuildingConfig | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [sectionChanges, setSectionChanges] = useState<SectionChanges>({ config: false, services: false, events: false, advisories: false });
  const [published, setPublished] = useState<PublishedData>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const checkDraft = useCallback(async () => {
    const epochAtStart = mutations.epoch;
    try {
      const d = await api.get('/api/snapshots/draft-status');
      // A write started while this GET was in flight (or is still pending):
      // the response may predate it and would undo the optimistic update.
      // Drop it -- the refetch scheduled after that write will bring fresh data.
      if (mutations.epoch !== epochAtStart || mutations.pending > 0) return;
      setHasChanges(d.hasChanges);
      setSectionChanges(d.sectionChanges || { config: false, services: false, events: false, advisories: false });
      setPublished(d.published || null);
      // Use current data from draft-status to avoid a separate load() call
      if (d.current) {
        setServices(d.current.services || []);
        setEvents(d.current.events || []);
        setAdvisories(d.current.advisories || []);
        setConfig(d.current.config || null);
      }
    } catch {
      // Silently ignore — session may have expired (user is redirected to login)
    }
  }, []);

  // onSave accepts an optional optimistic update for instant UI feedback.
  // Sections fire their API write without awaiting it, then call onSave with
  // the expected new state. We render that immediately and resync from the
  // server only once every in-flight write has landed (see `mutations` in
  // utils/api.ts). A failed write triggers a resync, which rolls the UI back.
  const resyncQueued = useRef(false);
  const syncWhenIdle = useCallback(() => {
    if (resyncQueued.current) return;
    resyncQueued.current = true;
    mutations.whenIdle().then(() => {
      resyncQueued.current = false;
      checkDraft();
    });
  }, [checkDraft]);

  const onSave = useCallback((optimistic?: {
    services?: Service[];
    events?: Event[];
    advisories?: Advisory[];
    config?: BuildingConfig | null;
  }) => {
    if (optimistic) {
      if (optimistic.services) setServices(optimistic.services);
      if (optimistic.events) setEvents(optimistic.events);
      if (optimistic.advisories) setAdvisories(optimistic.advisories);
      if (optimistic.config !== undefined) setConfig(optimistic.config);
      setHasChanges(true);
      syncWhenIdle();
    } else {
      checkDraft();
    }
  }, [checkDraft, syncWhenIdle]);

  // Roll back + tell the user when a fire-and-forget write fails
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => mutations.onError(err => {
    setSaveError(`Couldn't save change: ${err instanceof Error ? err.message : 'Unknown error'}. Reverted.`);
    syncWhenIdle();
  }), [syncWhenIdle]);
  useEffect(() => {
    if (!saveError) return;
    const t = setTimeout(() => setSaveError(null), 5000);
    return () => clearTimeout(t);
  }, [saveError]);

  // Warm the CSRF token so the first write is one round trip, not two
  useEffect(() => { api.prefetchCsrf(); }, []);

  useEffect(() => { checkDraft(); }, [checkDraft]);

  // Set browser tab title from config
  useEffect(() => {
    if (config?.dashboardTitle) {
      document.title = `${config.dashboardTitle} — Admin`;
    }
  }, [config?.dashboardTitle]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (previewOpen || historyOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [previewOpen, historyOpen]);

  const publish = async () => {
    try {
      const result = await api.post('/api/snapshots');
      // Use the returned state directly for both current data and published
      // This ensures they're identical, eliminating false "changed" indicators
      if (result.state) {
        setServices(result.state.services || []);
        setEvents(result.state.events || []);
        setAdvisories(result.state.advisories || []);
        setConfig(result.state.config || null);
        setPublished(result.state);
        setHasChanges(false);
        setSectionChanges({ config: false, services: false, events: false, advisories: false });
      } else {
        // Fallback to old behavior if state not returned
        await onSave();
      }
    } catch (err) {
      alert(`Publish failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const discard = async () => {
    if (!confirm('Discard all unpublished changes?')) return;
    try {
      await api.post('/api/snapshots/discard');
      await onSave();
    } catch (err) {
      alert(`Discard failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const pendingBgStyle: React.CSSProperties = hasChanges ? {
    boxShadow: 'inset 0 0 40px 10px rgba(200, 130, 0, 0.12)',
  } : {};

  return (
    <div style={{ ...styles.pageWrap, ...pendingBgStyle }}>
      <RuntimeThemeOverride config={published?.config || null} />
      {saveError && (
        <div
          role="alert"
          onClick={() => setSaveError(null)}
          style={{ position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: '#b71c1c', color: '#fff', padding: '10px 16px', borderRadius: '6px', fontSize: '13px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', maxWidth: 'calc(100vw - 32px)', cursor: 'pointer' }}
        >
          {saveError}
        </div>
      )}
      <header className="admin-header" style={{ ...styles.header, background: 'linear-gradient(135deg, var(--theme-header-gradient-start) 0%, var(--theme-header-gradient-end) 100%)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
          {(published?.config?.logoUrl || theme.logoUrl) && (
            <img src={published?.config?.logoUrl || theme.logoUrl} alt="" style={{ height: '36px', width: 'auto' }} />
          )}
          <div style={{ position: 'relative' }}>
            <h1 style={{ margin: 0, color: '#fff', fontSize: `${config?.titleFontSize ?? 20}px`, fontWeight: 400, lineHeight: 1.3 }}>{config?.dashboardTitle || 'Building Updates'}</h1>
            {hasChanges && <span style={{ color: 'var(--theme-color-secondary-300)', fontSize: '10px', position: 'absolute', bottom: '-14px', left: 0, whiteSpace: 'nowrap' }}>● Unpublished changes</span>}
          </div>
        </div>
        <div className="admin-header-buttons" style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center', flex: 2 }}>
          <button
            style={{
              ...headerBtn,
              ...(hasChanges ? {} : { opacity: 0.5, cursor: 'not-allowed' }),
            }}
            onClick={hasChanges ? publish : undefined}
            disabled={!hasChanges}
          >Publish</button>
          <button
            style={{
              ...headerBtn,
              ...headerBtnSecondary,
              ...(hasChanges ? {} : { opacity: 0.5, cursor: 'not-allowed' }),
            }}
            onClick={hasChanges ? discard : undefined}
            disabled={!hasChanges}
          >Discard</button>
          <button
            style={{
              ...headerBtn,
              ...headerBtnSecondary,
              ...(hasChanges ? {} : { opacity: 0.5, cursor: 'not-allowed' }),
            }}
            onClick={hasChanges ? () => setPreviewOpen(true) : undefined}
            disabled={!hasChanges}
          >Preview</button>
          <button style={{ ...headerBtn, ...headerBtnSecondary }} onClick={() => setHistoryOpen(true)}>History</button>
          <a href="/metrics" style={{ ...headerBtn, ...headerBtnSecondary, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Metrics</a>
          <a href="/" style={{ ...headerBtn, ...headerBtnSecondary, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>← Dashboard</a>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
          {user && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>{user.username}</span>
              <button style={{ ...headerBtn, ...headerBtnSecondary, fontSize: '12px', padding: '4px 10px' }} onClick={handleLogout}>Logout</button>
            </>
          )}
        </div>
      </header>

      <div className="admin-page" style={styles.page}>
        <ConfigSection config={config} onSave={onSave} hasChanged={sectionChanges.config} publishedConfig={published?.config || null} />
        <AppearanceSection config={config} onSave={onSave} hasChanged={sectionChanges.config} publishedConfig={published?.config || null} />
        <ServicesSection services={services} config={config} onSave={onSave} hasChanged={sectionChanges.services} publishedServices={published?.services || null} />
        <EventsSection events={events} config={config} onSave={onSave} hasChanged={sectionChanges.events} publishedEvents={published?.events || null} />
        <AdvisoriesSection advisories={advisories} config={config} onSave={onSave} hasChanged={sectionChanges.advisories} publishedAdvisories={published?.advisories || null} />
        <UsersSection />
      </div>

      {previewOpen && (
        <div style={modalOverlay} onClick={() => setPreviewOpen(false)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <strong style={{ color: '#333' }}>Preview (Draft)</strong>
              <button style={smallBtn} onClick={() => setPreviewOpen(false)}>Close</button>
            </div>
            <iframe src="/?preview=true" style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }} />
          </div>
        </div>
      )}

      {historyOpen && (
        <div style={modalOverlay} onClick={() => setHistoryOpen(false)}>
          <div style={{ ...modal, width: '700px', maxWidth: '90vw', height: 'auto', maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <strong style={{ color: '#333' }}>Version History</strong>
              <button style={smallBtn} onClick={() => setHistoryOpen(false)}>Close</button>
            </div>
            <SnapshotHistory onRestore={() => { onSave(); setHistoryOpen(false); }} onItemRestore={onSave} />
          </div>
        </div>
      )}

      <footer style={{ textAlign: 'center', padding: '24px 0 12px', fontSize: '11px', color: '#555' }}>
        Brought to you by <a href="https://github.com/gm2211" style={{ color: '#666' }} target="_blank" rel="noopener noreferrer">gm2211</a>
      </footer>

      <style>{`
        html, body { background: #f5f7fa; }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          opacity: 1;
          filter: invert(0.8);
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-4px); }
          40%, 80% { transform: translateX(4px); }
        }
        .shake {
          animation: shake 0.4s ease-in-out;
        }
        .field-error {
          border-color: #f44336 !important;
          box-shadow: 0 0 0 1px #f44336;
        }
      `}</style>
    </div>
  );
}

// All section components moved to ../components/admin/sections/

/**
 * Page-level styles for Admin component.
 * Section-specific styles are now in their respective section components.
 */
const styles: Record<string, React.CSSProperties> = {
  pageWrap: { background: '#f5f7fa', minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  page: { maxWidth: '960px', width: '100%', margin: '0 auto', padding: '28px 24px', color: '#333', fontFamily: 'var(--theme-font-family)', boxSizing: 'border-box', flex: 1 },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 28px',
    // gradient set inline from theme.colors
  },
};
