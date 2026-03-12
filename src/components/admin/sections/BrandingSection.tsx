/**
 * BrandingSection — Admin branding editor.
 *
 * PURPOSE:
 * Allows EDITOR+ users to configure runtime branding stored in the
 * PlatformSetting table. Changes are applied immediately without a
 * server restart or redeploy.
 *
 * FIELDS:
 * - Building Name        → branding.buildingName
 * - Portal Title         → branding.portalTitle
 * - Sidebar Brand Text   → branding.sidebarBrandText
 * - Logo URL             → branding.logoUrl
 * - Primary Color (hex)  → branding.primaryColor
 * - Accent Color (hex)   → branding.accentColor
 * - Welcome Message      → branding.welcomeMessage
 *
 * SAVE BEHAVIOR:
 * Explicit Save button (no auto-save for this section as color pickers
 * fire frequently and partial saves would look jarring).
 *
 * RELATED FILES:
 * - server/routes/platform/branding.ts   - API consumed by this component
 * - src/theme/ThemeContext.tsx            - reads from same API on load
 * - src/pages/Admin.tsx                  - parent page
 * - src/styles/admin.ts                  - shared styles
 */

import { useState, useEffect, useCallback } from 'react';
import {
  inputStyle,
  sectionStyle,
  sectionChangedStyle,
  formGroupStyle,
  formLabelStyle,
  smallBtn,
  smallBtnPrimary,
} from '../../../styles';
import { api } from '../../../utils/api';

interface BrandingForm {
  buildingName: string;
  portalTitle: string;
  sidebarBrandText: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  welcomeMessage: string;
}

const EMPTY_FORM: BrandingForm = {
  buildingName: '',
  portalTitle: '',
  sidebarBrandText: '',
  logoUrl: '',
  primaryColor: '#1a5c5a',
  accentColor: '#e6a000',
  welcomeMessage: '',
};

interface BrandingSectionProps {
  /** Called after a successful save so the parent can refresh state if needed. */
  onSave?: () => void;
}

export function BrandingSection({ onSave }: BrandingSectionProps) {
  const [form, setForm] = useState<BrandingForm>(EMPTY_FORM);
  const [saved, setSaved] = useState<BrandingForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadBranding = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<BrandingForm>('/api/platform/branding');
      const filled: BrandingForm = {
        buildingName:     data.buildingName     ?? '',
        portalTitle:      data.portalTitle      ?? '',
        sidebarBrandText: data.sidebarBrandText ?? '',
        logoUrl:          data.logoUrl          ?? '',
        primaryColor:     data.primaryColor     ?? '#1a5c5a',
        accentColor:      data.accentColor      ?? '#e6a000',
        welcomeMessage:   data.welcomeMessage   ?? '',
      };
      setForm(filled);
      setSaved(filled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load branding');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBranding(); }, [loadBranding]);

  const hasChanged =
    JSON.stringify(form) !== JSON.stringify(saved);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api.put('/api/platform/branding', form);
      setSaved(form);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      if (onSave) onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm(saved);
    setError(null);
  };

  const set = (field: keyof BrandingForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  if (loading) {
    return (
      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 4px' }}>Branding</h2>
        <p style={{ color: '#888', fontSize: '14px' }}>Loading branding settings…</p>
      </section>
    );
  }

  return (
    <section style={{ ...sectionStyle, ...(hasChanged ? sectionChangedStyle : {}) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          Branding
          {hasChanged && <span style={{ color: '#b07800', fontSize: '12px' }}>●</span>}
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          {hasChanged && (
            <button
              style={{ ...smallBtn, marginLeft: 0 }}
              onClick={handleReset}
              disabled={saving}
            >
              Reset
            </button>
          )}
          <button
            style={{
              ...smallBtn,
              ...smallBtnPrimary,
              marginLeft: 0,
              opacity: (!hasChanged || saving) ? 0.5 : 1,
              cursor: (!hasChanged || saving) ? 'not-allowed' : 'pointer',
            }}
            onClick={hasChanged && !saving ? handleSave : undefined}
            disabled={!hasChanged || saving}
          >
            {saving ? 'Saving…' : 'Save Branding'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff0f0', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', color: '#c62828', fontSize: '13px' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: '#f0fff4', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', color: '#2e7d32', fontSize: '13px' }}>
          Branding saved successfully. Changes take effect immediately.
        </div>
      )}

      <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#666' }}>
        These settings override the compile-time theme and take effect immediately without a redeploy.
      </p>

      {/* Building Name */}
      <div style={formGroupStyle}>
        <span style={formLabelStyle}>Building Name</span>
        <input
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          placeholder="e.g. 77 Hudson"
          value={form.buildingName}
          onChange={set('buildingName')}
        />
      </div>

      {/* Portal Title */}
      <div style={formGroupStyle}>
        <span style={formLabelStyle}>Portal Title</span>
        <input
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          placeholder="e.g. 77 Hudson Resident Portal"
          value={form.portalTitle}
          onChange={set('portalTitle')}
        />
      </div>

      {/* Sidebar Brand Text */}
      <div style={formGroupStyle}>
        <span style={formLabelStyle}>Sidebar Brand Text</span>
        <input
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          placeholder="Short name shown in sidebar header"
          value={form.sidebarBrandText}
          onChange={set('sidebarBrandText')}
        />
      </div>

      {/* Logo URL */}
      <div style={formGroupStyle}>
        <span style={formLabelStyle}>Logo URL</span>
        <input
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          placeholder="/assets/themes/your-building/logo.png"
          value={form.logoUrl}
          onChange={set('logoUrl')}
        />
        {form.logoUrl && (
          <div style={{ marginTop: '8px' }}>
            <img
              src={form.logoUrl}
              alt="Logo preview"
              style={{ maxHeight: '40px', maxWidth: '200px', objectFit: 'contain' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
      </div>

      {/* Colors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={formGroupStyle}>
          <span style={formLabelStyle}>Primary Color</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="color"
              value={form.primaryColor}
              onChange={set('primaryColor')}
              style={{ width: '40px', height: '36px', padding: '2px', cursor: 'pointer', borderWidth: '1px', borderStyle: 'solid', borderColor: '#ddd', borderRadius: '4px', background: '#fff' }}
            />
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="#1a5c5a"
              value={form.primaryColor}
              onChange={set('primaryColor')}
              maxLength={7}
            />
          </div>
        </div>

        <div style={formGroupStyle}>
          <span style={formLabelStyle}>Accent Color</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="color"
              value={form.accentColor}
              onChange={set('accentColor')}
              style={{ width: '40px', height: '36px', padding: '2px', cursor: 'pointer', borderWidth: '1px', borderStyle: 'solid', borderColor: '#ddd', borderRadius: '4px', background: '#fff' }}
            />
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="#e6a000"
              value={form.accentColor}
              onChange={set('accentColor')}
              maxLength={7}
            />
          </div>
        </div>
      </div>

      {/* Welcome Message */}
      <div style={formGroupStyle}>
        <span style={formLabelStyle}>Welcome Message</span>
        <textarea
          style={{
            ...inputStyle,
            width: '100%',
            boxSizing: 'border-box',
            minHeight: '80px',
            resize: 'vertical',
            fontFamily: 'inherit',
            lineHeight: 1.5,
          }}
          placeholder="Welcome to your building. Here's your building at a glance."
          value={form.welcomeMessage}
          onChange={set('welcomeMessage')}
        />
      </div>
    </section>
  );
}
