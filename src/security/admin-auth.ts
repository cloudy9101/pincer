export function verifyAdminAuth(request: Request, adminToken: string): boolean {
  const auth = request.headers.get('Authorization');
  if (!auth) return false;

  if (auth.startsWith('Bearer ')) {
    return auth.slice(7) === adminToken;
  }

  return false;
}
