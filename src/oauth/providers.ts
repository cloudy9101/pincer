import type { OAuthProviderConfig } from './types.ts';

const PROVIDERS: Record<string, OAuthProviderConfig> = {
  google: {
    id: 'google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userinfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: ['openid', 'email', 'profile'],
    clientIdKey: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretKey: 'GOOGLE_OAUTH_CLIENT_SECRET',
  },
  github: {
    id: 'github',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userinfoUrl: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email'],
    clientIdKey: 'GITHUB_OAUTH_CLIENT_ID',
    clientSecretKey: 'GITHUB_OAUTH_CLIENT_SECRET',
  },
  microsoft: {
    id: 'microsoft',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userinfoUrl: 'https://graph.microsoft.com/v1.0/me',
    scopes: ['openid', 'email', 'profile', 'User.Read', 'offline_access'],
    clientIdKey: 'MICROSOFT_OAUTH_CLIENT_ID',
    clientSecretKey: 'MICROSOFT_OAUTH_CLIENT_SECRET',
  },
};

export function getProvider(name: string): OAuthProviderConfig | null {
  return PROVIDERS[name] ?? null;
}

export function listProviders(): string[] {
  return Object.keys(PROVIDERS);
}
