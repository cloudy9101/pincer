import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getStatus, getUsage, listSessions, getTelegramWebhook } from '../api';
import type { StatusResponse, UsageResponse, Session } from '../types';
import Card from '../components/Card';
import ErrorBanner from '../components/ErrorBanner';

export default function Dashboard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const [s, u, sess, wh] = await Promise.all([getStatus(), getUsage(), listSessions(), getTelegramWebhook()]);
      setStatus(s);
      setUsage(u);
      setSessions(sess.slice(0, 5));
      setNeedsSetup(!wh.ok || wh.result.url === '');
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>

      {needsSetup && (
        <Link
          to="/setup"
          className="flex items-center justify-between rounded-md bg-indigo-50 border border-indigo-200 px-4 py-3 hover:bg-indigo-100 transition-colors"
        >
          <div>
            <p className="text-sm font-medium text-indigo-800">Setup required</p>
            <p className="text-xs text-indigo-600">Complete the onboarding steps to get your bot running.</p>
          </div>
          <svg className="w-5 h-5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* Status + Usage */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</p>
          <p className="mt-1 text-lg font-semibold text-gray-900 capitalize">{status?.status ?? '—'}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sessions</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{status?.sessions ?? '—'}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Tokens</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {usage ? usage.usage.reduce((s, r) => s + r.total_input + r.total_output, 0).toLocaleString() : '—'}
          </p>
        </Card>
      </div>

      {/* Per-model usage */}
      {usage && usage.usage.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-3">Usage by Model</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {usage.usage.map(m => (
              <Card key={`${m.provider}/${m.model}`} className="flex justify-between items-center">
                <span className="text-sm text-gray-700 truncate">{m.model}</span>
                <span className="text-sm font-medium text-gray-900 ml-4 shrink-0">{(m.total_input + m.total_output).toLocaleString()} tokens</span>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-3">Recent Sessions</h2>
          <div className="space-y-2">
            {sessions.map(s => (
              <Link
                key={s.session_key}
                to="/sessions"
                className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.session_key}</p>
                  <p className="text-xs text-gray-500">{s.agent_id} · {s.message_count} messages</p>
                </div>
                <span className="text-xs text-gray-400 ml-4 shrink-0">
                  {new Date(s.last_activity * 1000).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
