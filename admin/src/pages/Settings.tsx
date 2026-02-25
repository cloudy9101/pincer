import { useEffect, useState } from 'react';
import { listConfig, setConfig } from '../api';
import type { ConfigEntry } from '../types';
import ErrorBanner from '../components/ErrorBanner';
import EmptyState from '../components/EmptyState';

function ConfigRow({ entry, onSaved }: { entry: ConfigEntry; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(entry.value);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await setConfig(entry.key, value);
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setEditing(false); setValue(entry.value); }
  }

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      <span className="text-sm font-mono text-gray-700 w-1/3 shrink-0">{entry.key}</span>
      {editing ? (
        <div className="flex-1 flex gap-2 items-center">
          <input
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-2 py-1 border border-indigo-400 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button onClick={handleSave} disabled={saving} className="text-xs font-medium text-white bg-indigo-600 px-2 py-1 rounded hover:bg-indigo-700 disabled:opacity-50">
            {saving ? '…' : 'Save'}
          </button>
          <button onClick={() => { setEditing(false); setValue(entry.value); }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex-1 text-left text-sm text-gray-600 truncate hover:text-indigo-600 transition-colors"
          title="Click to edit"
        >
          {value || <span className="text-gray-300 italic">empty</span>}
        </button>
      )}
    </div>
  );
}

export default function Settings() {
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [adding, setAdding] = useState(false);

  async function load() {
    setError('');
    try { setEntries(await listConfig()); }
    catch (e) { setError(String(e)); }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      await setConfig(newKey, newValue);
      setNewKey('');
      setNewValue('');
      setShowAdd(false);
      load();
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <button onClick={() => setShowAdd(s => !s)} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
          Add Setting
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <input placeholder="Key" value={newKey} onChange={e => setNewKey(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <input placeholder="Value" value={newValue} onChange={e => setNewValue(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={adding} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50">
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {entries.length === 0 && !showAdd && !error ? (
        <EmptyState message="No config values set." />
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg px-4">
          {entries.map(e => (
            <ConfigRow key={e.key} entry={e} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  );
}
