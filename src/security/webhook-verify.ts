import { hexToBytes } from '../utils/crypto.ts';

export async function verifyTelegramWebhook(request: Request, secret: string): Promise<boolean> {
  const token = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  return token === secret;
}

export async function verifyDiscordWebhook(request: Request, publicKey: string): Promise<boolean> {
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  if (!signature || !timestamp) return false;

  const body = await request.clone().text();
  const message = new TextEncoder().encode(timestamp + body);

  const sigBytes = hexToBytes(signature);
  const keyBytes = hexToBytes(publicKey);

  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'Ed25519', namedCurve: 'Ed25519' }, false, [
    'verify',
  ]);

  return crypto.subtle.verify('Ed25519', cryptoKey, sigBytes, message);
}
