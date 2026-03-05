import { Routes, Route, Navigate } from 'react-router';
import AuthGuard from './components/AuthGuard';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Agents from './pages/Agents';
import Skills from './pages/Skills';
import Catalog from './pages/Catalog';
import Sessions from './pages/Sessions';
import Allowlist from './pages/Allowlist';
import Settings from './pages/Settings';
import Setup from './pages/Setup';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <AuthGuard>
            <Layout />
          </AuthGuard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="agents" element={<Agents />} />
        <Route path="skills" element={<Skills />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="allowlist" element={<Allowlist />} />
        <Route path="settings" element={<Settings />} />
        <Route path="setup" element={<Setup />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
