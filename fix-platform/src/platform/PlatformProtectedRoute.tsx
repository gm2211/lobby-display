import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ReactNode } from 'react';

interface PlatformProtectedRouteProps {
  children: ReactNode;
  minRole?: 'VIEWER' | 'EDITOR' | 'ADMIN';
}

const ROLE_LEVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

export default function PlatformProtectedRoute({
  children,
  minRole = 'VIEWER',
}: PlatformProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#f5f0eb',
        color: '#333',
        fontFamily: "'Nunito', sans-serif",
        fontSize: '15px',
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if ((ROLE_LEVEL[user.role] ?? 0) < (ROLE_LEVEL[minRole] ?? 0)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
