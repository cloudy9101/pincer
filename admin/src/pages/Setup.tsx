import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  getSetupCheck, getTelegramWebhook, setupTelegramChannel,
  listAgents, listAllowlist, listConnectors,
  saveConnector, removeConnector, completeSetup, patchConfig,
} from '../api';
import type { SetupCheckResponse, ConnectorEntry } from '../types';
import Card from '../components/Card';
import ErrorBanner from '../components/ErrorBanner';

type StepStatus = 'loading' | 'pending' | 'done' | 'error';

interface Steps {
  secrets: StepStatus;
  telegram: StepStatus;
  connectors: StepStatus;
  agent: StepStatus;
  allowlist: StepStatus;
}

const CONNECTOR_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
};

export default function Setup() {
  const navigate = useNavigate();
  const [steps, setSteps] = useState<Steps>({
    secrets: 'loading', telegram: 'loading', connectors: 'loading',
    agent: 'loading', allowlist: 'loading',
  });
  const [secretsInfo, setSecretsInfo] = useState<SetupCheckResponse | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookError, setWebhookError] = useState('');
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [ownerId, setOwnerId] = useState('');
  const [ownerIdSaving, setOwnerIdSaving] = useState(false);
  const [ownerIdSaved, setOwnerIdSaved] = useState(false);
  const [connectors, setConnectors] = useState<ConnectorEntry[]>([]);
  const [connectorForms, setConnectorForms] = useState<Record<string, { clientId: string; clientSecret: string }>>({});
  const [connectorSaving, setConnectorSaving] = useState<string | null>(null);
  const [connectorError, setConnectorError] = useState<Record<string, string>>({});
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const [checkInfo, whInfo, agents, allowlist, existingConnectors] = await Promise.all([
        getSetupCheck(),
        getTelegramWebhook(),
        listAgents(),
        listAllowlist(),
        listConnectors(),
      ]);

      setSecretsInfo(checkInfo);
      setConnectors(existingConnectors);

      const allSecretsOk = Object.values(checkInfo.secrets).every(Boolean);
      const hasWebhook = whInfo.ok && whInfo.result.url !== '';
      setWebhookUrl(whInfo.ok ? whInfo.result.url : '');
      setOwnerId(checkInfo.telegram.ownerId);
      if (checkInfo.telegram.ownerId) setOwnerIdSaved(true);

      // Telegram step is done when webhook is registered (secret is auto-generated)
      const telegramDone = hasWebhook && checkInfo.telegram.webhookSecretConfigured;

      setSteps({
        secrets: allSecretsOk ? 'done' : 'error',
        telegram: telegramDone ? 'done' : 'pending',
        connectors: 'done', // always "done" since connectors are optional
        agent: agents.length > 0 ? 'done' : 'pending',
        allowlist: allowlist.length > 0 ? 'done' : 'pending',
      });
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSetupWebhook() {
    setWebhookLoading(true);
    setWebhookError('');
    try {
      const result = await setupTelegramChannel();
      if (result.webhook.ok) {
        setSteps(s => ({ ...s, telegram: 'done' }));
        const info = await getTelegramWebhook();
        if (info.ok) setWebhookUrl(info.result.url);
      } else {
        setWebhookError(result.webhook.description ?? 'Failed to register webhook');
        setSteps(s => ({ ...s, telegram: 'error' }));
      }
    } catch (e) {
      setWebhookError(String(e));
      setSteps(s => ({ ...s, telegram: 'error' }));
    } finally {
      setWebhookLoading(false);
    }
  }

  async function handleSaveOwnerId() {
    setOwnerIdSaving(true);
    try {
      await patchConfig({ telegram_owner_id: ownerId.trim() });
      setOwnerIdSaved(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setOwnerIdSaving(false);
    }
  }

  function updateConnectorForm(provider: string, field: 'clientId' | 'clientSecret', value: string) {
    setConnectorForms(f => ({
      ...f,
      [provider]: { ...f[provider], [field]: value },
    }));
  }

  async function handleSaveConnector(provider: string) {
    const form = connectorForms[provider];
    if (!form?.clientId || !form?.clientSecret) {
      setConnectorError(e => ({ ...e, [provider]: 'Both Client ID and Client Secret are required' }));
      return;
    }
    setConnectorSaving(provider);
    setConnectorError(e => ({ ...e, [provider]: '' }));
    try {
      await saveConnector(provider, { client_id: form.clientId, client_secret: form.clientSecret });
      setConnectorForms(f => ({ ...f, [provider]: { clientId: '', clientSecret: '' } }));
      const updated = await listConnectors();
      setConnectors(updated);
    } catch (e) {
      setConnectorError(err => ({ ...err, [provider]: String(e) }));
    } finally {
      setConnectorSaving(null);
    }
  }

  async function handleRemoveConnector(provider: string) {
    setConnectorSaving(provider);
    try {
      await removeConnector(provider);
      const updated = await listConnectors();
      setConnectors(updated);
    } catch (e) {
      setConnectorError(err => ({ ...err, [provider]: String(e) }));
    } finally {
      setConnectorSaving(null);
    }
  }

  const requiredDone = steps.secrets !== 'error' && steps.telegram === 'done' && steps.agent === 'done' && steps.allowlist === 'done';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Setup</h1>
        <p className="mt-1 text-sm text-gray-500">
          Complete these steps to get your bot up and running.
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {requiredDone && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-medium text-green-800">All set! Your bot is ready to use.</p>
          <button
            onClick={async () => {
              setFinishing(true);
              try {
                await completeSetup();
                navigate('/', { replace: true });
              } catch (e) {
                setError(String(e));
                setFinishing(false);
              }
            }}
            disabled={finishing}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {finishing ? 'Finishing...' : 'Go to Dashboard'}
          </button>
        </div>
      )}

      <div className="space-y-4">
        {/* Step 1: Required Secrets */}
        <Card>
          <div className="flex items-start gap-3">
            <StepIcon status={steps.secrets} />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">Required Secrets</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                These must be set via <code className="text-xs bg-gray-100 px-1 rounded">wrangler secret put</code> before the bot can work.
              </p>
              {secretsInfo && (
                <ul className="mt-2 space-y-1">
                  {Object.entries(secretsInfo.secrets).map(([key, ok]) => (
                    <li key={key} className="flex items-center gap-2 text-xs">
                      {ok ? (
                        <span className="text-green-600">&#10003;</span>
                      ) : (
                        <span className="text-red-500">&#10007;</span>
                      )}
                      <code className={ok ? 'text-gray-600' : 'text-red-600 font-medium'}>{key}</code>
                    </li>
                  ))}
                </ul>
              )}
              {steps.secrets === 'error' && (
                <p className="mt-2 text-xs text-red-600">
                  Set the missing secrets with <code className="bg-red-50 px-1 rounded">wrangler secret put &lt;KEY&gt;</code> and reload this page.
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Step 2: Telegram Setup */}
        <Card>
          <div className="flex items-start gap-3">
            <StepIcon status={steps.telegram} />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">Connect Telegram</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Register the webhook and configure Telegram settings. The webhook secret is generated automatically.
              </p>

              {/* Webhook status */}
              {steps.telegram === 'done' && webhookUrl && (
                <p className="mt-2 text-xs text-gray-400 truncate" title={webhookUrl}>
                  Webhook: {webhookUrl}
                </p>
              )}
              {webhookError && (
                <p className="mt-2 text-xs text-red-600">{webhookError}</p>
              )}
              {steps.telegram !== 'done' && (
                <button
                  onClick={handleSetupWebhook}
                  disabled={webhookLoading}
                  className="mt-3 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {webhookLoading ? 'Registering...' : 'Register Webhook'}
                </button>
              )}

              {/* Owner ID */}
              <div className="mt-4 pt-3 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-700">
                  Owner Telegram User ID <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  Set this so you are recognised as the bot owner on first contact. Find your ID by messaging @userinfobot on Telegram.
                </p>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 123456789"
                    value={ownerId}
                    onChange={e => { setOwnerId(e.target.value); setOwnerIdSaved(false); }}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    onClick={handleSaveOwnerId}
                    disabled={ownerIdSaving || ownerIdSaved}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {ownerIdSaving ? 'Saving...' : ownerIdSaved ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Step 3: OAuth Connectors (optional) */}
        <Card>
          <div className="flex items-start gap-3">
            <StepIcon status={steps.connectors} />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">OAuth Connectors <span className="text-xs font-normal text-gray-400">(optional)</span></h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Configure OAuth providers to let users connect their accounts.
              </p>

              <div className="mt-3 space-y-3">
                {(secretsInfo?.connectors ?? []).map(({ id }) => {
                  const existing = connectors.find(c => c.provider === id);
                  const form = connectorForms[id] ?? { clientId: '', clientSecret: '' };
                  const saving = connectorSaving === id;
                  const errMsg = connectorError[id];

                  return (
                    <div key={id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-gray-800">{CONNECTOR_LABELS[id] ?? id}</h4>
                        {existing && (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                            <span>&#10003;</span> Connected
                          </span>
                        )}
                      </div>

                      {existing ? (
                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-xs text-gray-500">Client ID: <code className="bg-gray-100 px-1 rounded">{existing.client_id}</code></p>
                          <button
                            onClick={() => handleRemoveConnector(id)}
                            disabled={saving}
                            className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            {saving ? 'Removing...' : 'Remove'}
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            placeholder="Client ID"
                            value={form.clientId}
                            onChange={e => updateConnectorForm(id, 'clientId', e.target.value)}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                          />
                          <input
                            type="password"
                            placeholder="Client Secret"
                            value={form.clientSecret}
                            onChange={e => updateConnectorForm(id, 'clientSecret', e.target.value)}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                          />
                          <button
                            onClick={() => handleSaveConnector(id)}
                            disabled={saving || !form.clientId || !form.clientSecret}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      )}

                      {errMsg && <p className="mt-1 text-xs text-red-600">{errMsg}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        {/* Step 4: Agent */}
        <Card>
          <div className="flex items-start gap-3">
            <StepIcon status={steps.agent} />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">Create an Agent</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Configure at least one agent with a model and system prompt.
              </p>
              {steps.agent === 'pending' && (
                <Link
                  to="/agents"
                  className="mt-3 inline-block px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50"
                >
                  Go to Agents
                </Link>
              )}
              {steps.agent === 'done' && (
                <p className="mt-1 text-xs text-green-600">Agent configured</p>
              )}
            </div>
          </div>
        </Card>

        {/* Step 5: Allowlist */}
        <Card>
          <div className="flex items-start gap-3">
            <StepIcon status={steps.allowlist} />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">Add Users</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Add at least one user to the allowlist. If you set an Owner ID above, that user is auto-approved on first message.
              </p>
              {steps.allowlist === 'pending' && (
                <Link
                  to="/allowlist"
                  className="mt-3 inline-block px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50"
                >
                  Go to Allowlist
                </Link>
              )}
              {steps.allowlist === 'done' && (
                <p className="mt-1 text-xs text-green-600">Users configured</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StepIcon({ status }: { status: string }) {
  if (status === 'loading') {
    return (
      <div className="mt-0.5 w-6 h-6 rounded-full border-2 border-gray-200 flex items-center justify-center">
        <div className="w-3 h-3 rounded-full bg-gray-200 animate-pulse" />
      </div>
    );
  }
  if (status === 'done') {
    return (
      <div className="mt-0.5 w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
        <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="mt-0.5 w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
        <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  }
  // pending
  return (
    <div className="mt-0.5 w-6 h-6 rounded-full border-2 border-indigo-300 flex items-center justify-center">
      <div className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
    </div>
  );
}
