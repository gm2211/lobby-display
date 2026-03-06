import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../utils/api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [setupMode, setSetupMode] = useState<boolean | null>(null);
  const { login, refresh, user } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();

  useEffect(() => {
    if (user) navigate(user.role === 'VIEWER' ? '/' : '/admin');
  }, [user, navigate]);

  useEffect(() => {
    api.get<{ required: boolean }>('/api/auth/setup-required')
      .then(data => setSetupMode(data.required))
      .catch(() => setSetupMode(false));
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/auth/setup', { username, password });
      api.clearCsrf();
      try {
        await api.refreshCsrf();
      } catch {
        // Defer CSRF token refresh until the next state-changing request.
      }
      await refresh();
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (setupMode === null) {
    return <div style={styles.page}><div style={styles.form}>Loading...</div></div>;
  }

  if (setupMode) {
    return (
      <div style={styles.page}>
        <form onSubmit={handleSetup} style={styles.form}>
          <div style={styles.logoArea}>
            <span style={styles.logoText}>{theme.loginBrandText}</span>
          </div>
          <h1 style={styles.title}>Create Admin Account</h1>
          <p style={styles.subtitle}>Set up your first admin account to get started.</p>

          {error && <div style={styles.error}>{error}</div>}

          <label style={styles.label}>
            Username
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Confirm Password
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              style={styles.input}
            />
          </label>

          <button type="submit" disabled={submitting} style={styles.button}>
            {submitting ? 'Creating...' : 'Create Account'}
          </button>

          </form>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <form onSubmit={handleLogin} style={styles.form}>
        <div style={styles.logoArea}>
          <span style={styles.logoText}>{theme.loginBrandText}</span>
        </div>
        <h1 style={styles.title}>Sign In</h1>

        {error && <div style={styles.error}>{error}</div>}

        <label style={styles.label}>
          Username
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            autoFocus
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          Password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={styles.input}
          />
        </label>

        <button type="submit" disabled={submitting} style={styles.button}>
          {submitting ? 'Signing in...' : 'Sign In'}
        </button>

      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #e8f5f5 0%, #f5f7fa 60%, #fff 100%)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '100%',
    maxWidth: '360px',
    padding: '36px 32px',
    background: '#fff',
    borderRadius: '12px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#b2dfdb',
    boxShadow: '0 4px 24px rgba(26, 92, 90, 0.08)',
    color: '#333',
  },
  logoArea: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '4px',
  },
  logoText: {
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    color: '#1a5c5a',
    opacity: 0.7,
  },
  title: {
    margin: 0,
    color: '#1a5c5a',
    fontSize: '22px',
    fontWeight: 700,
    textAlign: 'center',
  },
  subtitle: {
    margin: 0,
    color: '#666',
    fontSize: '13px',
    textAlign: 'center',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    color: '#555',
    fontSize: '13px',
    fontWeight: 600,
  },
  input: {
    padding: '10px 12px',
    background: '#fff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#ccc',
    borderRadius: '6px',
    color: '#333',
    fontSize: '14px',
    outline: 'none',
    fontWeight: 400,
  },
  button: {
    padding: '11px',
    background: '#1a5c5a',
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '8px',
    letterSpacing: '0.3px',
  },
  error: {
    padding: '10px',
    background: '#fff5f5',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#ffcdd2',
    borderRadius: '6px',
    color: '#c62828',
    fontSize: '13px',
    textAlign: 'center',
  },
};
