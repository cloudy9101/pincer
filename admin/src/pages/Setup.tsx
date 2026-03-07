import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  getOnboardingStatus, submitBotUsername, submitBotToken,
  submitTelegramLogin,
} from '../api';
import type { OnboardingStatus, TelegramLoginData } from '../types';
import { setToken } from '../auth';
import Card from '../components/Card';
import ErrorBanner from '../components/ErrorBanner';

type Step = 'create-bot' | 'set-domain' | 'telegram-login' | 'bot-token';

const ALL_STEPS: Step[] = ['create-bot', 'set-domain', 'telegram-login', 'bot-token'];

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
  const [botUsernameInput, setBotUsernameInput] = useState('');
  const [botUsernameLoading, setBotUsernameLoading] = useState(false);
  const [botUsername, setBotUsername] = useState('');
  const [domainCopied, setDomainCopied] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [botTokenInput, setBotTokenInput] = useState('');
  const [botTokenLoading, setBotTokenLoading] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const s = await getOnboardingStatus();
      setStatus(s);

      if (s.botUsername) setBotUsername(s.botUsername);

      if (s.setupCompleted) {
        navigate('/', { replace: true });
        return;
      }

      // Resume at the furthest incomplete step
      if (!s.hasBotUsername) {
        setCurrentStep('create-bot');
      } else if (!s.telegramLoginPending && !s.telegramLoginDone) {
        setCurrentStep('set-domain');
      } else {
        // Telegram login is pending or done — next step is to provide the token
        setCurrentStep('bot-token');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmitBotUsername() {
    if (!botUsernameInput.trim()) return;
    setBotUsernameLoading(true);
    setError('');
    try {
      await submitBotUsername(botUsernameInput.trim());
      const username = botUsernameInput.trim().replace(/^@/, '');
      setBotUsername(username);
      setStatus(s => s ? { ...s, hasBotUsername: true, botUsername: username } : s);
      setCurrentStep('set-domain');
    } catch (e) {
      setError(String(e));
    } finally {
      setBotUsernameLoading(false);
    }
  }

  async function handleTelegramLogin(data: TelegramLoginData) {
    setLoginError('');
    try {
      const result = await submitTelegramLogin(data);
      if (result.ok) {
        if (result.sessionToken) {
          // Bot token was already configured — login complete, go to dashboard
          setToken(result.sessionToken);
          navigate('/', { replace: true });
        } else {
          // Pending mode — login stored, move to bot-token step
          setStatus(s => s ? { ...s, telegramLoginPending: true } : s);
          setCurrentStep('bot-token');
        }
      } else {
        setLoginError(result.error ?? 'Login failed');
      }
    } catch (e) {
      setLoginError(String(e));
    }
  }

  async function handleSubmitBotToken() {
    if (!botTokenInput.trim()) return;
    setBotTokenLoading(true);
    setError('');
    try {
      const result = await submitBotToken(botTokenInput.trim());
      if (result.ok) {
        if (result.sessionToken) {
          setToken(result.sessionToken);
        }
        // Setup is complete (marked automatically by the backend)
        navigate('/', { replace: true });
      } else {
        setError(result.error ?? 'Failed to validate bot token');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBotTokenLoading(false);
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

        {/* Step 1: Create Bot + enter bot username */}
        {currentStep === 'create-bot' && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StepBadge n={1} />
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
                  <li>BotFather will confirm your bot &mdash; keep the token ready for later</li>
                </ol>
                <p className="mt-2">Enter your new bot&apos;s username below to continue:</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="@my_ai_assistant_bot"
                  value={botUsernameInput}
                  onChange={e => setBotUsernameInput(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSubmitBotUsername()}
                />
                <button
                  onClick={handleSubmitBotUsername}
                  disabled={botUsernameLoading || !botUsernameInput.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {botUsernameLoading ? 'Saving...' : 'Continue'}
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* Step 2: Set Login Domain */}
        {currentStep === 'set-domain' && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StepBadge n={2} />
                <h3 className="text-sm font-semibold text-gray-900">Set Bot Login Domain</h3>
              </div>
              <div className="text-xs text-gray-600 space-y-2">
                <p>
                  Go back to <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline font-medium">@BotFather</a> and set your bot&apos;s login domain so the Telegram Login button works:
                </p>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  <li>
                    Send <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">/setdomain</code>
                  </li>
                  <li>Select your bot {botUsername && (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">@{botUsername}</code>)}</li>
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
              <button
                onClick={() => setCurrentStep('telegram-login')}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
              >
                I&apos;ve set the domain &mdash; Continue
              </button>
            </div>
          </Card>
        )}

        {/* Step 3: Login with Telegram */}
        {currentStep === 'telegram-login' && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StepBadge n={3} />
                <h3 className="text-sm font-semibold text-gray-900">Login with Telegram</h3>
              </div>
              <p className="text-xs text-gray-500">
                Click the button below to verify your identity as the bot owner.
              </p>
              {loginError && (
                <p className="text-xs text-red-600">{loginError}</p>
              )}
              <TelegramLoginWidget
                botUsername={botUsername}
                onAuth={handleTelegramLogin}
              />
            </div>
          </Card>
        )}

        {/* Step 4: Provide Bot Token */}
        {currentStep === 'bot-token' && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StepBadge n={4} />
                <h3 className="text-sm font-semibold text-gray-900">Enter Bot Token</h3>
              </div>
              <p className="text-xs text-gray-500">
                Paste the token you received from @BotFather. Once submitted, your bot will be fully configured — the webhook will be registered and a welcome message sent to you on Telegram.
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
                  {botTokenLoading ? 'Configuring...' : 'Finish Setup'}
                </button>
              </div>
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
