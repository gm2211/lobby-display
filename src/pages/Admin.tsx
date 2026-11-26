import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Service, Event, Advisory, BuildingConfig } from '../types';
import { api, mutations } from '../utils/api';
import { smallBtn, modalOverlay, modal } from '../styles';
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
import { AdminTabs, type AdminTab, type TabBadge } from '../components/admin/AdminTabs';
import { ChangesPanel } from '../components/admin/ChangesPanel';
import { computeDraftChanges, countBySection } from '../utils/draftChanges';
import { useMediaQuery } from '../utils/useMediaQuery';
import './Admin.css';

const ADMIN_TABS: AdminTab[] = ['services', 'events', 'advisories', 'appearance', 'settings'];
function readTabFromHash(): AdminTab {
  const h = window.location.hash.replace('#', '') as AdminTab;
  return ADMIN_TABS.includes(h) ? h : 'services';
}

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
  const [reviewOpen, setReviewOpen] = useState(false);

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
    if (previewOpen || historyOpen || reviewOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [previewOpen, historyOpen, reviewOpen]);

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

  // ---- Layout: tabs (see src/pages/Admin.css) ----
  const isPhone = useMediaQuery('(max-width: 767px)');
  const isWide = useMediaQuery('(min-width: 1200px)');
  const [tab, setTabState] = useState<AdminTab>(() => readTabFromHash());
  // On iPhone, Appearance is folded into Settings
  const shownTab: AdminTab = isPhone && tab === 'appearance' ? 'settings' : tab;
  const tabs: AdminTab[] = isPhone
    ? ['services', 'events', 'advisories', 'settings']
    : ['services', 'events', 'advisories', 'appearance', 'settings'];

  // Each tab keeps its own scroll position; tapping the active tab scrolls to top
  const scrollByTab = useRef<Partial<Record<AdminTab, number>>>({});
  const pendingScroll = useRef<number | null>(null);
  const selectTab = useCallback((next: AdminTab) => {
    if (next === shownTab) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    scrollByTab.current[shownTab] = window.scrollY;
    pendingScroll.current = scrollByTab.current[next] ?? 0;
    setTabState(next);
    try { history.replaceState(null, '', `#${next}`); } catch { /* ignore */ }
  }, [shownTab]);
  useLayoutEffect(() => {
    if (pendingScroll.current === null) return;
    window.scrollTo(0, pendingScroll.current);
    pendingScroll.current = null;
  }, [shownTab]);
  useEffect(() => {
    const onHash = () => setTabState(readTabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Tint Safari's toolbars to match the header. Deliberately NO viewport-fit=cover:
  // with it, iPad/iPhone Safari draws page content behind its floating toolbar
  // above the sticky header, and env(safe-area-inset-top) adds a dark band.
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    const original = meta.content;
    meta.content = '#222721';
    return () => {
      if (created) meta?.remove();
      else if (meta) meta.content = original;
    };
  }, []);

  // Sticky things below the header need its height
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState(64);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { if (isWide) setReviewOpen(false); }, [isWide]);

  const changes = useMemo(
    () => computeDraftChanges({ services, events, advisories, config }, published),
    [services, events, advisories, config, published],
  );
  const counts = countBySection(changes);
  const badges: Partial<Record<AdminTab, TabBadge>> = {
    services: { count: counts.services, changed: sectionChanges.services },
    events: { count: counts.events, changed: sectionChanges.events },
    advisories: { count: counts.advisories, changed: sectionChanges.advisories },
    ...(isPhone
      ? { settings: { count: counts.config, changed: sectionChanges.config } }
      : { settings: { count: 0, changed: sectionChanges.config } }),
  };

  const show = (t: AdminTab) => (shownTab === t ? undefined : true);
  const changesPanel = (
    <ChangesPanel
      changes={changes}
      hasChanges={hasChanges}
      publishedKey={published}
      onChanged={() => onSave()}
      onPreview={() => { setReviewOpen(false); setPreviewOpen(true); }}
      onPublish={() => { setReviewOpen(false); publish(); }}
      onDiscard={() => { setReviewOpen(false); discard(); }}
    />
  );
  const runFromMenu = (fn: () => void) => () => { setMenuOpen(false); fn(); };

  return (
    <div className={`admin-shell${hasChanges ? ' has-changes' : ''}`} style={{ ['--admin-header-h' as string]: `${headerH}px` }}>
      <RuntimeThemeOverride config={published?.config || null} />
      {saveError && (
        <div role="alert" className="admin-toast" onClick={() => setSaveError(null)}>{saveError}</div>
      )}
      <header ref={headerRef} className="admin-header">
        <div className="admin-header-row">
          <div className="admin-brand">
            {(published?.config?.logoUrl || theme.logoUrl) && (
              <img src={published?.config?.logoUrl || theme.logoUrl} alt="" />
            )}
            <div>
              <h1>{config?.dashboardTitle || 'Building Updates'}</h1>
              {hasChanges
                ? <span className="admin-unpublished">● {changes.length ? <>{changes.length} <span className="admin-wide-word">unpublished </span>change{changes.length === 1 ? '' : 's'}</> : 'Unpublished changes'}</span>
                : <span className="admin-uptodate">Live on the lobby</span>}
            </div>
          </div>
          <div className="admin-header-actions">
            <a href="/" className="admin-hbtn admin-hbtn-dash" aria-label="Back to the dashboard" title="Back to the dashboard">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              <span>Dashboard</span>
            </a>
            <button type="button" className="admin-hbtn admin-not-phone" disabled={!hasChanges} onClick={() => setPreviewOpen(true)}>Preview</button>
            <button type="button" className="admin-hbtn admin-not-phone" onClick={() => setHistoryOpen(true)}>History</button>
            <button type="button" className="admin-hbtn admin-not-phone" disabled={!hasChanges} onClick={discard}>Discard</button>
            <button type="button" className="admin-hbtn admin-hbtn-primary" disabled={!hasChanges} onClick={publish}>Publish</button>
            <div className="admin-menu-wrap">
              <button type="button" className="admin-hbtn admin-hbtn-icon" aria-label="More" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="2" /><circle cx="10" cy="10" r="2" /><circle cx="16" cy="10" r="2" /></svg>
              </button>
              {menuOpen && (
                <>
                  <div className="admin-menu-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="admin-menu" role="menu">
                    {!isWide && <button type="button" role="menuitem" onClick={runFromMenu(() => setReviewOpen(true))}>Review changes{changes.length ? ` (${changes.length})` : ''}</button>}
                    {isPhone && <button type="button" role="menuitem" disabled={!hasChanges} onClick={runFromMenu(() => setPreviewOpen(true))}>Preview lobby</button>}
                    {isPhone && <button type="button" role="menuitem" onClick={runFromMenu(() => setHistoryOpen(true))}>History</button>}
                    {isPhone && <button type="button" role="menuitem" disabled={!hasChanges} onClick={runFromMenu(discard)}>Discard changes</button>}
                    <a role="menuitem" href="/metrics">Metrics</a>
                    {user && <button type="button" role="menuitem" className="is-danger" onClick={runFromMenu(handleLogout)}>Log out {user.username}</button>}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {!isPhone && <AdminTabs variant="top" tabs={tabs} active={shownTab} badges={badges} onSelect={selectTab} />}
      </header>

      <div className="admin-body">
        <main className="admin-page">
          <div hidden={show('services')}>
            <ServicesSection services={services} config={config} onSave={onSave} hasChanged={sectionChanges.services} publishedServices={published?.services || null} />
          </div>
          <div hidden={show('events')}>
            <EventsSection events={events} config={config} onSave={onSave} hasChanged={sectionChanges.events} publishedEvents={published?.events || null} />
          </div>
          <div hidden={show('advisories')}>
            <AdvisoriesSection advisories={advisories} config={config} onSave={onSave} hasChanged={sectionChanges.advisories} publishedAdvisories={published?.advisories || null} />
          </div>
          <div hidden={show('settings')}>
            <ConfigSection config={config} onSave={onSave} hasChanged={sectionChanges.config} publishedConfig={published?.config || null} />
          </div>
          <div hidden={isPhone ? show('settings') : show('appearance')}>
            <AppearanceSection config={config} onSave={onSave} hasChanged={sectionChanges.config} publishedConfig={published?.config || null} />
          </div>
          <div hidden={show('settings')}>
            <UsersSection />
          </div>
          <footer className="admin-footer">
            Brought to you by <a href="https://github.com/gm2211" target="_blank" rel="noopener noreferrer">gm2211</a>
          </footer>
        </main>
        {isWide && <aside className="admin-aside">{changesPanel}</aside>}
      </div>

      {isPhone && <AdminTabs variant="bottom" tabs={tabs} active={shownTab} badges={badges} onSelect={selectTab} />}

      {reviewOpen && (
        <div style={modalOverlay} onClick={() => setReviewOpen(false)}>
          <div className="admin-review-sheet" onClick={e => e.stopPropagation()}>
            <button type="button" className="admin-review-close" onClick={() => setReviewOpen(false)}>Close</button>
            {changesPanel}
          </div>
        </div>
      )}

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


      <style>{`
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
