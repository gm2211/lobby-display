import { useState, useEffect } from 'react';
import type { BuildingConfig } from '../types';
import { useTheme } from '../theme/ThemeContext';

export default function Header({ config }: { config: BuildingConfig | null }) {
  const [time, setTime] = useState(new Date());
  const theme = useTheme();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const tz = config?.timezone || undefined;

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz });

  const logoSrc = config?.logoUrl || theme.logoUrl;

  return (
    <header className="header-row" style={styles.header}>
      <div style={styles.left}>
        <img src={logoSrc} alt={theme.logoAlt} style={styles.logo} />
        <a href="/admin" style={{ textDecoration: 'none' }}>
          <h1 style={{ ...styles.title, fontSize: `${config?.titleFontSize ?? 20}px` }}>{config?.dashboardTitle || 'Building Updates'}</h1>
        </a>
      </div>
      <div style={styles.right}>
        <div style={styles.time}>{formatTime(time)}</div>
        <div style={styles.date}>{formatDate(time)}</div>
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    background: 'linear-gradient(135deg, var(--theme-header-gradient-start) 0%, var(--theme-header-gradient-end) 100%)',
    padding: '14px 28px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  left: { display: 'flex', alignItems: 'center', gap: '12px' },
  logo: { height: '36px', width: 'auto' },
  title: { fontSize: '20px', fontWeight: 400, color: '#fff', margin: 0 },
  right: { textAlign: 'left' as const },
  time: { fontSize: '22px', fontWeight: 700, color: '#fff' },
  date: { fontSize: '13px', color: 'rgba(255,255,255,0.65)' },
};
