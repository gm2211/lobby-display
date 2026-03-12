/**
 * ConfigSection - Dashboard configuration editor section.
 *
 * PURPOSE:
 * Manages the dashboard title setting.
 * Auto-saves changes with debounce for smooth editing experience.
 *
 * RELATED FILES:
 * - src/pages/Admin.tsx - Parent component
 * - src/types.ts - BuildingConfig type
 * - server/routes/config.ts - API endpoint
 */
import { useState, useEffect, useRef } from 'react';
import type { BuildingConfig } from '../../../types';
import { api } from '../../../utils/api';
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

export function ConfigSection({ config, onSave, hasChanged, publishedConfig }: ConfigSectionProps) {
  const [form, setForm] = useState({ dashboardTitle: '' });
  const initializedRef = useRef(false);

  useEffect(() => {
    if (config && !initializedRef.current) {
      setForm({ dashboardTitle: config.dashboardTitle });
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

  const normalize = (v: unknown) => String(v ?? '');
  const titleChanged =
    publishedConfig && normalize(form.dashboardTitle) !== normalize(publishedConfig.dashboardTitle);

  return (
    <section style={{ ...sectionStyle, ...(hasChanged ? sectionChangedStyle : {}) }}>
      <h2 style={{ margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        Dashboard Config
        {hasChanged && <span style={{ color: '#b07800', fontSize: '12px' }}>●</span>}
      </h2>
      <div style={{ ...formGroupStyle, marginBottom: 0 }}>
        <span style={formLabelStyle}>Dashboard Title</span>
        <input
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', ...(titleChanged ? inputChangedStyle : {}) }}
          placeholder="Dashboard title"
          value={form.dashboardTitle}
          onChange={e => setForm({ dashboardTitle: e.target.value })}
        />
      </div>
    </section>
  );
}
