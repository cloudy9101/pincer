import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { setToken } from '../auth';
import { getStatus, getOnboardingStatus, submitTelegramLogin } from '../api';
import type { TelegramLoginData } from '../types';

export default function Login() {
  const [token, setTokenInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [botUsername, setBotUsername] = useState('');
  const [loginMode, setLoginMode] = useState<'loading' | 'telegram' | 'token'>('loading');
  const navigate = useNavigate();

  // Determine login mode: Telegram Login if bot is configured, fallback to token
  useEffect(() => {
    getOnboardingStatus()
      .then(s => {
        if (s.botUsername) {
          setBotUsername(s.botUsername);
          setLoginMode('telegram');
        } else {
          setLoginMode('token');
        }
      })
      .catch(() => setLoginMode('token'));
  }, []);

  async function handleTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      setToken(token.trim());
      await getStatus();
      navigate('/');
    } catch {
      setError('Invalid token. Please check your admin token and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleTelegramAuth(data: TelegramLoginData) {
    setError('');
    setLoading(true);
    try {
      const result = await submitTelegramLogin(data);
      if (result.ok && result.sessionToken) {
        setToken(result.sessionToken);
        navigate('/');
      } else {
        setError(result.error ?? 'Login failed');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (loginMode === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Pincer Admin</h1>
          <p className="mt-2 text-sm text-gray-500">
            {loginMode === 'telegram' ? 'Sign in with Telegram to continue' : 'Enter your admin token to continue'}
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6 space-y-4">
          {loginMode === 'telegram' && (
            <>
              <div className="flex justify-center">
                <TelegramLoginButton botUsername={botUsername} onAuth={handleTelegramAuth} />
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-gray-400">or</span>
                </div>
              </div>
              <button
                onClick={() => setLoginMode('token')}
                className="w-full text-center text-xs text-gray-400 hover:text-gray-600"
              >
                Sign in with admin token
              </button>
            </>
          )}

          {loginMode === 'token' && (
            <form onSubmit={handleTokenSubmit} className="space-y-4">
              <div>
                <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
                  Admin Token
                </label>
                <input
                  id="token"
                  type="password"
                  value={token}
                  onChange={e => setTokenInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Bearer token"
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading || !token.trim()}
                className="w-full py-2 px-4 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
              {botUsername && (
                <button
                  type="button"
                  onClick={() => setLoginMode('telegram')}
                  className="w-full text-center text-xs text-gray-400 hover:text-gray-600"
                >
                  Sign in with Telegram instead
                </button>
              )}
            </form>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function TelegramLoginButton({
  botUsername,
  onAuth,
}: {
  botUsername: string;
  onAuth: (data: TelegramLoginData) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
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
