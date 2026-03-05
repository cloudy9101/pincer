import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { getTelegramWebhook, setupTelegramChannel, listAgents, listAllowlist, completeSetup } from '../api';
import Card from '../components/Card';
import ErrorBanner from '../components/ErrorBanner';

interface StepState {
  webhook: 'loading' | 'pending' | 'done' | 'error';
  agent: 'loading' | 'pending' | 'done';
  allowlist: 'loading' | 'pending' | 'done';
}

export default function Setup() {
  const navigate = useNavigate();
  const [steps, setSteps] = useState<StepState>({ webhook: 'loading', agent: 'loading', allowlist: 'loading' });
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookError, setWebhookError] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const [whInfo, agents, allowlist] = await Promise.all([
        getTelegramWebhook(),
        listAgents(),
        listAllowlist(),
      ]);

      const hasWebhook = whInfo.ok && whInfo.result.url !== '';
      setWebhookUrl(whInfo.ok ? whInfo.result.url : '');

      setSteps({
        webhook: hasWebhook ? 'done' : 'pending',
        agent: agents.length > 0 ? 'done' : 'pending',
        allowlist: allowlist.length > 0 ? 'done' : 'pending',
      });
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSetupWebhook() {
    setSetupLoading(true);
    setWebhookError('');
    try {
      const result = await setupTelegramChannel();
      if (result.webhook.ok) {
        setSteps(s => ({ ...s, webhook: 'done' }));
        // Reload to get the new URL
        const info = await getTelegramWebhook();
        if (info.ok) setWebhookUrl(info.result.url);
      } else {
        setWebhookError(result.webhook.description ?? 'Failed to register webhook');
        setSteps(s => ({ ...s, webhook: 'error' }));
      }
    } catch (e) {
      setWebhookError(String(e));
      setSteps(s => ({ ...s, webhook: 'error' }));
    } finally {
      setSetupLoading(false);
    }
  }

  const allDone = steps.webhook === 'done' && steps.agent === 'done' && steps.allowlist === 'done';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Setup</h1>
        <p className="mt-1 text-sm text-gray-500">
          Complete these steps to get your bot up and running.
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {allDone && (
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
        {/* Step 1: Telegram Webhook */}
        <Card>
          <div className="flex items-start gap-3">
            <StepIcon status={steps.webhook} />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">Connect Telegram</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Register the webhook so Telegram sends messages to this worker.
              </p>

              {steps.webhook === 'done' && webhookUrl && (
                <p className="mt-2 text-xs text-gray-400 truncate" title={webhookUrl}>
                  {webhookUrl}
                </p>
              )}

              {webhookError && (
                <p className="mt-2 text-xs text-red-600">{webhookError}</p>
              )}

              {steps.webhook !== 'done' && (
                <button
                  onClick={handleSetupWebhook}
                  disabled={setupLoading}
                  className="mt-3 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {setupLoading ? 'Registering...' : 'Register Webhook'}
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* Step 2: Agent */}
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

        {/* Step 3: Allowlist */}
        <Card>
          <div className="flex items-start gap-3">
            <StepIcon status={steps.allowlist} />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">Add Users</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Add at least one user to the allowlist, or set TELEGRAM_OWNER_ID to auto-approve on first message.
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
