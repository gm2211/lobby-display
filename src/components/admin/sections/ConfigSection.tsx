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
  const [form, setForm] = useState({ dashboardTitle: '', timezone: 'America/New_York', logoUrl: '' });
  const initializedRef = useRef(false);

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

  const normalize = (v: unknown) => String(v ?? '');
  const titleChanged =
    publishedConfig && normalize(form.dashboardTitle) !== normalize(publishedConfig.dashboardTitle);
  const timezoneChanged =
    publishedConfig && normalize(form.timezone) !== normalize(publishedConfig.timezone || 'America/New_York');
  const logoChanged =
    publishedConfig && normalize(form.logoUrl) !== normalize(publishedConfig.logoUrl || '');

  return (
    <section style={{ ...sectionStyle, ...(hasChanged ? sectionChangedStyle : {}) }}>
      <h2 style={{ margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        Dashboard Config
        {hasChanged && <span style={{ color: '#b07800', fontSize: '12px' }}>●</span>}
      </h2>
      <div style={{ ...formGroupStyle, marginBottom: '12px' }}>
        <span style={formLabelStyle}>Dashboard Title</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            style={{ ...inputStyle, flex: 1, boxSizing: 'border-box', ...(titleChanged ? inputChangedStyle : {}) }}
            placeholder="Dashboard title"
            value={form.dashboardTitle}
            onChange={e => setForm(f => ({ ...f, dashboardTitle: e.target.value }))}
          />
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
      <div style={{ ...formGroupStyle, marginBottom: '12px' }}>
        <span style={formLabelStyle}>Logo URL</span>
        <input
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', ...(logoChanged ? inputChangedStyle : {}) }}
          placeholder="Custom logo URL (leave empty for default)"
          value={form.logoUrl}
          onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
        />
        {form.logoUrl && (
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img
              src={form.logoUrl}
              alt="Logo preview"
              style={{ height: '32px', width: 'auto', borderRadius: '4px', background: '#eee' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span style={{ fontSize: '11px', color: '#888' }}>Preview</span>
          </div>
        )}
      </div>
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
    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#666', whiteSpace: 'nowrap' }}>
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
        style={{ ...inputStyle, width: '48px', padding: '2px 6px', fontSize: '12px', textAlign: 'center', ...(changed ? inputChangedStyle : {}) }}
      />
      px
    </label>
  );
}
