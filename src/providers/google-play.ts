import { gunzipSync } from 'node:zlib';
import { GoogleAuth } from 'google-auth-library';
import { McpDomainError } from '../errors.js';
import type { ProviderAdapter } from './adapter.js';

const API_BASE_URL = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const PLAY_DEVELOPER_REPORTING_SCOPE = 'https://www.googleapis.com/auth/playdeveloperreporting';
const CLOUD_STORAGE_READ_ONLY_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only';
const MAX_REPORT_BYTES = 5 * 1024 * 1024;
type GoogleFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface AccessTokenProvider { getAccessToken(): Promise<string>; }

class ApplicationDefaultCredentials implements AccessTokenProvider {
  private readonly auth: GoogleAuth;
  constructor(scope = ANDROID_PUBLISHER_SCOPE) { this.auth = new GoogleAuth({ scopes: [scope] }); }
  async getAccessToken(): Promise<string> {
    const client = await this.auth.getClient();
    const token = await client.getAccessToken();
    if (!token.token) throw new McpDomainError('AUTHORIZATION', 'Google application default credentials did not return an access token.');
    return token.token;
  }
}

class EnvironmentAccessToken implements AccessTokenProvider {
  constructor(private readonly token: string) {}
  async getAccessToken(): Promise<string> { return this.token; }
}

export interface GoogleRelease { name?: string; versionCodes: string[]; status?: string; }
export interface GoogleReview {
  reviewId: string; authorName?: string; score?: number; text?: string; originalText?: string;
  lastModified?: string; appVersionCode?: string; appVersionName?: string; reviewerLanguage?: string;
}
export interface GoogleVitalIssue {
  name?: string; issueType?: string; errorReportCount?: string; distinctUsers?: string; issueUri?: string;
}
export interface GoogleInstallMetric {
  name: string; value: number; unit: 'count'; entity: 'events' | 'devices' | 'users'; temporalType: 'flow' | 'stock';
  source: 'google-play-statistics-gcs'; period: { start: string; end: string }; dimensions: Record<string, string>;
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
interface GoogleVitalIssuesResponse { errorIssues?: Array<{ name?: string; errorIssueType?: string; errorReportCount?: string; distinctUsers?: string; issueUri?: string }>; nextPageToken?: string; }

export class GooglePlayAdapter implements ProviderAdapter {
  public readonly provider = 'google-play' as const;

  constructor(
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly tokenProvider?: AccessTokenProvider,
    private readonly request: GoogleFetch = fetch
  ) {}

  isConfigured(): boolean {
    return Boolean(this.environment.GOOGLE_APPLICATION_CREDENTIALS || this.environment.GOOGLE_OAUTH_ACCESS_TOKEN);
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

  async listVitalIssues(packageName: string, options: { start: string; end: string; limit: number; cursor?: string; versionCodes?: string[]; types?: Array<'CRASH' | 'ANR' | 'NON_FATAL'> }): Promise<{ issues: GoogleVitalIssue[]; nextCursor?: string }> {
    if (options.start > options.end) throw new McpDomainError('CONFIGURATION', 'Android vitals start must be on or before end.');
    const parameters = new URLSearchParams({
      'interval.startTime': hourUtc(options.start), 'interval.endTime': hourUtc(options.end), pageSize: String(options.limit), sampleErrorReportLimit: '0'
    });
    if (options.cursor) parameters.set('pageToken', options.cursor);
    const clauses = [
      ...(options.versionCodes?.length ? [options.versionCodes.map((value) => `versionCode = ${value}`).join(' OR ')] : []),
      ...(options.types?.length ? [options.types.map((value) => `errorIssueType = ${value}`).join(' OR ')] : [])
    ];
    if (clauses.length) parameters.set('filter', clauses.join(' AND '));
    const response = await this.getJson<GoogleVitalIssuesResponse>(`/v1beta1/apps/${encodeURIComponent(packageName)}/errorIssues:search?${parameters}`, PLAY_DEVELOPER_REPORTING_SCOPE, 'https://playdeveloperreporting.googleapis.com');
    return {
      issues: (response.errorIssues ?? []).map((issue) => ({ ...(issue.name ? { name: issue.name } : {}), ...(issue.errorIssueType ? { issueType: issue.errorIssueType } : {}), ...(issue.errorReportCount ? { errorReportCount: issue.errorReportCount } : {}), ...(issue.distinctUsers ? { distinctUsers: issue.distinctUsers } : {}), ...(issue.issueUri ? { issueUri: issue.issueUri } : {}) })),
      ...(response.nextPageToken ? { nextCursor: response.nextPageToken } : {})
    };
  }

  async readInstallationMetrics(bucket: string, packageName: string, options: { start: string; end: string; dimension?: string }): Promise<{ metrics: GoogleInstallMetric[]; objectsRead: number }> {
    const months = monthsForPeriod(options.start, options.end);
    if (months.length > 13) throw new McpDomainError('CONFIGURATION', 'Installation report periods are limited to 13 monthly objects.');
    const metrics: GoogleInstallMetric[] = []; let objectsRead = 0;
    for (const month of months) {
      const suffix = options.dimension ? `_${options.dimension}` : '';
      const objectName = `stats/installs/installs_${packageName}_${month}${suffix}.csv`;
      let bytes: Uint8Array;
      try { bytes = await this.getBytes(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?alt=media`, CLOUD_STORAGE_READ_ONLY_SCOPE); }
      catch (error) { if (error instanceof McpDomainError && error.code === 'NOT_FOUND') continue; throw error; }
      objectsRead += 1;
      metrics.push(...parseInstallationCsv(bytes, options));
    }
    return { metrics, objectsRead };
  }

  private async getJson<T>(path: string, scope = ANDROID_PUBLISHER_SCOPE, baseUrl = API_BASE_URL): Promise<T> {
    const response = await this.getResponse(`${baseUrl}${path}`, scope);
    try { return await response.json() as T; }
    catch (error) { throw new McpDomainError('PROVIDER', 'Google Play returned an invalid response.', error); }
  }

  private async getBytes(url: string, scope: string): Promise<Uint8Array> {
    const response = await this.getResponse(url, scope);
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_REPORT_BYTES) throw new McpDomainError('PROVIDER', `Installation report exceeds the ${MAX_REPORT_BYTES} byte download limit.`);
    const reader = response.body?.getReader();
    if (!reader) throw new McpDomainError('PROVIDER', 'Google Cloud Storage returned an empty report body.');
    const chunks: Uint8Array[] = []; let total = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; if (!value) continue; total += value.length; if (total > MAX_REPORT_BYTES) { await reader.cancel(); throw new McpDomainError('PROVIDER', `Installation report exceeds the ${MAX_REPORT_BYTES} byte download limit.`); } chunks.push(value); }
    const output = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
    return output;
  }

  private async getResponse(url: string, scope: string): Promise<Response> {
    let token: string;
    const tokenProvider = this.tokenProvider ?? (this.environment.GOOGLE_OAUTH_ACCESS_TOKEN
      ? new EnvironmentAccessToken(this.environment.GOOGLE_OAUTH_ACCESS_TOKEN)
      : new ApplicationDefaultCredentials(scope));
    try { token = await tokenProvider.getAccessToken(); }
    catch (error) {
      if (error instanceof McpDomainError) throw error;
      throw new McpDomainError('AUTHORIZATION', 'Google application default credentials could not be used.', error);
    }
    let response: Response;
    try { response = await this.request(url, { method: 'GET', headers: { authorization: `Bearer ${token}` } }); }
    catch (error) { throw new McpDomainError('PROVIDER', 'The Google Play request could not be completed.', error); }
    if (!response.ok) throw googlePlayError(response.status);
    return response;
  }
}

function hourUtc(value: string): string {
  const date = new Date(value);
  if (!value.endsWith('Z') || Number.isNaN(date.valueOf()) || date.getUTCMinutes() || date.getUTCSeconds() || date.getUTCMilliseconds()) throw new McpDomainError('CONFIGURATION', 'Android vitals periods must be UTC hour-aligned timestamps.');
  return date.toISOString();
}
function monthsForPeriod(start: string, end: string): string[] {
  if (start > end) throw new McpDomainError('CONFIGURATION', 'Installation report start must be on or before end.');
  const cursor = new Date(`${start}T00:00:00Z`); const finish = new Date(`${end}T00:00:00Z`); const months: string[] = [];
  while (cursor <= finish) { months.push(`${cursor.getUTCFullYear()}${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`); cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1); }
  return [...new Set(months)];
}
function parseInstallationCsv(bytes: Uint8Array, requested: { start: string; end: string; dimension?: string }): GoogleInstallMetric[] {
  const uncompressed = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  const text = new TextDecoder(uncompressed[0] === 0xff && uncompressed[1] === 0xfe ? 'utf-16le' : 'utf-8').decode(uncompressed).replace(/^\uFEFF/, '');
  const rows = parseCsv(text); if (rows.length < 2) return [];
  const headers = rows[0]!.map((header) => header.trim()); const dateIndex = headers.findIndex((header) => /^date$/i.test(header));
  if (dateIndex < 0) throw new McpDomainError('PROVIDER', 'Installation report does not contain a Date column.');
  return rows.slice(1).flatMap((row) => {
    const date = row[dateIndex]?.trim(); if (!date || date < requested.start || date > requested.end) return [];
    const dimensions = Object.fromEntries(headers.flatMap((header, index) => index === dateIndex || installationColumn(header) ? [] : [[header, row[index] ?? '']]));
    return headers.flatMap((name, index) => { const value = Number(row[index]); const descriptor = installationColumn(name); if (!descriptor || !Number.isFinite(value)) return []; return [{ name, value, unit: 'count' as const, ...descriptor, source: 'google-play-statistics-gcs' as const, period: { start: date, end: date }, dimensions }]; });
  });
}
function installationColumn(name: string): { entity: 'events' | 'devices' | 'users'; temporalType: 'flow' | 'stock' } | undefined {
  if (!/install/i.test(name)) return undefined;
  const entity = /user/i.test(name) ? 'users' : /device/i.test(name) ? 'devices' : 'events';
  return { entity, temporalType: /total|active|current/i.test(name) ? 'stock' : 'flow' };
}
function parseCsv(text: string): string[][] { const rows: string[][] = []; let row: string[] = [], field = '', quoted = false; for (let index = 0; index < text.length; index += 1) { const character = text[index]!; if (character === '"') { if (quoted && text[index + 1] === '"') { field += character; index += 1; } else quoted = !quoted; } else if (character === ',' && !quoted) { row.push(field); field = ''; } else if ((character === '\n' || character === '\r') && !quoted) { if (character === '\r' && text[index + 1] === '\n') index += 1; row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ''; } else field += character; } if (field || row.length) { row.push(field); rows.push(row); } return rows; }

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
