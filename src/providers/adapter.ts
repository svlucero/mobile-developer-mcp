import type { Provider } from '../contracts.js';

export interface ProviderAdapter {
  readonly provider: Provider;
  isConfigured(): boolean;
}
