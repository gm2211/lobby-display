/**
 * AppearanceSection - Visual theming (presets, logo, colors, fonts).
 * Collapsible section, collapsed by default.
 *
 * RELATED FILES:
 * - ConfigSection.tsx - Dashboard identity (title, timezone)
 * - shared/theme/registry.ts - Theme presets
 * - shared/theme/colorUtils.ts - Palette generation
 */
import { useState, useEffect, useRef } from 'react';
import type { BuildingConfig } from '../../../types';
import { api } from '../../../utils/api';
import { themes } from '../../../../shared/theme/registry';
import { generatePalette } from '../../../../shared/theme/colorUtils';
import {
  inputStyle, selectStyle, sectionStyle, sectionChangedStyle,
  formGroupStyle, formLabelStyle, smallBtn, modalOverlay, modal,
} from '../../../styles';
import { useTheme } from '../../../theme/ThemeContext';
import { TitleFontSizeInput } from './ConfigSection';

interface AppearanceSectionProps {
  config: BuildingConfig | null;
  onSave: (optimistic?: Record<string, unknown>) => void;
  hasChanged: boolean;
  publishedConfig: BuildingConfig | null;
}

/** Built-in logos from themes (always available) */
const BUILTIN_LOGOS = [
  { url: '/assets/themes/77-hudson/logo.png', label: '77 Hudson' },
  { url: '/assets/themes/default/logo.png', label: 'Default' },
];

const FONT_FAMILIES = [
  { value: "'Nunito', sans-serif", label: 'Nunito' },
  { value: "'Inter', sans-serif", label: 'Inter' },
  { value: "'Roboto', sans-serif", label: 'Roboto' },
  { value: "'Open Sans', sans-serif", label: 'Open Sans' },
  { value: "'Lato', sans-serif", label: 'Lato' },
  { value: 'system-ui, sans-serif', label: 'System UI' },
];

const FONT_SCALES = [
  { value: 80, label: 'Small (80%)' },
  { value: 90, label: 'Compact (90%)' },
  { value: 100, label: 'Medium (100%)' },
  { value: 110, label: 'Large (110%)' },
  { value: 120, label: 'Extra Large (120%)' },
];

/** Available theme presets derived from the theme registry */
const PRESETS = Object.entries(themes).map(([id, theme]) => ({
  id,
  label: theme.buildingName,
  logoUrl: theme.logoUrl,
  colorPrimary: theme.colors.primary500,
  colorSecondary: theme.colors.secondary500,
  fontFamily: theme.fontFamily,
}));

function parseCustomLogos(raw: string | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function AppearanceSection({ config, onSave, hasChanged, publishedConfig }: AppearanceSectionProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState({
    logoUrl: '',
    themePreset: '',
    fontFamily: '',
    fontScale: 100,
    colorPrimary: '',
    colorSecondary: '',
  });
  const [addLogoOpen, setAddLogoOpen] = useState(false);
  const [newLogoUrl, setNewLogoUrl] = useState('');
  const syncedRef = useRef(false);
  const skipNextSaveRef = useRef(false);

  const customLogos = parseCustomLogos(config?.customLogos);

  const configFingerprint = config
    ? `${config.logoUrl}|${config.themePreset}|${config.fontFamily}|${config.fontScale}|${config.colorPrimary}|${config.colorSecondary}`
    : null;
  const lastFingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    if (!config || !configFingerprint) return;
    const isFirstLoad = !syncedRef.current;
    const isExternalChange = lastFingerprintRef.current !== null && lastFingerprintRef.current !== configFingerprint;
    if (isFirstLoad || isExternalChange) {
      skipNextSaveRef.current = true;
      setForm({
        logoUrl: config.logoUrl || '',
        themePreset: config.themePreset || '',
        fontFamily: config.fontFamily || theme.fontFamily,
        fontScale: config.fontScale ?? 100,
        colorPrimary: config.colorPrimary || '',
        colorSecondary: config.colorSecondary || '',
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

  const selectLogo = (url: string) => {
    setForm(f => ({ ...f, logoUrl: url }));
  };

  const addCustomLogo = () => {
    if (!newLogoUrl.trim()) return;
    const updated = [...customLogos, newLogoUrl.trim()];
    api.put('/api/config', { customLogos: JSON.stringify(updated) });
    onSave({ config: config ? { ...config, customLogos: JSON.stringify(updated) } : null });
    setForm(f => ({ ...f, logoUrl: newLogoUrl.trim() }));
    setNewLogoUrl('');
    setAddLogoOpen(false);
  };

  const removeCustomLogo = (url: string) => {
    const updated = customLogos.filter(u => u !== url);
    api.put('/api/config', { customLogos: JSON.stringify(updated) });
    onSave({ config: config ? { ...config, customLogos: JSON.stringify(updated) } : null });
    if (form.logoUrl === url) {
      setForm(f => ({ ...f, logoUrl: '' }));
    }
  };

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    setForm(f => ({
      ...f,
      themePreset: presetId,
      logoUrl: preset.logoUrl,
      colorPrimary: preset.colorPrimary,
      colorSecondary: preset.colorSecondary,
      fontFamily: preset.fontFamily,
    }));
  };

  // Check if current values match any built-in preset
  const matchingPreset = PRESETS.find(p =>
    form.colorPrimary === p.colorPrimary &&
    form.colorSecondary === p.colorSecondary &&
    form.fontFamily === p.fontFamily
  );
  const isCustom = form.colorPrimary !== '' && !matchingPreset;

  const normalize = (v: unknown) => String(v ?? '');
  const logoChanged = publishedConfig && normalize(form.logoUrl) !== normalize(publishedConfig.logoUrl || '');

  const allLogos = [
    ...BUILTIN_LOGOS.map(l => ({ ...l, builtin: true })),
    ...customLogos.map(url => ({ url, label: new URL(url, window.location.origin).pathname.split('/').pop() || 'Custom', builtin: false })),
  ];

  const cardSize = 64;
  const selectedBorder = '2px solid var(--theme-color-primary-500)';
  const defaultBorder = '2px solid #ddd';

  return (
    <section style={{ ...sectionStyle, ...(hasChanged ? sectionChangedStyle : {}) }}>
      <h2
        onClick={() => setExpanded(e => !e)}
        style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ fontSize: '12px', color: '#999', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
        Appearance
        {hasChanged && <span style={{ color: 'var(--theme-color-secondary-600)', fontSize: '12px' }}>●</span>}
      </h2>

      {expanded && (
        <div style={{ marginTop: '12px' }}>
          {/* Theme Presets */}
          <div style={{ ...formGroupStyle, marginBottom: '12px' }}>
            <span style={formLabelStyle}>
              Theme Preset
              {isCustom && <span style={{ color: 'var(--theme-color-secondary-600)', marginLeft: '6px', fontSize: '10px', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>Custom</span>}
            </span>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {PRESETS.map(preset => {
                const isActive = matchingPreset?.id === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => applyPreset(preset.id)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      outline: isActive ? selectedBorder : defaultBorder,
                      outlineOffset: '-2px',
                      background: isActive ? 'var(--theme-color-primary-50, #e8f5f4)' : '#fafafa',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      minWidth: '120px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '3px' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: preset.colorPrimary }} />
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: preset.colorSecondary }} />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: isActive ? 600 : 400, color: '#333' }}>{preset.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Logo */}
          <div style={{ ...formGroupStyle, marginBottom: '12px' }}>
            <span style={{ ...formLabelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
              Logo
              {logoChanged && <span style={{ color: 'var(--theme-color-secondary-600)' }}>*</span>}
            </span>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* "None" option */}
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <div
                  onClick={() => selectLogo('')}
                  title="No custom logo"
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
                    background: form.logoUrl === '' ? 'var(--theme-color-primary-50, #e8f5f4)' : '#fafafa',
                    fontSize: '20px',
                    color: '#ccc',
                    textAlign: 'center',
                  }}
                >
                  ∅
                </div>
                <div style={{ fontSize: '9px', color: '#999', textAlign: 'center', marginTop: '2px', maxWidth: cardSize, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  None
                </div>
              </div>

              {allLogos.map(logo => (
                <div key={logo.url} style={{ position: 'relative', display: 'inline-block' }}>
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
                      background: form.logoUrl === logo.url ? 'var(--theme-color-primary-50, #e8f5f4)' : '#fafafa',
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
                        position: 'absolute', top: '-6px', right: '-6px',
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: '#f44336', color: '#fff', fontSize: '10px',
                        lineHeight: '18px', textAlign: 'center', cursor: 'pointer',
                        padding: 0, borderWidth: 0, borderStyle: 'none',
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
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <div
                  onClick={() => setAddLogoOpen(true)}
                  title="Add custom logo"
                  style={{
                    width: cardSize, height: cardSize, borderRadius: '8px',
                    borderWidth: '2px', borderStyle: 'dashed', borderColor: '#ccc',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', background: '#fafafa', fontSize: '24px',
                    color: '#aaa', transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--theme-color-primary-500)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#ccc'; }}
                >
                  +
                </div>
                <div style={{ fontSize: '9px', color: '#999', textAlign: 'center', marginTop: '2px', maxWidth: cardSize, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Add
                </div>
              </div>
            </div>
          </div>

          {/* Typography */}
          <div style={{ ...formGroupStyle, marginBottom: '12px' }}>
            <span style={formLabelStyle}>Typography</span>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#888' }}>
                Font Family
                <select
                  style={{ ...selectStyle, minWidth: '180px' }}
                  value={form.fontFamily}
                  onChange={e => setForm(f => ({ ...f, fontFamily: e.target.value }))}
                >
                  {FONT_FAMILIES.map(ff => (
                    <option key={ff.value} value={ff.value}>{ff.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#888' }}>
                Font Scale
                <select
                  style={{ ...selectStyle, minWidth: '160px' }}
                  value={form.fontScale}
                  onChange={e => setForm(f => ({ ...f, fontScale: Number(e.target.value) }))}
                >
                  {FONT_SCALES.map(fs => (
                    <option key={fs.value} value={fs.value}>{fs.label}</option>
                  ))}
                </select>
              </label>
              <TitleFontSizeInput config={config} onSave={onSave} publishedConfig={publishedConfig} />
            </div>
          </div>

          {/* Colors */}
          <div style={{ ...formGroupStyle, marginBottom: 0 }}>
            <span style={formLabelStyle}>Colors</span>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <ColorPicker label="Primary" value={form.colorPrimary} onChange={v => setForm(f => ({ ...f, colorPrimary: v }))} />
              <ColorPicker label="Secondary" value={form.colorSecondary} onChange={v => setForm(f => ({ ...f, colorSecondary: v }))} />
            </div>
          </div>
        </div>
      )}

      {/* Add logo modal */}
      {addLogoOpen && (
        <div style={modalOverlay} onClick={() => setAddLogoOpen(false)}>
          <div style={{ ...modal, width: '400px', height: 'auto', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <strong style={{ color: '#333', fontSize: '16px' }}>Add Logo</strong>
              <button
                onClick={() => setAddLogoOpen(false)}
                style={{
                  background: 'none', borderWidth: 0, borderStyle: 'none',
                  fontSize: '20px', color: '#999', cursor: 'pointer', padding: '4px 8px',
                  lineHeight: 1,
                }}
                title="Close"
              >
                ×
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', padding: '10px 14px', fontSize: '14px' }}
                placeholder="Paste image URL..."
                value={newLogoUrl}
                onChange={e => setNewLogoUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCustomLogo(); }}
                autoFocus
              />
              {newLogoUrl && (
                <div style={{
                  display: 'flex', justifyContent: 'center', padding: '12px',
                  background: '#f9f9f9', borderRadius: '8px',
                  borderWidth: '1px', borderStyle: 'solid', borderColor: '#eee',
                }}>
                  <div style={{
                    width: 80, height: 80,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <img
                      src={newLogoUrl} alt="Preview"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={addCustomLogo}
                disabled={!newLogoUrl.trim()}
                style={{
                  padding: '10px 16px',
                  background: newLogoUrl.trim() ? 'var(--theme-color-primary-500)' : '#ccc',
                  color: '#fff', borderWidth: 0, borderStyle: 'none', borderRadius: '6px',
                  cursor: newLogoUrl.trim() ? 'pointer' : 'not-allowed', fontSize: '14px',
                  fontWeight: 600,
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

/** Color picker with hex input and palette preview */
function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const palette = value ? generatePalette(value) : null;

  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#888', marginBottom: '6px' }}>
        {label}
        <input
          type="color"
          value={value || '#1a5c5a'}
          onChange={e => onChange(e.target.value)}
          style={{ width: '28px', height: '28px', padding: 0, borderWidth: 0, borderStyle: 'none', cursor: 'pointer', borderRadius: '4px' }}
        />
        <input
          type="text"
          value={value}
          placeholder="#000000"
          onChange={e => {
            const v = e.target.value;
            if (v === '' || /^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
          }}
          style={{ ...inputStyle, width: '90px', padding: '4px 8px', fontSize: '12px', fontFamily: 'monospace' }}
        />
      </label>
      {palette && (
        <div style={{ display: 'flex', gap: '2px', marginTop: '4px' }}>
          {['50','100','200','300','400','500','600','700','800','900'].map(shade => (
            <div
              key={shade}
              title={`${shade}: ${palette[shade]}`}
              style={{ width: '18px', height: '18px', borderRadius: '3px', background: palette[shade] }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
