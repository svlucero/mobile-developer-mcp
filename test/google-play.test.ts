import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { McpDomainError } from '../src/errors.js';
import { GooglePlayAdapter, type AccessTokenProvider } from '../src/providers/google-play.js';

const tokenProvider: AccessTokenProvider = { getAccessToken: async () => 'fixture-token' };

function fixtureAdapter(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const request = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return { adapter: new GooglePlayAdapter({}, tokenProvider, request), calls };
}

describe('Google Play read-only adapter', () => {
  it('lists release summaries through the direct GET route without an edit', async () => {
    const { adapter, calls } = fixtureAdapter({ releases: [
      { releaseName: '2.0', track: 'production', activeArtifacts: [{ versionCode: '200' }, { versionCode: '201' }], releaseLifecycleState: 'inReview' },
      { track: 'production', activeArtifacts: [{ versionCode: '199' }], releaseLifecycleState: 'approved' },
      { releaseName: 'blocked', track: 'production', activeArtifacts: [], releaseLifecycleState: 'notApproved' },
      { releaseName: 'published', track: 'production', activeArtifacts: [{ versionCode: '202' }], releaseLifecycleState: 'available' }
    ] });

    await expect(adapter.listReleases('com.example.app', 'production')).resolves.toEqual([
      { name: '2.0', versionCodes: ['200', '201'], status: 'inReview' },
      { versionCodes: ['199'], status: 'approved' },
      { name: 'blocked', versionCodes: [], status: 'notApproved' },
      { name: 'published', versionCodes: ['202'], status: 'available' }
    ]);
    expect(calls).toEqual([expect.objectContaining({
      url: 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example.app/tracks/production/releases',
      init: expect.objectContaining({ method: 'GET', headers: { authorization: 'Bearer fixture-token' } })
    })]);
  });

  it('keeps optional user-review fields and excludes developer replies', async () => {
    const { adapter, calls } = fixtureAdapter({
      reviews: [{ reviewId: 'review-1', authorName: 'Ada', comments: [
        { userComment: { text: 'Great', originalText: 'Excelente', starRating: 5, lastModified: { seconds: '1700000000', nanos: 123000000 }, appVersionCode: 42, appVersionName: '4.2', reviewerLanguage: 'es' } },
        { developerComment: { text: 'must never be exposed' } }
      ] }],
      tokenPagination: { nextPageToken: 'next-page' }
    });

    await expect(adapter.listReviews('com.example.app', { limit: 25, cursor: 'previous-page', translationLanguage: 'en_US' })).resolves.toEqual({
      reviews: [{ reviewId: 'review-1', authorName: 'Ada', score: 5, text: 'Great', originalText: 'Excelente', lastModified: '2023-11-14T22:13:20.123Z', appVersionCode: '42', appVersionName: '4.2', reviewerLanguage: 'es' }],
      nextCursor: 'next-page'
    });
    expect(calls[0]?.url).toBe('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example.app/reviews?maxResults=25&token=previous-page&translationLanguage=en_US');
    expect(calls[0]?.init.method).toBe('GET');
  });

  it.each([[401, 'AUTHORIZATION'], [403, 'AUTHORIZATION'], [429, 'PROVIDER'], [500, 'PROVIDER']])(
    'maps Google Play HTTP %s to %s without treating it as an empty result',
    async (status, code) => {
      const { adapter } = fixtureAdapter({}, status);
      await expect(adapter.listReviews('com.example.app', { limit: 1 })).rejects.toMatchObject<McpDomainError>({ code });
    }
  );

  it('uses the injected environment for credential status', () => {
    expect(new GooglePlayAdapter({ GOOGLE_APPLICATION_CREDENTIALS: '/private/account.json' }, tokenProvider).isConfigured()).toBe(true);
    expect(new GooglePlayAdapter({}, tokenProvider).isConfigured()).toBe(false);
  });

  it('searches vital issues with UTC hourly range, safe filters, and bounded pagination', async () => {
    const { adapter, calls } = fixtureAdapter({ errorIssues: [{ name: 'apps/com.example.app/errorIssues/abc', errorIssueType: 'CRASH', errorReportCount: '7', distinctUsers: '5', issueUri: 'https://play.example/abc' }], nextPageToken: 'next' });
    await expect(adapter.listVitalIssues('com.example.app', { start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z', limit: 50, cursor: 'previous', versionCodes: ['42', '43'], types: ['CRASH', 'ANR'] })).resolves.toEqual({ issues: [{ name: 'apps/com.example.app/errorIssues/abc', issueType: 'CRASH', errorReportCount: '7', distinctUsers: '5', issueUri: 'https://play.example/abc' }], nextCursor: 'next' });
    expect(calls[0]?.url).toContain('https://playdeveloperreporting.googleapis.com/v1beta1/apps/com.example.app/errorIssues:search?');
    expect(calls[0]?.url).toContain('interval.startTime=2026-01-01T00%3A00%3A00.000Z');
    expect(calls[0]?.url).toContain('pageToken=previous');
    expect(calls[0]?.url).toContain('filter=versionCode+%3D+42+OR+versionCode+%3D+43+AND+errorIssueType+%3D+CRASH+OR+errorIssueType+%3D+ANR');
    expect(calls[0]?.init.method).toBe('GET');
    await expect(adapter.listVitalIssues('com.example.app', { start: '2026-01-01T00:01:00Z', end: '2026-01-02T00:00:00Z', limit: 1 })).rejects.toMatchObject({ code: 'CONFIGURATION' });
  });

  it('reads gzip UTF-16 installation reports as daily observations without summing stocks', async () => {
    const csv = '\uFEFFDate,Package Name,Country,Daily Device Installs,Daily User Installs,Total User Installs\r\n2026-01-03,com.example.app,AR,10,8,100\r\n2026-01-04,com.example.app,AR,11,9,109\r\n';
    const bytes = gzipSync(Buffer.from(csv, 'utf16le'));
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const adapter = new GooglePlayAdapter({}, tokenProvider, async (url, init) => {
      calls.push({ url, init });
      return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } });
    });
    const result = await adapter.readInstallationMetrics('pubsite_prod_123', 'com.example.app', { start: '2026-01-03', end: '2026-01-04', dimension: 'country' });
    expect(result.objectsRead).toBe(1);
    expect(result.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Daily Device Installs', value: 10, entity: 'devices', temporalType: 'flow', period: { start: '2026-01-03', end: '2026-01-03' }, dimensions: { 'Package Name': 'com.example.app', Country: 'AR' } }),
      expect.objectContaining({ name: 'Daily User Installs', value: 9, entity: 'users', temporalType: 'flow' }),
      expect.objectContaining({ name: 'Total User Installs', value: 109, entity: 'users', temporalType: 'stock' })
    ]));
    expect(calls[0]?.url).toContain('/b/pubsite_prod_123/o/stats%2Finstalls%2Finstalls_com.example.app_202601_country.csv?alt=media');
    expect(calls[0]?.init.method).toBe('GET');
  });

  it('does not replace missing reports with zero and rejects oversized downloads', async () => {
    const missing = new GooglePlayAdapter({}, tokenProvider, async () => new Response('', { status: 404 }));
    await expect(missing.readInstallationMetrics('bucket', 'com.example.app', { start: '2026-01-01', end: '2026-01-01' })).resolves.toEqual({ metrics: [], objectsRead: 0 });
    const oversized = new GooglePlayAdapter({}, tokenProvider, async () => new Response('', { status: 200, headers: { 'content-length': String(6 * 1024 * 1024) } }));
    await expect(oversized.readInstallationMetrics('bucket', 'com.example.app', { start: '2026-01-01', end: '2026-01-01' })).rejects.toMatchObject({ code: 'PROVIDER' });
    await expect(missing.readInstallationMetrics('bucket', 'com.example.app', { start: '2025-01-01', end: '2026-03-01' })).rejects.toMatchObject({ code: 'CONFIGURATION' });
  });
});
