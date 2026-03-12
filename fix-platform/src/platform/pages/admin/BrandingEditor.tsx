/**
 * BrandingEditor — Admin page for EDITOR+ users to update portal branding.
 *
 * Fetches current values from GET /api/platform/branding on mount, then
 * allows the user to update them via PUT /api/platform/branding.
 *
 * FIELDS:
 * - Building Name
 * - Portal Title
 * - Sidebar Brand Text
 * - Logo URL
 * - Primary Color (hex)
 * - Accent Color (hex)
 * - Welcome Message
 *
 * ACCESS: EDITOR+ only (enforced server-side via requireMinRole('EDITOR')).
 * The PUT call uses the shared `api` utility which automatically adds
 * the CSRF token header.
 *
 * RELATED FILES:
 * - server/routes/platform/branding.ts    - GET / PUT branding endpoints
 * - src/platform/PlatformRouter.tsx       - mounts this page at /platform/admin/branding
 * - src/platform/PlatformLayout.tsx       - nav item that links here
 * - src/theme/ThemeContext.tsx            - consumes the branding API on mount
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { api } from '../../../utils/api';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import '../../styles/tokens.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrandingForm {
  buildingName: string;
  portalTitle: string;
  sidebarBrandText: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  welcomeMessage: string;
}

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function BrandingEditor() {
  const [form, setForm] = useState<BrandingForm>({
    buildingName: '',
    portalTitle: '',
    sidebarBrandText: '',
    logoUrl: '',
    primaryColor: '',
    accentColor: '',
    welcomeMessage: '',
  });

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Load current branding on mount
  // -------------------------------------------------------------------------

  const loadBranding = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await api.get<BrandingForm>('/api/platform/branding');
      setForm({
        buildingName:     data.buildingName     ?? '',
        portalTitle:      data.portalTitle      ?? '',
        sidebarBrandText: data.sidebarBrandText ?? '',
        logoUrl:          data.logoUrl          ?? '',
        primaryColor:     data.primaryColor     ?? '',
        accentColor:      data.accentColor      ?? '',
        welcomeMessage:   data.welcomeMessage   ?? '',
      });
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load branding settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBranding();
  }, [loadBranding]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleChange(field: keyof BrandingForm, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    // Clear success/error on edit so feedback is not stale
    if (saveStatus !== 'idle') {
      setSaveStatus('idle');
      setSaveError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveStatus('saving');
    setSaveError(null);

    try {
      await api.put('/api/platform/branding', form);
      setSaveStatus('success');
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'Failed to save branding settings');
    }
  }

  // -------------------------------------------------------------------------
  // Render: loading
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div style={styles.centerWrapper}>
        <LoadingSpinner size="lg" label="Loading branding settings..." />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: fetch error
  // -------------------------------------------------------------------------

  if (fetchError) {
    return (
      <div style={styles.page}>
        <div style={styles.errorAlert} role="alert">
          <span>Could not load branding settings: {fetchError}</span>
          <button
            type="button"
            style={styles.retryBtn}
            onClick={loadBranding}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: form
  // -------------------------------------------------------------------------

  return (
    <div style={styles.page}>
      {/* Page header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Branding Settings</h1>
        <p style={styles.subtitle}>
          Customize the building name, colors, and text shown throughout the resident portal.
          Changes take effect immediately after saving.
        </p>
      </div>

      {/* Form card */}
      <div style={styles.card}>

        {/* Success banner */}
        {saveStatus === 'success' && (
          <div style={styles.successAlert} role="status">
            Branding settings saved successfully.
          </div>
        )}

        {/* Error banner */}
        {saveStatus === 'error' && saveError && (
          <div style={styles.errorAlert} role="alert">
            <span>{saveError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>

          {/* Section: Identity */}
          <div style={styles.sectionHeader}>Identity</div>

          <div style={styles.row}>
            {/* Building Name */}
            <div style={styles.fieldGroupFlex}>
              <label htmlFor="branding-buildingName" style={styles.label}>
                Building Name
              </label>
              <input
                id="branding-buildingName"
                type="text"
                placeholder="e.g. 77 Hudson"
                style={styles.input}
                value={form.buildingName}
                onChange={e => handleChange('buildingName', e.target.value)}
              />
              <span style={styles.hint}>Displayed in headings and emails.</span>
            </div>

            {/* Portal Title */}
            <div style={styles.fieldGroupFlex}>
              <label htmlFor="branding-portalTitle" style={styles.label}>
                Portal Title
              </label>
              <input
                id="branding-portalTitle"
                type="text"
                placeholder="e.g. 77 Hudson Resident Portal"
                style={styles.input}
                value={form.portalTitle}
                onChange={e => handleChange('portalTitle', e.target.value)}
              />
              <span style={styles.hint}>Used as the browser page title.</span>
            </div>
          </div>

          <div style={styles.row}>
            {/* Sidebar Brand Text */}
            <div style={styles.fieldGroupFlex}>
              <label htmlFor="branding-sidebarBrandText" style={styles.label}>
                Sidebar Brand Text
              </label>
              <input
                id="branding-sidebarBrandText"
                type="text"
                placeholder="e.g. 77"
                style={styles.input}
                value={form.sidebarBrandText}
                onChange={e => handleChange('sidebarBrandText', e.target.value)}
              />
              <span style={styles.hint}>Short text shown in the sidebar header.</span>
            </div>

            {/* Logo URL */}
            <div style={styles.fieldGroupFlex}>
              <label htmlFor="branding-logoUrl" style={styles.label}>
                Logo URL
              </label>
              <input
                id="branding-logoUrl"
                type="url"
                placeholder="https://..."
                style={styles.input}
                value={form.logoUrl}
                onChange={e => handleChange('logoUrl', e.target.value)}
              />
              <span style={styles.hint}>URL of the building logo image.</span>
            </div>
          </div>

          {/* Section: Colors */}
          <div style={{ ...styles.sectionHeader, marginTop: '24px' }}>Colors</div>

          <div style={styles.row}>
            {/* Primary Color */}
            <div style={styles.fieldGroupFlex}>
              <label htmlFor="branding-primaryColor" style={styles.label}>
                Primary Color
              </label>
              <div style={styles.colorInputWrapper}>
                <input
                  id="branding-primaryColor-picker"
                  type="color"
                  style={styles.colorSwatch}
                  value={form.primaryColor || '#1a5c5a'}
                  onChange={e => handleChange('primaryColor', e.target.value)}
                  aria-label="Primary color picker"
                />
                <input
                  id="branding-primaryColor"
                  type="text"
                  placeholder="#1a5c5a"
                  style={{ ...styles.input, flex: 1 }}
                  value={form.primaryColor}
                  onChange={e => handleChange('primaryColor', e.target.value)}
                />
              </div>
              <span style={styles.hint}>Header, accent buttons, and active states.</span>
            </div>

            {/* Accent Color */}
            <div style={styles.fieldGroupFlex}>
              <label htmlFor="branding-accentColor" style={styles.label}>
                Accent Color
              </label>
              <div style={styles.colorInputWrapper}>
                <input
                  id="branding-accentColor-picker"
                  type="color"
                  style={styles.colorSwatch}
                  value={form.accentColor || '#c9a96e'}
                  onChange={e => handleChange('accentColor', e.target.value)}
                  aria-label="Accent color picker"
                />
                <input
                  id="branding-accentColor"
                  type="text"
                  placeholder="#c9a96e"
                  style={{ ...styles.input, flex: 1 }}
                  value={form.accentColor}
                  onChange={e => handleChange('accentColor', e.target.value)}
                />
              </div>
              <span style={styles.hint}>Secondary highlights and badges.</span>
            </div>
          </div>

          {/* Section: Messaging */}
          <div style={{ ...styles.sectionHeader, marginTop: '24px' }}>Messaging</div>

          {/* Welcome Message */}
          <div style={styles.fieldGroup}>
            <label htmlFor="branding-welcomeMessage" style={styles.label}>
              Welcome Message
            </label>
            <textarea
              id="branding-welcomeMessage"
              placeholder="e.g. Welcome to 77 Hudson"
              style={styles.textarea}
              value={form.welcomeMessage}
              onChange={e => handleChange('welcomeMessage', e.target.value)}
            />
            <span style={styles.hint}>Shown on the resident portal dashboard.</span>
          </div>

          {/* Actions */}
          <div style={styles.actions}>
            <button
              type="submit"
              disabled={saveStatus === 'saving'}
              style={{
                ...styles.saveBtn,
                opacity: saveStatus === 'saving' ? 0.7 : 1,
                cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
              }}
            >
              {saveStatus === 'saving' ? 'Saving...' : 'Save Branding'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, CSSProperties> = {
  page: {
    padding: '24px',
    maxWidth: '800px',
    margin: '0 auto',
  },
  centerWrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '80px',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    marginBottom: '4px',
    marginTop: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    margin: 0,
    lineHeight: 1.5,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '28px',
  },
  sectionHeader: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--platform-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: '16px',
    paddingBottom: '8px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border)',
  },
  row: {
    display: 'flex',
    gap: '16px',
    marginBottom: '20px',
    flexWrap: 'wrap' as const,
  },
  fieldGroup: {
    marginBottom: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  fieldGroupFlex: {
    flex: '1 1 240px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--platform-text-primary)',
  },
  hint: {
    fontSize: '12px',
    color: 'var(--platform-text-muted)',
  },
  input: {
    width: '100%',
    backgroundColor: 'var(--platform-bg)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '9px 12px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    width: '100%',
    backgroundColor: 'var(--platform-bg)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '9px 12px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    minHeight: '80px',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  },
  colorInputWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  colorSwatch: {
    width: '36px',
    height: '36px',
    padding: '2px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    cursor: 'pointer',
    flexShrink: 0,
    backgroundColor: 'transparent',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: '20px',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--platform-border)',
    marginTop: '8px',
  },
  saveBtn: {
    backgroundColor: 'var(--platform-accent)',
    color: '#ffffff',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '6px',
    padding: '10px 28px',
    fontSize: '14px',
    fontWeight: 600,
  },
  successAlert: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: 'rgba(46, 125, 50, 0.08)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(46, 125, 50, 0.3)',
    borderRadius: '8px',
    color: '#2e7d32',
    fontSize: '14px',
    marginBottom: '20px',
  },
  errorAlert: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '14px 16px',
    backgroundColor: 'rgba(185, 48, 64, 0.08)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(185, 48, 64, 0.3)',
    borderRadius: '8px',
    color: '#b93040',
    fontSize: '14px',
    marginBottom: '20px',
  },
  retryBtn: {
    backgroundColor: 'transparent',
    color: '#b93040',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#b93040',
    borderRadius: '6px',
    padding: '4px 12px',
    fontSize: '13px',
    cursor: 'pointer',
    flexShrink: 0,
  },
};
