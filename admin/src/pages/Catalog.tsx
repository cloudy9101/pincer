import { useEffect, useState } from 'react';
import { listCatalog, installCatalogSkill } from '../api';
import type { CatalogSkill, CatalogSecretField } from '../types';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';

const AUTH_BADGE: Record<string, string> = {
  oauth: 'bg-purple-100 text-purple-700',
  bearer: 'bg-blue-100 text-blue-700',
  query: 'bg-blue-100 text-blue-700',
  header: 'bg-blue-100 text-blue-700',
  none: 'bg-gray-100 text-gray-600',
};

function InstallModal({
  skill,
  onClose,
  onInstalled,
}: {
  skill: CatalogSkill;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const [secrets, setSecrets] = useState<Record<string, string>>(
    Object.fromEntries(skill.secretFields.map((f: CatalogSecretField) => [f.key, ''])),
  );
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInstalling(true);
    setError('');
    try {
      await installCatalogSkill(skill.name, secrets);
      onInstalled();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="bg-white w-full sm:max-w-md sm:rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-base font-semibold text-gray-900">Install — {skill.displayName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">
          {error && <ErrorBanner message={error} />}
          {skill.authType === 'oauth' ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                <strong>{skill.displayName}</strong> uses OAuth via{' '}
                <span className="font-mono">{skill.oauthProvider}</span>.
              </p>
              <p className="text-sm text-gray-500">
                After installing, connect your account by asking the assistant:{' '}
                <span className="font-mono bg-gray-100 px-1 rounded">
                  connect my {skill.oauthProvider} account
                </span>
              </p>
              <button
                onClick={handleSubmit as unknown as React.MouseEventHandler}
                disabled={installing}
                className="w-full py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {installing ? 'Installing…' : 'Install'}
              </button>
            </div>
          ) : skill.secretFields.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                <strong>{skill.displayName}</strong> requires no credentials. Click install to activate it.
              </p>
              <button
                onClick={handleSubmit as unknown as React.MouseEventHandler}
                disabled={installing}
                className="w-full py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {installing ? 'Installing…' : 'Install'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-700">Enter your API credentials to activate this skill.</p>
              {skill.secretFields.map((f: CatalogSecretField) => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                  <input
                    type="password"
                    placeholder={f.placeholder}
                    value={secrets[f.key] ?? ''}
                    onChange={e => setSecrets(s => ({ ...s, [f.key]: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
                  />
                </div>
              ))}
              {skill.setupUrl && (
                <p className="text-xs text-gray-400">
                  Get your API key at{' '}
                  <a href={skill.setupUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                    {skill.setupUrl}
                  </a>
                </p>
              )}
              <button
                type="submit"
                disabled={installing}
                className="w-full py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {installing ? 'Installing…' : 'Install'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Catalog() {
  const [skills, setSkills] = useState<CatalogSkill[]>([]);
  const [error, setError] = useState('');
  const [installing, setInstalling] = useState<CatalogSkill | null>(null);

  async function load() {
    setError('');
    try {
      setSkills(await listCatalog());
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Skill Catalog</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pre-built skills ready to install. Manage installed skills from the Skills page.</p>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {skills.length === 0 && !error ? (
        <EmptyState message="Loading catalog…" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map(skill => (
            <Card key={skill.name}>
              <div className="flex flex-col h-full gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{skill.displayName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{skill.description}</p>
                  </div>
                  <span className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${AUTH_BADGE[skill.authType] ?? 'bg-gray-100 text-gray-600'}`}>
                    {skill.authType}
                  </span>
                </div>
                <div className="mt-auto">
                  {skill.installed ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                      ✓ Installed
                    </span>
                  ) : (
                    <button
                      onClick={() => setInstalling(skill)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                    >
                      Install
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {installing && (
        <InstallModal
          skill={installing}
          onClose={() => setInstalling(null)}
          onInstalled={load}
        />
      )}
    </div>
  );
}
