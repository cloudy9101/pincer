import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { isAuthenticated } from '../auth';
import { getStatus } from '../api';

/** Pages accessible during onboarding (before setup is marked complete). */
const SETUP_ALLOWED = new Set(['/setup', '/agents', '/allowlist']);

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [state, setState] = useState<'loading' | 'bootstrap' | 'setup' | 'ready'>('loading');

  useEffect(() => {
    // In bootstrap mode the backend allows unauthenticated requests, so we can
    // call getStatus even without a token to check if we're in that mode.
    getStatus()
      .then(s => {
        if (s.setupCompleted) {
          // Setup done — require auth
          setState(isAuthenticated() ? 'ready' : 'loading');
          if (!isAuthenticated()) setState('loading'); // will redirect to login
        } else if (s.bootstrapMode) {
          // No ADMIN_AUTH_TOKEN set — open access for onboarding
          setState('bootstrap');
        } else {
          // ADMIN_AUTH_TOKEN set but setup not complete
          setState(isAuthenticated() ? 'setup' : 'loading');
        }
      })
      .catch(() => {
        // If status fails and we have a token, let through; otherwise redirect to login
        setState(isAuthenticated() ? 'ready' : 'loading');
      });
  }, []);

  // No token and not in bootstrap mode → login
  if (!isAuthenticated() && state !== 'bootstrap' && state !== 'loading') {
    return <Navigate to="/login" replace />;
  }

  if (state === 'loading') {
    // If we have no token and the status call hasn't resolved yet, show loading.
    // If we have no token and status resolved (non-bootstrap), we'd have set state above.
    if (!isAuthenticated()) {
      return <Navigate to="/login" replace />;
    }
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    );
  }

  // Bootstrap or setup mode — redirect to setup if not on an allowed page
  if ((state === 'bootstrap' || state === 'setup') && !SETUP_ALLOWED.has(location.pathname)) {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
}
