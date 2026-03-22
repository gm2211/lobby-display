/**
 * ConfigSection - Dashboard configuration editor section.
 *
 * PURPOSE:
 * Manages the dashboard title, timezone, and logo settings.
 * Auto-saves changes with debounce for smooth editing experience.
 *
 * RELATED FILES:
 * - src/pages/Admin.tsx - Parent component
 * - src/types.ts - BuildingConfig type
 * - server/routes/config.ts - API endpoint
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import type { BuildingConfig } from '../../../types';
import { api } from '../../../utils/api';
import { DEFAULTS } from '../../../constants';
import {
  inputStyle, inputChangedStyle, sectionStyle, sectionChangedStyle,
  formGroupStyle, formLabelStyle, smallBtn, modalOverlay, modal,
} from '../../../styles';

interface ConfigSectionProps {
  config: BuildingConfig | null;
  onSave: (optimistic?: Record<string, unknown>) => void;
  hasChanged: boolean;
  publishedConfig: BuildingConfig | null;
}

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Phoenix',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Dubai',
  'Australia/Sydney',
];

/** Built-in logos from themes (always available) */
const BUILTIN_LOGOS = [
  { url: '/assets/themes/77-hudson/logo.png', label: '77 Hudson' },
  { url: '/assets/themes/default/logo.png', label: 'Default' },
];

function getTimezoneLabel(tz: string): string {
  try {
    const now = new Date();
    const short = now.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'short' }).split(' ').pop() || '';
    return `${tz.replace(/_/g, ' ')} (${short})`;
  } catch {
    return tz;
  }
}

function parseCustomLogos(raw: string | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function ConfigSection({ config, onSave, hasChanged, publishedConfig }: ConfigSectionProps) {
  const [form, setForm] = useState({ dashboardTitle: '', timezone: 'America/New_York', logoUrl: '' });
  const initializedRef = useRef(false);
  const [addLogoOpen, setAddLogoOpen] = useState(false);
  const [newLogoUrl, setNewLogoUrl] = useState('');

  const customLogos = parseCustomLogos(config?.customLogos);

  useEffect(() => {
    if (config && !initializedRef.current) {
      setForm({
        dashboardTitle: config.dashboardTitle,
        timezone: config.timezone || 'America/New_York',
        logoUrl: config.logoUrl || '',
      });
      initializedRef.current = true;
    }
  }, [config]);

  useEffect(() => {
    if (!initializedRef.current) return;
    const timer = setTimeout(async () => {
      await api.put('/api/config', form);
      onSave();
    }, 150);
    return () => clearTimeout(timer);
  }, [form, onSave]);

  const allTimezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return COMMON_TIMEZONES;
    }
  }, []);

  const selectLogo = (url: string) => {
    setForm(f => ({ ...f, logoUrl: url }));
  };

  const addCustomLogo = () => {
    if (!newLogoUrl.trim()) return;
    const updated = [...customLogos, newLogoUrl.trim()];
    api.put('/api/config', { customLogos: JSON.stringify(updated) });
    onSave({ config: config ? { ...config, customLogos: JSON.stringify(updated) } : null });
    // Also select it immediately
    setForm(f => ({ ...f, logoUrl: newLogoUrl.trim() }));
    setNewLogoUrl('');
    setAddLogoOpen(false);
  };

  const removeCustomLogo = (url: string) => {
    const updated = customLogos.filter(u => u !== url);
    api.put('/api/config', { customLogos: JSON.stringify(updated) });
    onSave({ config: config ? { ...config, customLogos: JSON.stringify(updated) } : null });
    // If the removed logo was selected, clear selection
    if (form.logoUrl === url) {
      setForm(f => ({ ...f, logoUrl: '' }));
    }
  };

  const normalize = (v: unknown) => String(v ?? '');
  const titleChanged =
    publishedConfig && normalize(form.dashboardTitle) !== normalize(publishedConfig.dashboardTitle);
  const timezoneChanged =
    publishedConfig && normalize(form.timezone) !== normalize(publishedConfig.timezone || 'America/New_York');
  const logoChanged =
    publishedConfig && normalize(form.logoUrl) !== normalize(publishedConfig.logoUrl || '');

  const allLogos = [
    ...BUILTIN_LOGOS.map(l => ({ ...l, builtin: true })),
    ...customLogos.map(url => ({ url, label: new URL(url, window.location.origin).pathname.split('/').pop() || 'Custom', builtin: false })),
  ];

  const cardSize = 64;
  const selectedBorder = '2px solid #1a5c5a';
  const defaultBorder = '2px solid #ddd';

  return (
    <section style={{ ...sectionStyle, ...(hasChanged ? sectionChangedStyle : {}) }}>
      <h2 style={{ margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        Dashboard Config
        {hasChanged && <span style={{ color: '#b07800', fontSize: '12px' }}>●</span>}
      </h2>
      <div style={{ ...formGroupStyle, marginBottom: '12px' }}>
        <span style={formLabelStyle}>Dashboard Title</span>
        <input
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', ...(titleChanged ? inputChangedStyle : {}) }}
          placeholder="Dashboard title"
          value={form.dashboardTitle}
          onChange={e => setForm(f => ({ ...f, dashboardTitle: e.target.value }))}
        />
        <div style={{ marginTop: '6px' }}>
          <TitleFontSizeInput config={config} onSave={onSave} publishedConfig={publishedConfig} />
        </div>
      </div>
      <div style={{ ...formGroupStyle, marginBottom: '12px' }}>
        <span style={formLabelStyle}>Timezone</span>
        <select
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', ...(timezoneChanged ? inputChangedStyle : {}) }}
          value={form.timezone}
          onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
        >
          <optgroup label="Common">
            {COMMON_TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{getTimezoneLabel(tz)}</option>
            ))}
          </optgroup>
          <optgroup label="All Timezones">
            {allTimezones.filter(tz => !COMMON_TIMEZONES.includes(tz)).map(tz => (
              <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
            ))}
          </optgroup>
        </select>
      </div>
      <div style={{ ...formGroupStyle, marginBottom: 0 }}>
        <span style={{ ...formLabelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
          Logo
          {logoChanged && <span style={{ color: '#b07800' }}>*</span>}
        </span>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* "None" option */}
          <div
            onClick={() => selectLogo('')}
            title="No custom logo (use theme default)"
            style={{
              width: cardSize,
              height: cardSize,
              borderRadius: '8px',
              borderWidth: 0,
              borderStyle: 'solid',
              outline: form.logoUrl === '' ? selectedBorder : defaultBorder,
              outlineOffset: '-2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              background: form.logoUrl === '' ? '#e8f5f4' : '#fafafa',
              fontSize: '10px',
              color: '#888',
              textAlign: 'center',
            }}
          >
            Theme<br/>default
          </div>

          {/* Logo cards */}
          {allLogos.map(logo => (
            <div
              key={logo.url}
              style={{ position: 'relative', display: 'inline-block' }}
            >
              <div
                onClick={() => selectLogo(logo.url)}
                title={logo.label}
                style={{
                  width: cardSize,
                  height: cardSize,
                  borderRadius: '8px',
                  borderWidth: 0,
                  borderStyle: 'solid',
                  outline: form.logoUrl === logo.url ? selectedBorder : defaultBorder,
                  outlineOffset: '-2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  background: form.logoUrl === logo.url ? '#e8f5f4' : '#fafafa',
                  padding: '8px',
                  boxSizing: 'border-box',
                }}
              >
                <img
                  src={logo.url}
                  alt={logo.label}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
              {!logo.builtin && (
                <button
                  onClick={e => { e.stopPropagation(); removeCustomLogo(logo.url); }}
                  title="Remove"
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: '#f44336',
                    color: '#fff',
                    fontSize: '10px',
                    lineHeight: '18px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    padding: 0,
                    borderWidth: 0,
                    borderStyle: 'none',
                  }}
                >
                  x
                </button>
              )}
              <div style={{ fontSize: '9px', color: '#999', textAlign: 'center', marginTop: '2px', maxWidth: cardSize, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {logo.label}
              </div>
            </div>
          ))}

          {/* Add new logo card */}
          <div
            onClick={() => setAddLogoOpen(true)}
            title="Add custom logo"
            style={{
              width: cardSize,
              height: cardSize,
              borderRadius: '8px',
              borderWidth: '2px',
              borderStyle: 'dashed',
              borderColor: '#ccc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              background: '#fafafa',
              fontSize: '24px',
              color: '#aaa',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#1a5c5a'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#ccc'; }}
          >
            +
          </div>
        </div>
      </div>

      {/* Add logo modal */}
      {addLogoOpen && (
        <div style={modalOverlay} onClick={() => setAddLogoOpen(false)}>
          <div style={{ ...modal, width: '420px', height: 'auto', padding: '20px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <strong style={{ color: '#333' }}>Add Logo</strong>
              <button style={smallBtn} onClick={() => setAddLogoOpen(false)}>Close</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                placeholder="Paste image URL..."
                value={newLogoUrl}
                onChange={e => setNewLogoUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCustomLogo(); }}
                autoFocus
              />
              {newLogoUrl && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: 64,
                    height: 64,
                    borderRadius: '8px',
                    background: '#f5f5f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px',
                    boxSizing: 'border-box',
                  }}>
                    <img
                      src={newLogoUrl}
                      alt="Preview"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                  <span style={{ fontSize: '11px', color: '#888' }}>Preview</span>
                </div>
              )}
              <button
                onClick={addCustomLogo}
                disabled={!newLogoUrl.trim()}
                style={{
                  padding: '8px 16px',
                  background: newLogoUrl.trim() ? '#1a5c5a' : '#ccc',
                  color: '#fff',
                  borderWidth: 0,
                  borderStyle: 'none',
                  borderRadius: '6px',
                  cursor: newLogoUrl.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                }}
              >
                Add Logo
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Separate component for title font size — commits on blur/Enter, not on every keystroke. */
function TitleFontSizeInput({ config, onSave, publishedConfig }: {
  config: BuildingConfig | null;
  onSave: (optimistic?: Record<string, unknown>) => void;
  publishedConfig: BuildingConfig | null;
}) {
  const currentValue = config?.titleFontSize ?? DEFAULTS.TITLE_FONT_SIZE;
  const [local, setLocal] = useState(String(currentValue));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setLocal(String(config?.titleFontSize ?? DEFAULTS.TITLE_FONT_SIZE));
    }
  }, [config?.titleFontSize]);

  const commit = () => {
    focusedRef.current = false;
    const num = parseInt(local, 10);
    if (!isNaN(num) && num >= 12 && num <= 48) {
      api.put('/api/config', { titleFontSize: num });
      onSave({ config: config ? { ...config, titleFontSize: num } : null });
    } else {
      setLocal(String(currentValue));
    }
  };

  const changed = publishedConfig && currentValue !== (publishedConfig.titleFontSize ?? DEFAULTS.TITLE_FONT_SIZE);

  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#888' }}>
      Title font size
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={local}
        onFocus={() => { focusedRef.current = true; }}
        onChange={e => {
          const v = e.target.value;
          if (v === '' || /^\d+$/.test(v)) setLocal(v);
        }}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{ ...inputStyle, width: '44px', padding: '2px 6px', fontSize: '12px', textAlign: 'center', ...(changed ? inputChangedStyle : {}) }}
      />
      px
    </label>
  );
}
