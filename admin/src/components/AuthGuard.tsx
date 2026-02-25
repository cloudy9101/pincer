import { Navigate } from 'react-router';
import { isAuthenticated } from '../auth';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
