import { useEffect, useState } from 'react';
import { listSessions, getSession, resetSession } from '../api';
import type { Session, SessionMessage } from '../types';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import ConfirmDialog from '../components/ConfirmDialog';

function HistoryPanel({ sessionKey, onClose }: { sessionKey: string; onClose: () => void }) {
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getSession(sessionKey)
      .then(r => setMessages(r.messages))
      .catch(e => setError(String(e)));
  }, [sessionKey]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold text-gray-900 truncate max-w-xs">{sessionKey}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-2">&times;</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3 flex-1">
          {error && <ErrorBanner message={error} />}
          {messages.length === 0 && !error && <p className="text-sm text-gray-500">No messages.</p>}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}>
                {m.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const [resetting, setResetting] = useState<Session | null>(null);

  async function load() {
    setError('');
    try { setSessions(await listSessions()); }
    catch (e) { setError(String(e)); }
  }

  useEffect(() => { load(); }, []);

  async function handleReset() {
    if (!resetting) return;
    await resetSession(resetting.session_key);
    setResetting(null);
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Sessions</h1>
      {error && <ErrorBanner message={error} onRetry={load} />}

      {sessions.length === 0 && !error ? (
        <EmptyState message="No active sessions." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Session Key', 'Agent', 'Messages', 'Last Active', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sessions.map(s => (
                  <tr key={s.session_key}>
                    <td className="px-4 py-3 text-sm font-mono text-gray-700 max-w-xs truncate">{s.session_key}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{s.agent_id}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{s.message_count}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(s.last_activity * 1000).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right space-x-3">
                      <button onClick={() => setViewing(s.session_key)} className="text-sm text-indigo-600 hover:underline">View</button>
                      <button onClick={() => setResetting(s)} className="text-sm text-red-600 hover:underline">Reset</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {sessions.map(s => (
              <Card key={s.session_key}>
                <p className="text-xs font-mono text-gray-600 truncate mb-1">{s.session_key}</p>
                <p className="text-xs text-gray-500 mb-2">{s.agent_id} · {s.message_count} messages</p>
                <p className="text-xs text-gray-400 mb-3">{new Date(s.last_activity * 1000).toLocaleString()}</p>
                <div className="flex gap-3">
                  <button onClick={() => setViewing(s.session_key)} className="text-sm text-indigo-600">View</button>
                  <button onClick={() => setResetting(s)} className="text-sm text-red-600">Reset</button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {viewing && <HistoryPanel sessionKey={viewing} onClose={() => setViewing(null)} />}

      {resetting && (
        <ConfirmDialog
          title="Reset Session"
          message={`Clear all messages for this session? This cannot be undone.`}
          confirmLabel="Reset"
          onConfirm={handleReset}
          onCancel={() => setResetting(null)}
        />
      )}
    </div>
  );
}
