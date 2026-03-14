import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './theme/ThemeContext';
import { ThemeCSSInjector } from './theme/ThemeCSSInjector';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Login from './pages/Login';
import Metrics from './pages/Metrics';
import ProtectedRoute from './components/ProtectedRoute';
import PlatformRouter from './platform/PlatformRouter';
import PlatformProtectedRoute from './platform/PlatformProtectedRoute';
import './index.css';

// Ping server every 10 min to prevent Render free tier spin-down
setInterval(() => fetch('/api/health').catch(() => {}), 10 * 60 * 1000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ThemeCSSInjector />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<ProtectedRoute minRole="VIEWER"><Dashboard /></ProtectedRoute>} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/metrics" element={<ProtectedRoute minRole="ADMIN"><Metrics /></ProtectedRoute>} />
            <Route
              path="/platform/*"
              element={
                <PlatformProtectedRoute minRole="VIEWER">
                  <PlatformRouter />
                </PlatformProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
