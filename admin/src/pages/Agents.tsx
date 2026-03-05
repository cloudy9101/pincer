import { useEffect, useState } from 'react';
import { listAgents, createAgent, updateAgent, deleteAgent } from '../api';
import type { Agent } from '../types';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import ConfirmDialog from '../components/ConfirmDialog';

interface AgentFormData {
  id: string;
  name: string;
  model: string;
  system_prompt: string;
  max_steps: string;
}

const emptyForm: AgentFormData = { id: '', name: '', model: '', system_prompt: '', max_steps: '20' };

function AgentForm({
  initial,
  isEdit,
  onSave,
  onCancel,
}: {
  initial?: AgentFormData;
  isEdit?: boolean;
  onSave: (data: AgentFormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<AgentFormData>(initial ?? emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, key: keyof AgentFormData, type = 'text', required = false) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isEdit && field('Agent ID', 'id', 'text', true)}
      {field('Name', 'name', 'text', true)}
      {field('Model', 'model', 'text', true)}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
        <textarea
          value={form.system_prompt}
          onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      {field('Max Steps', 'max_steps', 'number')}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState<Agent | null>(null);

  async function load() {
    setError('');
    try { setAgents(await listAgents()); }
    catch (e) { setError(String(e)); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(data: AgentFormData) {
    await createAgent({ id: data.id, name: data.name, model: data.model, system_prompt: data.system_prompt, max_steps: parseInt(data.max_steps) || 20 });
    setShowCreate(false);
    load();
  }

  async function handleUpdate(data: AgentFormData) {
    if (!editing) return;
    await updateAgent(editing.id, { ...data, max_steps: parseInt(data.max_steps) || 20 });
    setEditing(null);
    load();
  }

  async function handleDelete() {
    if (!deleting) return;
    await deleteAgent(deleting.id);
    setDeleting(null);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Agents</h1>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
          New Agent
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {showCreate && (
        <Card>
          <h2 className="text-base font-semibold text-gray-900 mb-4">New Agent</h2>
          <AgentForm onSave={handleCreate} onCancel={() => setShowCreate(false)} />
        </Card>
      )}

      {editing && (
        <Card>
          <h2 className="text-base font-semibold text-gray-900 mb-4">Edit Agent</h2>
          <AgentForm
            initial={{ id: editing.id, name: editing.name, model: editing.model, system_prompt: editing.system_prompt ?? '', max_steps: String(editing.max_steps ?? 20) }}
            isEdit
            onSave={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        </Card>
      )}

      {agents.length === 0 && !showCreate && !error ? (
        <EmptyState message="No agents yet." action={{ label: 'Create first agent', onClick: () => setShowCreate(true) }} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Agent ID', 'Model', 'Max Steps', 'Created', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {agents.map(a => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{a.id}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{a.model}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{a.max_steps ?? 20}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(a.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right space-x-3">
                      <button onClick={() => setEditing(a)} className="text-sm text-indigo-600 hover:underline">Edit</button>
                      <button onClick={() => setDeleting(a)} className="text-sm text-red-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {agents.map(a => (
              <Card key={a.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{a.id}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.model} · {a.max_steps ?? 20} steps</p>
                  </div>
                  <div className="flex gap-3 shrink-0">
                    <button onClick={() => setEditing(a)} className="text-sm text-indigo-600">Edit</button>
                    <button onClick={() => setDeleting(a)} className="text-sm text-red-600">Delete</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete Agent"
          message={`Delete "${deleting.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
