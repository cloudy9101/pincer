import { useEffect, useState } from 'react';
import { listAllowlist, addAllowlistEntry, removeAllowlistEntry, generatePairingCode } from '../api';
import type { AllowlistEntry } from '../types';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Allowlist() {
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [channel, setChannel] = useState('telegram');
  const [userId, setUserId] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [removing, setRemoving] = useState<AllowlistEntry | null>(null);
  const [pairingCode, setPairingCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  async function load() {
    setError('');
    try { setEntries(await listAllowlist()); }
    catch (e) { setError(String(e)); }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError('');
    try {
      await addAllowlistEntry({ channel, userId });
      setUserId('');
      setShowAdd(false);
      load();
    } catch (err) {
      setAddError(String(err));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove() {
    if (!removing) return;
    await removeAllowlistEntry(removing.id);
    setRemoving(null);
    load();
  }

  async function handleGenerateCode() {
    setGeneratingCode(true);
    try {
      const result = await generatePairingCode();
      setPairingCode(result);
    } finally {
      setGeneratingCode(false);
    }
  }

  async function copyCode() {
    if (pairingCode) await navigator.clipboard.writeText(pairingCode.code);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold text-gray-900">Allowlist</h1>
        <div className="flex gap-2">
          <button onClick={handleGenerateCode} disabled={generatingCode} className="px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
            {generatingCode ? 'Generating…' : 'Pairing Code'}
          </button>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
            Add User
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {pairingCode && (
        <Card className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Pairing Code (expires {new Date(pairingCode.expiresAt).toLocaleTimeString()})</p>
            <p className="text-lg font-mono font-bold text-gray-900 tracking-widest">{pairingCode.code}</p>
          </div>
          <button onClick={copyCode} className="px-3 py-1.5 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50">
            Copy
          </button>
        </Card>
      )}

      {showAdd && (
        <Card>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Add User</h2>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
              <select value={channel} onChange={e => setChannel(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option value="telegram">Telegram</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">User ID</label>
              <input value={userId} onChange={e => setUserId(e.target.value)} required placeholder="e.g. 123456789" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            {addError && <p className="text-sm text-red-600">{addError}</p>}
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={adding} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50">
                {adding ? 'Adding…' : 'Add'}
              </button>
            </div>
          </form>
        </Card>
      )}

      {entries.length === 0 && !showAdd && !error ? (
        <EmptyState message="No allowed users." action={{ label: 'Add first user', onClick: () => setShowAdd(true) }} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Channel', 'User ID', 'Added', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {entries.map(e => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 text-sm text-gray-900 capitalize">{e.channel}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-700">{e.user_id}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(e.added_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setRemoving(e)} className="text-sm text-red-600 hover:underline">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {entries.map(e => (
              <Card key={e.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 capitalize">{e.channel}</p>
                    <p className="text-xs font-mono text-gray-500">{e.user_id}</p>
                  </div>
                  <button onClick={() => setRemoving(e)} className="text-sm text-red-600">Remove</button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {removing && (
        <ConfirmDialog
          title="Remove User"
          message={`Remove ${removing.user_id} from the allowlist?`}
          confirmLabel="Remove"
          onConfirm={handleRemove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
