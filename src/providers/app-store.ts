import type { ProviderAdapter } from './adapter.js';

export class AppStoreAdapter implements ProviderAdapter {
  public readonly provider = 'app-store' as const;

  isConfigured(): boolean {
    return Boolean(
      process.env.APP_STORE_CONNECT_KEY_PATH &&
      process.env.APP_STORE_CONNECT_KEY_ID &&
      process.env.APP_STORE_CONNECT_ISSUER_ID
    );
  }
}
