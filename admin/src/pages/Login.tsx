import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { setToken } from '../auth';
import { getOnboardingStatus, submitTelegramLogin } from '../api';
import type { TelegramLoginData } from '../types';

export default function Login() {
  const [error, setError] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const navigate = useNavigate();

  // Determine login mode: Telegram Login if bot is configured, fallback to token
  useEffect(() => {
    getOnboardingStatus()
      .then(s => {
        if (s.botUsername) {
          setBotUsername(s.botUsername);
        } else {
          navigate('/setup')
        }
      })
      .catch(() => {
        navigate('/setup')
      });
  }, []);

  async function handleTelegramAuth(data: TelegramLoginData) {
    setError('');
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
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Pincer Admin</h1>
          <p className="mt-2 text-sm text-gray-500">
            Sign in with Telegram to continue
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6 space-y-4">
          <div className="flex justify-center">
            <TelegramLoginButton botUsername={botUsername} onAuth={handleTelegramAuth} />
          </div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
          </div>

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
