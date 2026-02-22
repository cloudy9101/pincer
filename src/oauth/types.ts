export interface OAuthProviderConfig {
  id: string;
  authUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scopes: string[];
  clientIdKey: string;
  clientSecretKey: string;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  token_type: string;
  scope?: string;
}

export interface OAuthConnection {
  id: string;
  userId: string;
  provider: string;
  tokens: OAuthTokens;
  scopes: string;
  providerUserId?: string;
  providerEmail?: string;
  createdAt: number;
  updatedAt: number;
}
