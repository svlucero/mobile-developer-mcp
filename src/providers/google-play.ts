import type { ProviderAdapter } from './adapter.js';

export class GooglePlayAdapter implements ProviderAdapter {
  public readonly provider = 'google-play' as const;

  isConfigured(): boolean {
    return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
}
