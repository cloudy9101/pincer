import { useEffect, useState } from 'react';
import { listSkills, installSkill, removeSkill, listSkillSecrets, setSkillSecret } from '../api';
import type { Skill, SkillSecretKey } from '../types';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import ConfirmDialog from '../components/ConfirmDialog';

function SecretsPanel({ skillName, onClose }: { skillName: string; onClose: () => void }) {
  const [secrets, setSecrets] = useState<SkillSecretKey[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listSkillSecrets(skillName)
      .then(setSecrets)
      .catch(e => setError(String(e)));
  }, [skillName]);

  async function handleSetSecret(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await setSkillSecret(skillName, newKey, newValue);
      const updated = await listSkillSecrets(skillName);
      setSecrets(updated);
      setNewKey('');
      setNewValue('');
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="bg-white w-full sm:max-w-md sm:rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-base font-semibold text-gray-900">Secrets — {skillName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-4 flex-1">
          {error && <ErrorBanner message={error} />}
          {secrets.length === 0 ? (
            <p className="text-sm text-gray-500">No secrets configured.</p>
          ) : (
            <ul className="space-y-2">
              {secrets.map(s => (
                <li key={s.key} className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm font-mono text-gray-700">{s.key}</span>
                  <span className="text-xs text-gray-400">••••••••</span>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleSetSecret} className="space-y-3 pt-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Set a secret</p>
            <input
              placeholder="Key"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <input
              type="password"
              placeholder="Value"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <button type="submit" disabled={saving} className="w-full py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Set Secret'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function Skills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installInput, setInstallInput] = useState('');
  const [installError, setInstallError] = useState('');
  const [showInstall, setShowInstall] = useState(false);
  const [removing, setRemoving] = useState<Skill | null>(null);
  const [secretsFor, setSecretsFor] = useState<string | null>(null);

  async function load() {
    setError('');
    try { setSkills(await listSkills()); }
    catch (e) { setError(String(e)); }
  }

  useEffect(() => { load(); }, []);

  async function handleInstall(e: React.FormEvent) {
    e.preventDefault();
    setInstalling(true);
    setInstallError('');
    try {
      const isUrl = installInput.startsWith('http');
      await installSkill(isUrl ? { url: installInput } : { name: installInput });
      setInstallInput('');
      setShowInstall(false);
      load();
    } catch (err) {
      setInstallError(String(err));
    } finally {
      setInstalling(false);
    }
  }

  async function handleRemove() {
    if (!removing) return;
    await removeSkill(removing.name);
    setRemoving(null);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Skills</h1>
        <button onClick={() => setShowInstall(true)} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
          Install Skill
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {showInstall && (
        <Card>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Install Skill</h2>
          <form onSubmit={handleInstall} className="space-y-3">
            <input
              placeholder="Skill name or SKILL.md URL"
              value={installInput}
              onChange={e => setInstallInput(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {installError && <p className="text-sm text-red-600">{installError}</p>}
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => { setShowInstall(false); setInstallError(''); }} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={installing} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50">
                {installing ? 'Installing…' : 'Install'}
              </button>
            </div>
          </form>
        </Card>
      )}

      {skills.length === 0 && !showInstall && !error ? (
        <EmptyState message="No skills installed." action={{ label: 'Install first skill', onClick: () => setShowInstall(true) }} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Name', 'Auth Type', 'Version', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {skills.map(s => (
                  <tr key={s.name}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{s.auth_type ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{s.version ?? '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {s.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-3">
                      <button onClick={() => setSecretsFor(s.name)} className="text-sm text-indigo-600 hover:underline">Secrets</button>
                      <button onClick={() => setRemoving(s)} className="text-sm text-red-600 hover:underline">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {skills.map(s => (
              <Card key={s.name}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.auth_type ?? 'no auth'} · v{s.version ?? '?'}</p>
                  </div>
                  <div className="flex gap-3 shrink-0">
                    <button onClick={() => setSecretsFor(s.name)} className="text-sm text-indigo-600">Secrets</button>
                    <button onClick={() => setRemoving(s)} className="text-sm text-red-600">Remove</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {secretsFor && <SecretsPanel skillName={secretsFor} onClose={() => setSecretsFor(null)} />}

      {removing && (
        <ConfirmDialog
          title="Remove Skill"
          message={`Remove "${removing.name}"?`}
          confirmLabel="Remove"
          onConfirm={handleRemove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
