import type { ProviderAdapter } from './adapter.js';

export class AppStoreAdapter implements ProviderAdapter {
  public readonly provider = 'app-store' as const;

  constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {}

  isConfigured(): boolean {
    return Boolean(
      this.environment.APP_STORE_CONNECT_KEY_PATH &&
      this.environment.APP_STORE_CONNECT_KEY_ID &&
      this.environment.APP_STORE_CONNECT_ISSUER_ID
    );
  }
}
