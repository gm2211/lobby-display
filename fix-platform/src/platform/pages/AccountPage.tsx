import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api, ApiError } from '../../utils/api';

// ---- Types ----

interface ProfileData {
  id: number;
  username: string;
  displayName: string;
  phone: string;
  emergencyContact: string;
  role: string;
  unitNumber: string;
  unitFloor: string;
}

interface NotificationPrefs {
  emailEvents: boolean;
  emailAdvisories: boolean;
  emailMaintenance: boolean;
  pushEvents: boolean;
  pushAdvisories: boolean;
  pushMaintenance: boolean;
}

// ---- Sub-components ----

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

function FormField({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div style={styles.fieldGroup}>
      <label style={styles.fieldLabel}>{label}</label>
      {children}
      {hint && <p style={styles.fieldHint}>{hint}</p>}
    </div>
  );
}

function StatusMessage({
  type,
  message,
}: {
  type: 'success' | 'error';
  message: string;
}) {
  return (
    <div
      style={{
        ...styles.statusMsg,
        ...(type === 'success' ? styles.statusSuccess : styles.statusError),
      }}
    >
      {message}
    </div>
  );
}

// ---- Main Component ----

export default function AccountPage() {
  const { user } = useAuth();

  // Profile form state
  const [profile, setProfile] = useState<ProfileData>({
    id: user?.id ?? 0,
    username: user?.username ?? '',
    displayName: '',
    phone: '',
    emergencyContact: '',
    role: user?.role ?? '',
    unitNumber: '',
    unitFloor: '',
  });
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

  // Notification prefs state
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    emailEvents: true,
    emailAdvisories: true,
    emailMaintenance: true,
    pushEvents: false,
    pushAdvisories: false,
    pushMaintenance: false,
  });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifStatus, setNotifStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Load profile on mount
  useEffect(() => {
    if (!user) return;
    api
      .get<ProfileData>(`/api/platform/profile`)
      .then((data) => {
        setProfile(data);
      })
      .catch(() => {
        // Fall back to auth user data if platform API not yet available
        setProfile((prev) => ({
          ...prev,
          id: user.id,
          username: user.username,
          role: user.role,
        }));
      })
      .finally(() => setProfileLoading(false));
  }, [user]);

  // ---- Profile save ----
  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileStatus(null);
    try {
      await api.put(`/api/platform/profile`, {
        displayName: profile.displayName,
        phone: profile.phone,
        emergencyContact: profile.emergencyContact,
      });
      setProfileStatus({ type: 'success', msg: 'Profile updated successfully.' });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save profile.';
      setProfileStatus({ type: 'error', msg });
    } finally {
      setProfileSaving(false);
    }
  };

  // ---- Password save ----
  const validatePassword = (): boolean => {
    const errs: Record<string, string> = {};
    if (!currentPassword) errs.currentPassword = 'Current password is required.';
    if (!newPassword) errs.newPassword = 'New password is required.';
    else if (newPassword.length < 8) errs.newPassword = 'Password must be at least 8 characters.';
    if (!confirmPassword) errs.confirmPassword = 'Please confirm your new password.';
    else if (newPassword !== confirmPassword) errs.confirmPassword = 'Passwords do not match.';
    setPasswordErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handlePasswordSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!validatePassword()) return;
    setPasswordSaving(true);
    setPasswordStatus(null);
    try {
      await api.post(`/api/platform/change-password`, {
        currentPassword,
        newPassword,
      });
      setPasswordStatus({ type: 'success', msg: 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordErrors({});
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to change password.';
      setPasswordStatus({ type: 'error', msg });
    } finally {
      setPasswordSaving(false);
    }
  };

  // ---- Notification prefs save ----
  const handleNotifSave = async (e: FormEvent) => {
    e.preventDefault();
    setNotifSaving(true);
    setNotifStatus(null);
    try {
      await api.put(`/api/platform/notifications`, notifPrefs);
      setNotifStatus({ type: 'success', msg: 'Notification preferences saved.' });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save preferences.';
      setNotifStatus({ type: 'error', msg });
    } finally {
      setNotifSaving(false);
    }
  };

  if (profileLoading) {
    return (
      <div style={styles.loading}>Loading account information...</div>
    );
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>Account Settings</h1>

      {/* ---- Profile Section ---- */}
      <Section title="Profile Information">
        <form onSubmit={handleProfileSave} noValidate>
          <div style={styles.formGrid}>
            <FormField label="Username">
              <input
                type="text"
                value={profile.username}
                disabled
                style={{ ...styles.input, ...styles.inputDisabled }}
                aria-label="Username (read-only)"
              />
            </FormField>

            <FormField label="Display Name" hint="How your name appears to other residents.">
              <input
                type="text"
                value={profile.displayName}
                onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                placeholder="e.g. Jane Smith"
                maxLength={100}
                style={styles.input}
                aria-label="Display Name"
              />
            </FormField>

            <FormField label="Phone Number">
              <input
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="e.g. (555) 123-4567"
                maxLength={30}
                style={styles.input}
                aria-label="Phone Number"
              />
            </FormField>

            <FormField
              label="Emergency Contact"
              hint="Name and phone number of your emergency contact."
            >
              <input
                type="text"
                value={profile.emergencyContact}
                onChange={(e) => setProfile({ ...profile, emergencyContact: e.target.value })}
                placeholder="e.g. John Smith — (555) 987-6543"
                maxLength={200}
                style={styles.input}
                aria-label="Emergency Contact"
              />
            </FormField>
          </div>

          {profileStatus && (
            <StatusMessage type={profileStatus.type} message={profileStatus.msg} />
          )}

          <button
            type="submit"
            disabled={profileSaving}
            style={{ ...styles.btn, ...(profileSaving ? styles.btnDisabled : {}) }}
          >
            {profileSaving ? 'Saving…' : 'Save Profile'}
          </button>
        </form>
      </Section>

      {/* ---- Password Section ---- */}
      <Section title="Change Password">
        <form onSubmit={handlePasswordSave} noValidate>
          <div style={styles.formGrid}>
            <FormField label="Current Password">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setPasswordErrors((prev) => ({ ...prev, currentPassword: '' }));
                }}
                autoComplete="current-password"
                style={{
                  ...styles.input,
                  ...(passwordErrors.currentPassword ? styles.inputError : {}),
                }}
                aria-label="Current Password"
                aria-describedby={passwordErrors.currentPassword ? 'err-currentPassword' : undefined}
              />
              {passwordErrors.currentPassword && (
                <p id="err-currentPassword" style={styles.errorMsg}>
                  {passwordErrors.currentPassword}
                </p>
              )}
            </FormField>

            <FormField label="New Password">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordErrors((prev) => ({ ...prev, newPassword: '' }));
                }}
                autoComplete="new-password"
                minLength={8}
                style={{
                  ...styles.input,
                  ...(passwordErrors.newPassword ? styles.inputError : {}),
                }}
                aria-label="New Password"
                aria-describedby={passwordErrors.newPassword ? 'err-newPassword' : undefined}
              />
              {passwordErrors.newPassword && (
                <p id="err-newPassword" style={styles.errorMsg}>
                  {passwordErrors.newPassword}
                </p>
              )}
            </FormField>

            <FormField label="Confirm New Password">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPasswordErrors((prev) => ({ ...prev, confirmPassword: '' }));
                }}
                autoComplete="new-password"
                style={{
                  ...styles.input,
                  ...(passwordErrors.confirmPassword ? styles.inputError : {}),
                }}
                aria-label="Confirm New Password"
                aria-describedby={passwordErrors.confirmPassword ? 'err-confirmPassword' : undefined}
              />
              {passwordErrors.confirmPassword && (
                <p id="err-confirmPassword" style={styles.errorMsg}>
                  {passwordErrors.confirmPassword}
                </p>
              )}
            </FormField>
          </div>

          {passwordStatus && (
            <StatusMessage type={passwordStatus.type} message={passwordStatus.msg} />
          )}

          <button
            type="submit"
            disabled={passwordSaving}
            style={{ ...styles.btn, ...(passwordSaving ? styles.btnDisabled : {}) }}
          >
            {passwordSaving ? 'Saving…' : 'Change Password'}
          </button>
        </form>
      </Section>

      {/* ---- Notification Preferences ---- */}
      <Section title="Notification Preferences">
        <form onSubmit={handleNotifSave} noValidate>
          <div style={styles.notifGrid}>
            <div style={styles.notifCol}>
              <p style={styles.notifColHeader}>Email Notifications</p>
              <CheckboxField
                id="emailEvents"
                label="Building events & announcements"
                checked={notifPrefs.emailEvents}
                onChange={(v) => setNotifPrefs({ ...notifPrefs, emailEvents: v })}
              />
              <CheckboxField
                id="emailAdvisories"
                label="Safety advisories & alerts"
                checked={notifPrefs.emailAdvisories}
                onChange={(v) => setNotifPrefs({ ...notifPrefs, emailAdvisories: v })}
              />
              <CheckboxField
                id="emailMaintenance"
                label="Maintenance & service updates"
                checked={notifPrefs.emailMaintenance}
                onChange={(v) => setNotifPrefs({ ...notifPrefs, emailMaintenance: v })}
              />
            </div>
            <div style={styles.notifCol}>
              <p style={styles.notifColHeader}>Push Notifications</p>
              <CheckboxField
                id="pushEvents"
                label="Building events & announcements"
                checked={notifPrefs.pushEvents}
                onChange={(v) => setNotifPrefs({ ...notifPrefs, pushEvents: v })}
              />
              <CheckboxField
                id="pushAdvisories"
                label="Safety advisories & alerts"
                checked={notifPrefs.pushAdvisories}
                onChange={(v) => setNotifPrefs({ ...notifPrefs, pushAdvisories: v })}
              />
              <CheckboxField
                id="pushMaintenance"
                label="Maintenance & service updates"
                checked={notifPrefs.pushMaintenance}
                onChange={(v) => setNotifPrefs({ ...notifPrefs, pushMaintenance: v })}
              />
            </div>
          </div>

          {notifStatus && (
            <StatusMessage type={notifStatus.type} message={notifStatus.msg} />
          )}

          <button
            type="submit"
            disabled={notifSaving}
            style={{ ...styles.btn, ...(notifSaving ? styles.btnDisabled : {}) }}
          >
            {notifSaving ? 'Saving…' : 'Save Preferences'}
          </button>
        </form>
      </Section>

      {/* ---- Unit Information (read-only) ---- */}
      <Section title="Unit Information">
        <div style={styles.unitGrid}>
          <ReadOnlyField label="Unit Number" value={profile.unitNumber || '—'} />
          <ReadOnlyField label="Floor" value={profile.unitFloor || '—'} />
          <ReadOnlyField label="Role" value={profile.role} />
          <ReadOnlyField label="Account ID" value={String(profile.id)} />
        </div>
        <p style={styles.unitNote}>
          Unit information is managed by building administration. Contact the front desk
          to update your unit assignment.
        </p>
      </Section>
    </div>
  );
}

// ---- Helper sub-components ----

function CheckboxField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label htmlFor={id} style={styles.checkboxLabel}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={styles.checkbox}
      />
      <span style={styles.checkboxText}>{label}</span>
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.readOnlyField}>
      <span style={styles.readOnlyLabel}>{label}</span>
      <span style={styles.readOnlyValue}>{value}</span>
    </div>
  );
}

// ---- Styles ----

const styles: Record<string, React.CSSProperties> = {
  page: {
    paddingBottom: '48px',
  },
  pageTitle: {
    margin: '0 0 28px 0',
    fontSize: '24px',
    fontWeight: 600,
    color: '#333',
    letterSpacing: '-0.3px',
  },
  loading: {
    color: '#888',
    fontSize: '14px',
    padding: '32px 0',
  },

  // Section
  section: {
    background: '#fff',
    borderRadius: '10px',
    borderTopWidth: '1px',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: '#e0e0e0',
    borderRightColor: '#e0e0e0',
    borderBottomColor: '#e0e0e0',
    borderLeftColor: '#e0e0e0',
    padding: '24px',
    marginBottom: '20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },
  sectionTitle: {
    margin: '0 0 20px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: '#333',
    paddingBottom: '12px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: '#e0e0e0',
  },

  // Form grid
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '20px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  fieldLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  fieldHint: {
    margin: 0,
    fontSize: '11px',
    color: '#888',
  },

  // Inputs
  input: {
    padding: '8px 12px',
    background: '#fff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#ddd',
    borderRadius: '6px',
    color: '#333',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  inputDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    background: '#f9f9f9',
  },
  inputError: {
    borderColor: '#c62828',
  },
  errorMsg: {
    margin: 0,
    fontSize: '12px',
    color: '#c62828',
  },

  // Buttons
  btn: {
    padding: '10px 20px',
    background: '#1a5c5a',
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },

  // Status messages
  statusMsg: {
    padding: '10px 14px',
    borderRadius: '6px',
    fontSize: '13px',
    marginBottom: '16px',
    borderWidth: '1px',
    borderStyle: 'solid',
  },
  statusSuccess: {
    background: '#f0fff4',
    borderColor: '#a3d9b1',
    color: '#2e7d32',
  },
  statusError: {
    background: '#fff0f0',
    borderColor: '#f5c0c0',
    color: '#c62828',
  },

  // Notification preferences
  notifGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    marginBottom: '20px',
  },
  notifCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  notifColHeader: {
    margin: '0 0 4px 0',
    fontSize: '11px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  checkboxText: {
    fontSize: '14px',
    color: '#444',
  },

  // Unit info (read-only)
  unitGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '16px',
  },
  readOnlyField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '12px 14px',
    background: '#f9f9f9',
    borderRadius: '8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#eee',
  },
  readOnlyLabel: {
    fontSize: '11px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  readOnlyValue: {
    fontSize: '14px',
    color: '#333',
  },
  unitNote: {
    margin: 0,
    fontSize: '12px',
    color: '#888',
    fontStyle: 'italic',
  },
};
