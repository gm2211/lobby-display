import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ROLE_LEVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

export default function ProtectedRoute({ children, minRole = 'EDITOR' }: { children: React.ReactNode; minRole?: string }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0a1628', color: '#e0e0e0' }}>
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
