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
const appleAppInput = { ...googleAppInput };
const applePageInput = { ...appleAppInput, limit: z.number().int().min(1).max(100).default(50), cursor: z.string().min(1).max(1_024).optional() };

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

  server.registerTool('mobile_developer_google_play_vital_issues', {
    title: 'List Android vitals crash and ANR issues',
    description: 'Searches grouped Android vitals issues through the read-only Play Developer Reporting API. Times must be UTC hour-aligned; pagination is bounded.',
    inputSchema: {
      ...googleAppInput,
      start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }),
      limit: z.number().int().min(1).max(100).default(50), cursor: z.string().min(1).max(1_024).optional(),
      versionCodes: z.array(z.string().regex(/^\d+$/)).min(1).max(20).optional(),
      types: z.array(z.enum(['CRASH', 'ANR', 'NON_FATAL'])).min(1).max(3).optional()
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ appId, start, end, limit, cursor, versionCodes, types }) => {
    try {
      const app = loadConfig(environment).apps.find((candidate) => candidate.id === appId);
      if (!app?.googlePlay) throw new McpDomainError('NOT_FOUND', 'The Google Play application is not configured locally.');
      const result = await new GooglePlayAdapter(environment).listVitalIssues(app.googlePlay.packageName, { start, end, limit, cursor, versionCodes, types });
      const payload = { appId, ...result, metadata: { source: 'google-play-developer-reporting', period: { start, end }, unit: 'count', pagination: { limit, ...(cursor ? { cursor } : {}) }, limits: { maxItems: limit, truncated: Boolean(result.nextCursor) }, limitations: ['Only issues with reports in the requested interval are returned.', 'Live credentials and Reporting API access are required; no live account was used for fixture validation.'] } };
      return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload };
    } catch (error) { return asToolError(error); }
  });

  server.registerTool('mobile_developer_google_play_installation_metrics', {
    title: 'Read Google Play installation statistics',
    description: 'Reads existing installation-statistics CSV objects from the configured private Google Cloud Storage bucket. It never writes objects or sums daily stock observations.',
    inputSchema: { ...googleAppInput, start: z.string().date(), end: z.string().date(), dimension: z.string().regex(/^[a-z0-9_]{1,80}$/).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ appId, start, end, dimension }) => {
    try {
      const app = loadConfig(environment).apps.find((candidate) => candidate.id === appId);
      if (!app?.googlePlay?.reportingBucket) throw new McpDomainError('NOT_FOUND', 'The Google Play application or its private statistics bucket is not configured locally.');
      const result = await new GooglePlayAdapter(environment).readInstallationMetrics(app.googlePlay.reportingBucket, app.googlePlay.packageName, { start, end, dimension });
      const payload = { appId, ...result, metadata: { source: 'google-play-statistics-gcs', period: { start, end }, unit: 'count', dimensions: dimension ? [dimension] : [], limits: { maxItems: 13, truncated: false }, limitations: ['Each metric is an unaggregated daily observation with its exact report-column name.', 'Stock metrics are never summed as new installations.', 'Missing monthly objects produce no metrics; they are not represented as zero.', 'Live bucket permissions and report availability were not validated.'] } };
      return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload };
    } catch (error) { return asToolError(error); }
  });

  server.registerTool('mobile_developer_app_store_versions', {
    title: 'List App Store versions and release states',
    description: 'Lists configured App Store versions with bounded pagination. This is a read-only App Store Connect query.',
    inputSchema: { ...applePageInput, platform: z.string().min(1).max(30).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ appId, limit, cursor, platform }) => {
    try { const app = loadConfig(environment).apps.find((candidate) => candidate.id === appId); if (!app?.appStore) throw new McpDomainError('NOT_FOUND', 'The App Store application is not configured locally.'); const result = await new AppStoreAdapter(environment).listVersions(app.appStore.appId, { limit, cursor, platform }); const payload = { appId, ...result, metadata: { source: 'app-store-connect', unit: 'count', pagination: { limit, ...(cursor ? { cursor } : {}) }, limits: { maxItems: limit, truncated: Boolean(result.nextCursor) } } }; return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload }; } catch (error) { return asToolError(error); }
  });

  server.registerTool('mobile_developer_app_store_builds', {
    title: 'List App Store builds and processing states',
    description: 'Lists configured App Store builds with bounded pagination. This is a read-only App Store Connect query.',
    inputSchema: { ...applePageInput, version: z.string().min(1).max(100).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ appId, limit, cursor, version }) => {
    try { const app = loadConfig(environment).apps.find((candidate) => candidate.id === appId); if (!app?.appStore) throw new McpDomainError('NOT_FOUND', 'The App Store application is not configured locally.'); const result = await new AppStoreAdapter(environment).listBuilds(app.appStore.appId, { limit, cursor, version }); const payload = { appId, ...result, metadata: { source: 'app-store-connect', unit: 'count', pagination: { limit, ...(cursor ? { cursor } : {}) }, limits: { maxItems: limit, truncated: Boolean(result.nextCursor) } } }; return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload }; } catch (error) { return asToolError(error); }
  });

  server.registerTool('mobile_developer_app_store_reviews', {
    title: 'List App Store customer reviews',
    description: 'Lists App Store customer reviews with territory filter and bounded pagination. Developer responses are not returned.',
    inputSchema: { ...applePageInput, territory: z.string().regex(/^[A-Z]{2,3}$/).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ appId, limit, cursor, territory }) => {
    try { const app = loadConfig(environment).apps.find((candidate) => candidate.id === appId); if (!app?.appStore) throw new McpDomainError('NOT_FOUND', 'The App Store application is not configured locally.'); const result = await new AppStoreAdapter(environment).listReviews(app.appStore.appId, { limit, cursor, territory }); const payload = { appId, ...result, metadata: { source: 'app-store-connect', unit: 'count', pagination: { limit, ...(cursor ? { cursor } : {}) }, limits: { maxItems: limit, truncated: Boolean(result.nextCursor) }, limitations: ['Developer responses are not returned.'] } }; return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload }; } catch (error) { return asToolError(error); }
  });

  server.registerTool('mobile_developer_app_store_diagnostic_signatures', {
    title: 'List App Store diagnostic signatures for a build',
    description: 'Lists diagnostic signatures available for one build. They do not constitute a complete list of production crashes.',
    inputSchema: { buildId: z.string().min(1).max(100), limit: z.number().int().min(1).max(100).default(50), cursor: z.string().min(1).max(1_024).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ buildId, limit, cursor }) => {
    try { const result = await new AppStoreAdapter(environment).listDiagnosticSignatures(buildId, { limit, cursor }); const payload = { buildId, ...result, metadata: { source: 'app-store-connect', unit: 'count', pagination: { limit, ...(cursor ? { cursor } : {}) }, limits: { maxItems: limit, truncated: Boolean(result.nextCursor) }, limitations: ['Diagnostic signatures are only the diagnostics App Store Connect makes available for this build.', 'They are not a complete inventory of all production crashes.'] } }; return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload }; } catch (error) { return asToolError(error); }
  });

  server.registerTool('mobile_developer_app_store_sales_downloads', {
    title: 'Read App Store Sales and Trends downloads',
    description: 'Reads one existing daily Sales and Trends report. It counts only app product rows, excludes in-app purchases, and distinguishes redownloads only when the report supplies an order type.',
    inputSchema: { ...appleAppInput, date: z.string().date() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ appId, date }) => {
    try { const app = loadConfig(environment).apps.find((candidate) => candidate.id === appId); if (!app?.appStore?.vendorNumber) throw new McpDomainError('NOT_FOUND', 'The App Store application or its Sales and Trends vendor number is not configured locally.'); const result = await new AppStoreAdapter(environment).readSalesDownloads(app.appStore.vendorNumber, date); const payload = { appId, ...result, metadata: { source: 'app-store-sales-and-trends', period: { start: date, end: date }, unit: 'count', dimensions: ['Sales report dimensions'], limits: { maxItems: 5_000, truncated: false }, limitations: ['Sales report publication can be delayed.', 'Missing reports are not represented as zero.', 'Initial downloads and redownloads are separate only when an Order Type field is present.'] } }; return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload }; } catch (error) { return asToolError(error); }
  });

  server.registerTool('mobile_developer_app_store_analytics_existing', {
    title: 'Inspect existing App Store Analytics reports',
    description: 'Lists existing Analytics report requests, reports, instances, and segment identifiers. It never creates or resumes report generation and never exposes download URLs.',
    inputSchema: { ...applePageInput, instanceId: z.string().min(1).max(100).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ appId, limit, cursor, instanceId }) => {
    try { const app = loadConfig(environment).apps.find((candidate) => candidate.id === appId); if (!app?.appStore) throw new McpDomainError('NOT_FOUND', 'The App Store application is not configured locally.'); const adapter = new AppStoreAdapter(environment); const result = instanceId ? await adapter.listAnalyticsSegments(instanceId, limit) : await adapter.listAnalytics(app.appStore.appId, { limit, cursor }); const payload = { appId, ...result, metadata: { source: 'app-store-connect-analytics', unit: 'count', limits: { maxItems: limit, truncated: 'nextCursor' in result && Boolean(result.nextCursor) }, limitations: ['Only existing report resources are read; no report generation is created or resumed.', 'If no instances or segments appear, prepare the report manually in App Store Connect or verify availability and permissions.', 'Signed report download URLs are never returned.'] } }; return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload }; } catch (error) { return asToolError(error); }
  });

  return server;
}
