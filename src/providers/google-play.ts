import { GoogleAuth } from 'google-auth-library';
import { McpDomainError } from '../errors.js';
import type { ProviderAdapter } from './adapter.js';

const API_BASE_URL = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
type GoogleFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface AccessTokenProvider { getAccessToken(): Promise<string>; }

class ApplicationDefaultCredentials implements AccessTokenProvider {
  private readonly auth = new GoogleAuth({ scopes: [ANDROID_PUBLISHER_SCOPE] });
  async getAccessToken(): Promise<string> {
    const client = await this.auth.getClient();
    const token = await client.getAccessToken();
    if (!token.token) throw new McpDomainError('AUTHORIZATION', 'Google application default credentials did not return an access token.');
    return token.token;
  }
}

export interface GoogleRelease { name?: string; versionCodes: string[]; status?: string; }
export interface GoogleReview {
  reviewId: string; authorName?: string; score?: number; text?: string; originalText?: string;
  lastModified?: string; appVersionCode?: string; appVersionName?: string; reviewerLanguage?: string;
}

interface GoogleReleaseResponse {
  releases?: Array<{
    releaseName?: string;
    track?: string;
    activeArtifacts?: Array<{ versionCode?: string }>;
    releaseLifecycleState?: string;
  }>;
}
interface GoogleReviewResponse {
  reviews?: Array<{ reviewId?: string; authorName?: string; comments?: Array<{ userComment?: {
    text?: string; originalText?: string; starRating?: number; lastModified?: { seconds?: string; nanos?: number };
    appVersionCode?: number | string; appVersionName?: string; reviewerLanguage?: string;
  } }> }>;
  tokenPagination?: { nextPageToken?: string };
}

export class GooglePlayAdapter implements ProviderAdapter {
  public readonly provider = 'google-play' as const;

  constructor(
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly tokenProvider: AccessTokenProvider = new ApplicationDefaultCredentials(),
    private readonly request: GoogleFetch = fetch
  ) {}

  isConfigured(): boolean {
    return Boolean(this.environment.GOOGLE_APPLICATION_CREDENTIALS);
  }

  async listReleases(packageName: string, track: string): Promise<GoogleRelease[]> {
    const response = await this.getJson<GoogleReleaseResponse>(`/applications/${encodeURIComponent(packageName)}/tracks/${encodeURIComponent(track)}/releases`);
    return (response.releases ?? []).map((release) => ({
      ...(release.releaseName ? { name: release.releaseName } : {}),
      versionCodes: (release.activeArtifacts ?? []).flatMap((artifact) => artifact.versionCode ? [artifact.versionCode] : []),
      ...(release.releaseLifecycleState ? { status: release.releaseLifecycleState } : {})
    }));
  }

  async listReviews(packageName: string, options: { limit: number; cursor?: string; translationLanguage?: string }): Promise<{ reviews: GoogleReview[]; nextCursor?: string }> {
    const parameters = new URLSearchParams({ maxResults: String(options.limit) });
    if (options.cursor) parameters.set('token', options.cursor);
    if (options.translationLanguage) parameters.set('translationLanguage', options.translationLanguage);
    const response = await this.getJson<GoogleReviewResponse>(`/applications/${encodeURIComponent(packageName)}/reviews?${parameters}`);
    const reviews = (response.reviews ?? []).flatMap((review) => {
      const userComment = review.comments?.find((comment) => comment.userComment)?.userComment;
      if (!review.reviewId || !userComment) return [];
      const lastModified = toIsoDate(userComment.lastModified);
      return [{
        reviewId: review.reviewId, ...(review.authorName ? { authorName: review.authorName } : {}),
        ...(userComment.starRating !== undefined ? { score: userComment.starRating } : {}),
        ...(userComment.text ? { text: userComment.text } : {}), ...(userComment.originalText ? { originalText: userComment.originalText } : {}),
        ...(lastModified ? { lastModified } : {}), ...(userComment.appVersionCode !== undefined ? { appVersionCode: String(userComment.appVersionCode) } : {}),
        ...(userComment.appVersionName ? { appVersionName: userComment.appVersionName } : {}),
        ...(userComment.reviewerLanguage ? { reviewerLanguage: userComment.reviewerLanguage } : {})
      }];
    });
    return { reviews, ...(response.tokenPagination?.nextPageToken ? { nextCursor: response.tokenPagination.nextPageToken } : {}) };
  }

  private async getJson<T>(path: string): Promise<T> {
    let token: string;
    try { token = await this.tokenProvider.getAccessToken(); }
    catch (error) {
      if (error instanceof McpDomainError) throw error;
      throw new McpDomainError('AUTHORIZATION', 'Google application default credentials could not be used.', error);
    }
    let response: Response;
    try { response = await this.request(`${API_BASE_URL}${path}`, { method: 'GET', headers: { authorization: `Bearer ${token}` } }); }
    catch (error) { throw new McpDomainError('PROVIDER', 'The Google Play request could not be completed.', error); }
    if (!response.ok) throw googlePlayError(response.status);
    try { return await response.json() as T; }
    catch (error) { throw new McpDomainError('PROVIDER', 'Google Play returned an invalid response.', error); }
  }
}

function toIsoDate(timestamp?: { seconds?: string; nanos?: number }): string | undefined {
  if (!timestamp?.seconds) return undefined;
  const date = new Date(Number(timestamp.seconds) * 1_000 + Math.floor((timestamp.nanos ?? 0) / 1_000_000));
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function googlePlayError(status: number): McpDomainError {
  if (status === 401 || status === 403) return new McpDomainError('AUTHORIZATION', 'Google Play credentials are missing, invalid, or lack the required permission.');
  if (status === 404) return new McpDomainError('NOT_FOUND', 'The configured Google Play application or track was not found.');
  if (status === 429) return new McpDomainError('PROVIDER', 'Google Play rate limited the request.');
  return new McpDomainError('PROVIDER', 'Google Play could not complete the request.');
}
