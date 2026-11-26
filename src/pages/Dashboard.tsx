import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Header from '../components/Header';
import ServiceTable from '../components/ServiceTable';
import AutoScrollCards from '../components/AutoScrollCards';
import AdvisoryTicker from '../components/AdvisoryTicker';
import { DEFAULTS } from '../constants';
import { RuntimeThemeOverride } from '../theme/RuntimeThemeOverride';
import type { Service, Event, Advisory, BuildingConfig } from '../types';
import { isEventNew, NEW_BADGE_DEFAULTS } from '../../shared/newBadge';
import { isHexColor } from '../../shared/theme/safeCss';

export default function Dashboard() {
  const [services, setServices] = useState<Service[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [advisories, setAdvisories] = useState<Advisory[]>([]);
  const [config, setConfig] = useState<BuildingConfig | null>(null);

  const params = new URLSearchParams(window.location.search);
  const isPreview = params.get('preview') === 'true';
  const snapshotVersion = params.get('snapshot');

  const fetchAll = useCallback(() => {
    // A failed request (network blip, expired session, deploy in progress) must never
    // replace what is on screen: keep showing the last good data and try again later.
    const getJson = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url} returned ${res.status}`);
      return res.json();
    };
    const applySnapshot = (data: { services?: Service[]; events?: Event[]; advisories?: Advisory[]; config?: BuildingConfig | null }) => {
      setServices(data.services || []);
      setEvents(data.events || []);
      setAdvisories(data.advisories || []);
      setConfig(data.config || null);
    };
    const ignore = () => {};

    if (isPreview) {
      getJson('/api/services').then(setServices).catch(ignore);
      getJson('/api/events').then(setEvents).catch(ignore);
      getJson('/api/advisories').then(setAdvisories).catch(ignore);
      getJson('/api/config').then(setConfig).catch(ignore);
    } else if (snapshotVersion) {
      // Load a specific snapshot version (for preview in history)
      getJson(`/api/snapshots/${encodeURIComponent(snapshotVersion)}`).then(applySnapshot).catch(ignore);
    } else {
      getJson('/api/snapshots/latest').then(applySnapshot).catch(ignore);
    }
  }, [isPreview, snapshotVersion]);

  useEffect(() => {
    fetchAll();

    const es = new EventSource('/api/events-stream');
    es.onmessage = () => fetchAll();
    // Re-fetch on reconnect so missed broadcasts are caught
    es.onopen = () => fetchAll();
    // Fallback polling in case SSE drops (e.g. background tab throttling)
    const poll = setInterval(fetchAll, 30_000);
    return () => { es.close(); clearInterval(poll); };
  }, [fetchAll]);

  // Auto-reload on new deploy: poll /api/version every 60s
  const initialHash = useRef<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    fetch('/api/version')
      .then(r => r.json())
      .then(data => {
        initialHash.current = data.hash;
        timer = setInterval(async () => {
          try {
            const res = await fetch('/api/version');
            const { hash } = await res.json();
            if (initialHash.current && hash !== initialHash.current) {
              window.location.reload();
            }
          } catch {
            // Network error — skip this check
          }
        }, 60_000);
      })
      .catch(() => {}); // Version endpoint not available — skip

    return () => { if (timer) clearInterval(timer); };
  }, []);

  // Set browser tab title from config
  useEffect(() => {
    if (config?.dashboardTitle) {
      document.title = config.dashboardTitle;
    }
  }, [config?.dashboardTitle]);

  // Recomputed on every fetch (SSE or 30s poll), so day-based badges expire on their own.
  const eventsWithBadge = useMemo(
    () => events.map(e => ({ ...e, isNew: isEventNew(e, config) })),
    [events, config],
  );

  const scrollSpeed = config?.scrollSpeed ?? DEFAULTS.SCROLL_SPEED;
  const tickerSpeed = config?.tickerSpeed ?? DEFAULTS.TICKER_SPEED;
  const servicesScrollSpeed = config?.servicesScrollSpeed ?? DEFAULTS.SERVICES_SCROLL_SPEED;

  return (
    <div
      className="dashboard-page"
      style={{
        ...styles.page,
        // Hex-validated on write (server/routes/config.ts), read by EventCard's NEW pill
        ['--new-badge-color' as string]: isHexColor(config?.newBadgeColor) ? config?.newBadgeColor : NEW_BADGE_DEFAULTS.color,
      }}
    >
      <RuntimeThemeOverride config={config} />
      <Header config={config} />
      <div className="dashboard-body" style={styles.body}>
        <ServiceTable services={services} scrollSpeed={servicesScrollSpeed} config={config} />
        <AutoScrollCards events={eventsWithBadge} scrollSpeed={scrollSpeed} />
      </div>
      <AdvisoryTicker advisories={advisories} tickerSpeed={tickerSpeed} />
      <style>{`
        html, body { overflow: hidden; height: 100%; background: #fff; }
        #root { height: 100%; }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    minHeight: 0, // Required for nested flex containers to shrink properly
    padding: '14px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '36px',
    overflow: 'hidden',
  },
};
