/**
 * ConfigSection - Dashboard identity settings (title, timezone).
 * Small, always-visible section at the top of the admin page.
 *
 * RELATED FILES:
 * - AppearanceSection.tsx - Visual theming (presets, logo, colors, fonts)
 * - src/pages/Admin.tsx - Parent component
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import type { BuildingConfig } from '../../../types';
import { api } from '../../../utils/api';
import { DEFAULTS } from '../../../constants';
import {
  inputStyle, inputChangedStyle, selectStyle, sectionStyle, sectionChangedStyle,
  formGroupStyle, formLabelStyle,
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

function getTimezoneLabel(tz: string): string {
  try {
    const now = new Date();
    const short = now.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'short' }).split(' ').pop() || '';
    return `${tz.replace(/_/g, ' ')} (${short})`;
  } catch {
    return tz;
  }
}

export function ConfigSection({ config, onSave, hasChanged, publishedConfig }: ConfigSectionProps) {
  const [form, setForm] = useState({ dashboardTitle: '', timezone: 'America/New_York' });
  const syncedRef = useRef(false);
  const skipNextSaveRef = useRef(false);

  const configFingerprint = config ? `${config.dashboardTitle}|${config.timezone}` : null;
  const lastFingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    if (!config || !configFingerprint) return;
    const isFirstLoad = !syncedRef.current;
    const isExternalChange = lastFingerprintRef.current !== null && lastFingerprintRef.current !== configFingerprint;
    if (isFirstLoad || isExternalChange) {
      skipNextSaveRef.current = true;
      setForm({
        dashboardTitle: config.dashboardTitle,
        timezone: config.timezone || 'America/New_York',
      });
      syncedRef.current = true;
    }
    lastFingerprintRef.current = configFingerprint;
  }, [config, configFingerprint]);

  useEffect(() => {
    if (!syncedRef.current) return;
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
    const timer = setTimeout(async () => {
      await api.put('/api/config', form);
      onSave({ config: config ? { ...config, ...form } : null });
    }, 150);
    return () => clearTimeout(timer);
  }, [form, onSave]);

  const allTimezones = useMemo(() => {
    try { return Intl.supportedValuesOf('timeZone'); }
    catch { return COMMON_TIMEZONES; }
  }, []);

  const normalize = (v: unknown) => String(v ?? '');
  const titleChanged = publishedConfig && normalize(form.dashboardTitle) !== normalize(publishedConfig.dashboardTitle);
  const timezoneChanged = publishedConfig && normalize(form.timezone) !== normalize(publishedConfig.timezone || 'America/New_York');

  return (
    <section style={{ ...sectionStyle, ...(hasChanged ? sectionChangedStyle : {}) }}>
      <h2 style={{ margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        Dashboard
        {hasChanged && <span style={{ color: 'var(--theme-color-secondary-600)', fontSize: '12px' }}>●</span>}
      </h2>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ ...formGroupStyle, marginBottom: 0, flex: '1 1 300px' }}>
          <span style={formLabelStyle}>Dashboard Title</span>
          <input
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', height: '38px', ...(titleChanged ? inputChangedStyle : {}) }}
            placeholder="Dashboard title"
            value={form.dashboardTitle}
            onChange={e => setForm(f => ({ ...f, dashboardTitle: e.target.value }))}
          />
        </div>
        <div style={{ ...formGroupStyle, marginBottom: 0, flex: '1 1 300px' }}>
          <span style={formLabelStyle}>Timezone</span>
          <select
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', height: '38px', ...(timezoneChanged ? inputChangedStyle : {}) }}
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
      </div>
    </section>
  );
}

/** Exported for use in AppearanceSection */
export function TitleFontSizeInput({ config, onSave, publishedConfig }: {
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
