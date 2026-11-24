import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { asToolError } from './errors.js';
import { providerSchema } from './contracts.js';
import { AppStoreAdapter } from './providers/app-store.js';
import { GooglePlayAdapter } from './providers/google-play.js';

const listAppsInput = {
  provider: providerSchema.optional().describe('Optionally filter apps by configured provider.'),
  limit: z.number().int().min(1).max(100).default(50)
};

export function createServer(environment: NodeJS.ProcessEnv = process.env): McpServer {
  const server = new McpServer({ name: 'mobile-developer-mcp', version: '0.1.0' }, {
    maxToolInputElements: 100
  });

  server.registerTool('mobile_developer_list_apps', {
    title: 'List configured mobile apps',
    description: 'Lists local app identifiers and non-secret provider configuration. This is read-only.',
    inputSchema: listAppsInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ provider, limit }) => {
    try {
      const config = loadConfig(environment);
      const apps = config.apps
        .filter((app) => !provider || (provider === 'google-play' ? Boolean(app.googlePlay) : Boolean(app.appStore)))
        .slice(0, limit)
        .map((app) => ({
          id: app.id,
          googlePlay: app.googlePlay && { packageName: app.googlePlay.packageName, tracks: app.googlePlay.tracks },
          appStore: app.appStore && { appId: app.appStore.appId }
        }));
      const payload = {
        apps,
        metadata: {
          source: 'local-configuration',
          limits: { maxItems: limit, truncated: config.apps.length > apps.length }
        }
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload };
    } catch (error) {
      return asToolError(error);
    }
  });

  server.registerTool('mobile_developer_provider_status', {
    title: 'Check provider credential readiness',
    description: 'Reports whether each provider has local credentials without exposing their values.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async () => {
    const adapters = [new GooglePlayAdapter(), new AppStoreAdapter()];
    const payload = { providers: adapters.map((adapter) => ({ provider: adapter.provider, credentialsConfigured: adapter.isConfigured() })) };
    return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload };
  });

  return server;
}
