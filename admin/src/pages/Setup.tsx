import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  getOnboardingStatus, submitOwnerUsername, submitBotToken,
  submitTelegramLogin, sendWelcomeMessage, completeSetup,
  listAgents, setupTelegramChannel,
} from '../api';
import type { OnboardingStatus, TelegramLoginData } from '../types';
import { setToken } from '../auth';
import Card from '../components/Card';
import ErrorBanner from '../components/ErrorBanner';

type Step = 'username' | 'create-bot' | 'bot-token' | 'set-domain' | 'telegram-login' | 'agent' | 'finish';

const ALL_STEPS: Step[] = ['username', 'create-bot', 'bot-token', 'set-domain', 'telegram-login', 'agent', 'finish'];

function stepIndex(step: Step): number {
  return ALL_STEPS.indexOf(step);
}

export default function Setup() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>('create-bot');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Step-specific state
  const [username, setUsername] = useState('');
  const [botTokenInput, setBotTokenInput] = useState('');
  const [botTokenLoading, setBotTokenLoading] = useState(false);
  const [botUsername, setBotUsername] = useState('');
  const [domainCopied, setDomainCopied] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookDone, setWebhookDone] = useState(false);
  const [welcomeSent, setWelcomeSent] = useState(false);
  const [welcomeLoading, setWelcomeLoading] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const s = await getOnboardingStatus();
      setStatus(s);

      if (s.ownerUsername) setUsername(s.ownerUsername);
      if (s.botUsername) setBotUsername(s.botUsername);

      // Determine which step to resume at
      if (s.setupCompleted) {
        navigate('/', { replace: true });
        return;
      }
      if (!s.ownerUsername) {
        // Username not set at deploy time — ask for it
        setCurrentStep('username');
      } else if (!s.hasBotToken) {
        setCurrentStep('create-bot');
      } else if (!s.telegramLoginDone) {
        setCurrentStep('set-domain');
      } else {
        const agents = await listAgents();
        if (agents.length === 0) {
          setCurrentStep('agent');
        } else {
          setCurrentStep('finish');
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  async function handleSaveUsername() {
    if (!username.trim()) return;
    setError('');
    try {
      await submitOwnerUsername(username.trim());
      setStatus(s => s ? { ...s, ownerUsername: username.trim().replace(/^@/, '') } : s);
      setCurrentStep('create-bot');
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSubmitBotToken() {
    if (!botTokenInput.trim()) return;
    setBotTokenLoading(true);
    setError('');
    try {
      const result = await submitBotToken(botTokenInput.trim());
      if (result.ok && result.botUsername) {
        setBotUsername(result.botUsername);
        setStatus(s => s ? { ...s, hasBotToken: true, botUsername: result.botUsername! } : s);
        setCurrentStep('set-domain');
      } else {
        setError(result.error ?? 'Failed to validate bot token');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBotTokenLoading(false);
    }
  }

  async function handleSetupWebhook() {
    setWebhookLoading(true);
    setError('');
    try {
      const result = await setupTelegramChannel();
      if (result.webhook.ok) {
        setWebhookDone(true);
      } else {
        setError(result.webhook.description ?? 'Failed to register webhook');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setWebhookLoading(false);
    }
  }

  async function handleSendWelcome() {
    setWelcomeLoading(true);
    setError('');
    try {
      await sendWelcomeMessage();
      setWelcomeSent(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setWelcomeLoading(false);
    }
  }

  async function handleFinish() {
    setFinishing(true);
    setError('');
    try {
      await completeSetup();
      navigate('/', { replace: true });
    } catch (e) {
      setError(String(e));
      setFinishing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Setup Your Bot</h1>
        <p className="mt-1 text-sm text-gray-500">
          Follow these steps to get your Telegram bot up and running.
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* Progress indicator */}
      <div className="flex items-center gap-1">
        {ALL_STEPS.map((step, i) => (
          <div
            key={step}
            className={`h-1.5 flex-1 rounded-full ${
              i < stepIndex(currentStep) ? 'bg-green-500' :
              i === stepIndex(currentStep) ? 'bg-indigo-500' :
              'bg-gray-200'
            }`}
          />
        ))}
      </div>

      <div className="space-y-4">

        {/* Step 0: Username (only shown if not set via env var) */}
        {currentStep === 'username' && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StepBadge n={1} />
                <h3 className="text-sm font-semibold text-gray-900">Your Telegram Username</h3>
              </div>
              <p className="text-xs text-gray-500">
                Enter your Telegram username so we can verify your identity when you log in.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="@username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveUsername()}
                />
                <button
                  onClick={handleSaveUsername}
                  disabled={!username.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* Step 1: Create Bot */}
        {currentStep === 'create-bot' && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StepBadge n={2} />
                <h3 className="text-sm font-semibold text-gray-900">Create a Telegram Bot</h3>
              </div>
              <div className="text-xs text-gray-600 space-y-2">
                <p>Open Telegram and follow these steps:</p>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  <li>
                    Search for <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline font-medium">@BotFather</a> and start a chat
                  </li>
                  <li>
                    Send <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">/newbot</code>
                  </li>
                  <li>Choose a display name for your bot (e.g. &ldquo;My AI Assistant&rdquo;)</li>
                  <li>Choose a username ending in <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">bot</code> (e.g. &ldquo;my_ai_assistant_bot&rdquo;)</li>
                  <li>BotFather will give you a <strong>bot token</strong> &mdash; copy it</li>
                </ol>
              </div>
              <button
                onClick={() => setCurrentStep('bot-token')}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
              >
                I have my bot token
              </button>
            </div>
          </Card>
        )}

        {/* Step 2: Enter Bot Token */}
        {currentStep === 'bot-token' && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StepBadge n={2} />
                <h3 className="text-sm font-semibold text-gray-900">Enter Bot Token</h3>
              </div>
              <p className="text-xs text-gray-500">
                Paste the token you received from @BotFather.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="123456789:ABCdefGhIjKlmnOPQrstUVwxyz"
                  value={botTokenInput}
                  onChange={e => setBotTokenInput(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSubmitBotToken()}
                />
                <button
                  onClick={handleSubmitBotToken}
                  disabled={botTokenLoading || !botTokenInput.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {botTokenLoading ? 'Validating...' : 'Submit'}
                </button>
              </div>
              <button
                onClick={() => setCurrentStep('create-bot')}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Back to instructions
              </button>
            </div>
          </Card>
        )}

        {/* Step 3: Set Domain */}
        {currentStep === 'set-domain' && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StepBadge n={3} />
                <h3 className="text-sm font-semibold text-gray-900">Set Bot Domain</h3>
              </div>
              <div className="text-xs text-gray-600 space-y-2">
                <p>
                  Go back to <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline font-medium">@BotFather</a> and set your bot&apos;s domain:
                </p>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  <li>
                    Send <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">/setdomain</code>
                  </li>
                  <li>Select your bot (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">@{botUsername}</code>)</li>
                  <li>Send this domain:</li>
                </ol>
                {status?.workerDomain && (
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                    <code className="flex-1 text-sm font-mono text-gray-800">{status.workerDomain}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(status.workerDomain);
                        setDomainCopied(true);
                        setTimeout(() => setDomainCopied(false), 2000);
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      {domainCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>

              {!webhookDone && (
                <button
                  onClick={handleSetupWebhook}
                  disabled={webhookLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {webhookLoading ? 'Registering webhook...' : "I've set the domain \u2014 Continue"}
                </button>
              )}
              {webhookDone && (
                <div className="space-y-2">
                  <p className="text-xs text-green-600">Webhook registered successfully.</p>
                  <button
                    onClick={() => setCurrentStep('telegram-login')}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Step 4: Telegram Login */}
        {currentStep === 'telegram-login' && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StepBadge n={4} />
                <h3 className="text-sm font-semibold text-gray-900">Login with Telegram</h3>
              </div>
              <p className="text-xs text-gray-500">
                Click the button below to verify your identity.
                {status?.ownerUsername && (
                  <> Make sure you log in as <strong>@{status.ownerUsername}</strong>.</>
                )}
              </p>
              {loginError && (
                <p className="text-xs text-red-600">{loginError}</p>
              )}
              <TelegramLoginWidget
                botUsername={botUsername}
                onAuth={async (data) => {
                  setLoginError('');
                  try {
                    const result = await submitTelegramLogin(data);
                    if (result.ok && result.sessionToken) {
                      setToken(result.sessionToken);
                      setStatus(s => s ? { ...s, telegramLoginDone: true } : s);
                      const agents = await listAgents();
                      setCurrentStep(agents.length > 0 ? 'finish' : 'agent');
                    } else {
                      setLoginError(result.error ?? 'Login failed');
                    }
                  } catch (e) {
                    setLoginError(String(e));
                  }
                }}
              />
            </div>
          </Card>
        )}

        {/* Step 5: Create Agent */}
        {currentStep === 'agent' && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StepBadge n={5} />
                <h3 className="text-sm font-semibold text-gray-900">Create an Agent</h3>
              </div>
              <p className="text-xs text-gray-500">
                Configure at least one agent with a model and system prompt.
              </p>
              <div className="flex gap-2">
                <Link
                  to="/agents"
                  className="px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50"
                >
                  Go to Agents
                </Link>
                <button
                  onClick={async () => {
                    const agents = await listAgents();
                    if (agents.length > 0) setCurrentStep('finish');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Refresh
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* Step 6: Finish */}
        {currentStep === 'finish' && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-900">All Set!</h3>
              </div>
              <p className="text-xs text-gray-500">
                Your bot is configured and ready to use.
              </p>

              {!welcomeSent && (
                <button
                  onClick={handleSendWelcome}
                  disabled={welcomeLoading}
                  className="px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {welcomeLoading ? 'Sending...' : 'Send me a welcome message on Telegram'}
                </button>
              )}
              {welcomeSent && (
                <p className="text-xs text-green-600">Welcome message sent! Check your Telegram.</p>
              )}

              <button
                onClick={handleFinish}
                disabled={finishing}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {finishing ? 'Finishing...' : 'Go to Dashboard'}
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
      <span className="text-xs font-semibold text-indigo-700">{n}</span>
    </div>
  );
}

/**
 * Dynamically loads the Telegram Login Widget script and handles the auth callback.
 */
function TelegramLoginWidget({
  botUsername,
  onAuth,
}: {
  botUsername: string;
  onAuth: (data: TelegramLoginData) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Stable ref to avoid re-embedding on every render
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  useEffect(() => {
    if (!botUsername || !containerRef.current) return;

    const callbackName = '__onTelegramAuth';
    (window as unknown as Record<string, unknown>)[callbackName] = (user: TelegramLoginData) => {
      onAuthRef.current(user);
    };

    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-onauth', `${callbackName}(user)`);
    script.setAttribute('data-request-access', 'write');
    script.async = true;

    containerRef.current.appendChild(script);

    return () => {
      delete (window as unknown as Record<string, unknown>)[callbackName];
    };
  }, [botUsername]);

  return <div ref={containerRef} />;
}
