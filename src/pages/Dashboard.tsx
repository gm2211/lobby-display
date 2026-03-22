import { useState, useEffect, useCallback, useRef } from 'react';
import Header from '../components/Header';
import ServiceTable from '../components/ServiceTable';
import AutoScrollCards from '../components/AutoScrollCards';
import AdvisoryTicker from '../components/AdvisoryTicker';
import { DEFAULTS } from '../constants';
import type { Service, Event, Advisory, BuildingConfig } from '../types';

export default function Dashboard() {
  const [services, setServices] = useState<Service[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [advisories, setAdvisories] = useState<Advisory[]>([]);
  const [config, setConfig] = useState<BuildingConfig | null>(null);

  const params = new URLSearchParams(window.location.search);
  const isPreview = params.get('preview') === 'true';
  const snapshotVersion = params.get('snapshot');

  const fetchAll = useCallback(() => {
    if (isPreview) {
      fetch('/api/services').then(r => r.json()).then(setServices);
      fetch('/api/events').then(r => r.json()).then(setEvents);
      fetch('/api/advisories').then(r => r.json()).then(setAdvisories);
      fetch('/api/config').then(r => r.json()).then(setConfig);
    } else if (snapshotVersion) {
      // Load a specific snapshot version (for preview in history)
      fetch(`/api/snapshots/${snapshotVersion}`).then(r => r.json()).then(data => {
        setServices(data.services || []);
        setEvents(data.events || []);
        setAdvisories(data.advisories || []);
        setConfig(data.config || null);
      });
    } else {
      fetch('/api/snapshots/latest').then(r => r.json()).then(data => {
        setServices(data.services || []);
        setEvents(data.events || []);
        setAdvisories(data.advisories || []);
        setConfig(data.config || null);
      });
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

  const scrollSpeed = config?.scrollSpeed ?? DEFAULTS.SCROLL_SPEED;
  const tickerSpeed = config?.tickerSpeed ?? DEFAULTS.TICKER_SPEED;
  const servicesScrollSpeed = config?.servicesScrollSpeed ?? DEFAULTS.SERVICES_SCROLL_SPEED;

  return (
    <div className="dashboard-page" style={styles.page}>
      <Header config={config} />
      <div className="dashboard-body" style={styles.body}>
        <ServiceTable services={services} scrollSpeed={servicesScrollSpeed} config={config} />
        <AutoScrollCards events={events} scrollSpeed={scrollSpeed} />
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
