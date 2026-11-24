import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { asToolError, McpDomainError } from './errors.js';
import { providerSchema } from './contracts.js';
import { AppStoreAdapter } from './providers/app-store.js';
import { GooglePlayAdapter } from './providers/google-play.js';

const listAppsInput = {
  provider: providerSchema.optional().describe('Optionally filter apps by configured provider.'),
  limit: z.number().int().min(1).max(100).default(50)
};

const googleAppInput = {
  appId: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9-]*$/)
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
          limits: {
            maxItems: limit,
            truncated: config.apps.filter((app) => !provider || (provider === 'google-play' ? Boolean(app.googlePlay) : Boolean(app.appStore))).length > apps.length
          }
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
    const adapters = [new GooglePlayAdapter(environment), new AppStoreAdapter(environment)];
    const payload = { providers: adapters.map((adapter) => ({ provider: adapter.provider, credentialsConfigured: adapter.isConfigured() })) };
    return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload };
  });

  server.registerTool('mobile_developer_google_play_releases', {
    title: 'List Google Play releases for a track',
    description: 'Lists non-obsolete releases for a configured track. Google returns at most 20; this is not complete history and has no rollout percentage.',
    inputSchema: { ...googleAppInput, track: z.string().min(1).max(100) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ appId, track }) => {
    try {
      const app = loadConfig(environment).apps.find((candidate) => candidate.id === appId);
      if (!app?.googlePlay || !app.googlePlay.tracks.includes(track)) {
        throw new McpDomainError('NOT_FOUND', 'The Google Play application or track is not configured locally.');
      }
      const releases = await new GooglePlayAdapter(environment).listReleases(app.googlePlay.packageName, track);
      const payload = {
        appId, track, releases,
        metadata: {
          source: 'google-play', unit: 'count', limits: { maxItems: 20, truncated: false },
          limitations: ['Excludes obsolete releases.', 'Google returns at most 20 releases.', 'This is not complete release history and does not include rollout percentage.']
        }
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload };
    } catch (error) { return asToolError(error); }
  });

  server.registerTool('mobile_developer_google_play_reviews', {
    title: 'List recent Google Play reviews',
    description: 'Lists recent Google Play reviews with bounded token pagination. Only reviews created or modified within the last week are available; developer replies are excluded.',
    inputSchema: {
      ...googleAppInput,
      limit: z.number().int().min(1).max(100).default(50),
      cursor: z.string().min(1).max(1_024).optional(),
      translationLanguage: z.string().regex(/^[a-z]{2,3}(?:[_-][A-Z]{2})?$/).optional()
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ appId, limit, cursor, translationLanguage }) => {
    try {
      const app = loadConfig(environment).apps.find((candidate) => candidate.id === appId);
      if (!app?.googlePlay) throw new McpDomainError('NOT_FOUND', 'The Google Play application is not configured locally.');
      const result = await new GooglePlayAdapter(environment).listReviews(app.googlePlay.packageName, { limit, cursor, translationLanguage });
      const payload = {
        appId, ...result,
        metadata: {
          source: 'google-play', unit: 'count', pagination: { limit, ...(cursor ? { cursor } : {}) },
          limits: { maxItems: limit, truncated: Boolean(result.nextCursor) },
          limitations: ['Only reviews created or modified within the last week are available from this API.', 'Developer replies are not returned.']
        }
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload };
    } catch (error) { return asToolError(error); }
  });

  return server;
}
