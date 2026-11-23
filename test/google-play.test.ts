import { describe, expect, it } from 'vitest';
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
});
