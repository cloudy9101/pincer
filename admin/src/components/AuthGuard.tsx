import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { isAuthenticated } from '../auth';
import { getStatus } from '../api';

/** Pages accessible during onboarding (before setup is marked complete). */
const SETUP_ALLOWED = new Set(['/setup', '/agents', '/allowlist']);

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [state, setState] = useState<'loading' | 'setup' | 'ready'>('loading');

  useEffect(() => {
    if (!isAuthenticated()) return;
    getStatus()
      .then(s => setState(s.setupCompleted ? 'ready' : 'setup'))
      .catch(() => setState('ready')); // on error, let through
  }, []);

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    );
  }

  // Redirect to setup if not completed, unless on an allowed page
  if (state === 'setup' && !SETUP_ALLOWED.has(location.pathname)) {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
}
