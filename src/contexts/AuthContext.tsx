import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { AuthUser } from '../types';
import { api } from '../utils/api';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const HEARTBEAT_MS = 5 * 60 * 1000;

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<AuthUser | null>('/api/auth/me');
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      fetch('/api/auth/me', { credentials: 'same-origin' })
        .then(async (res) => {
          if (res.status === 401) {
            setUser(null);
          } else if (res.ok) {
            const data = await res.json();
            if (data === null) setUser(null);
          }
        })
        .catch(() => {
          // Ignore transient network errors; the next heartbeat will retry.
        });
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [user]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.post<AuthUser>('/api/auth/login', { username, password });
    setUser(data);
    api.clearCsrf();
    try {
      await api.refreshCsrf();
    } catch {
      // Defer CSRF token refresh until the next state-changing request.
    }
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    api.clearCsrf();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
