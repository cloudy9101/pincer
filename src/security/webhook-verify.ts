export async function verifyTelegramWebhook(request: Request, secret: string): Promise<boolean> {
  const token = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  return token === secret;
}
