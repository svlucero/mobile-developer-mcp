import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { McpDomainError } from '../errors.js';
import type { ProviderAdapter } from './adapter.js';

const API_BASE_URL = 'https://api.appstoreconnect.apple.com/v1';
const MAX_REPORT_BYTES = 5 * 1024 * 1024;
type AppleFetch = (input: string, init: RequestInit) => Promise<Response>;
type CredentialRole = 'default' | 'sales' | 'analytics';

export interface AppleCredential { keyPath: string; keyId: string; issuerId: string; }
export interface AppleVersion { id: string; versionString?: string; platform?: string; appStoreState?: string; releaseType?: string; }
export interface AppleBuild { id: string; version?: string; uploadedDate?: string; processingState?: string; usesNonExemptEncryption?: boolean; }
export interface AppleReview { id: string; rating?: number; title?: string; body?: string; reviewerNickname?: string; createdDate?: string; territory?: string; }
export interface AppleDiagnosticSignature { id: string; diagnosticType?: string; signature?: string; weight?: number; }

function base64url(value: string | Buffer): string { return Buffer.from(value).toString('base64url'); }

export function createAppStoreJwt(credentials: AppleCredential, now = new Date()): string {
  const issuedAt = Math.floor(now.valueOf() / 1_000);
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: credentials.keyId, typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iss: credentials.issuerId, iat: issuedAt, exp: issuedAt + 1_140, aud: 'appstoreconnect-v1' }));
  let privateKey: ReturnType<typeof createPrivateKey>;
  try { privateKey = createPrivateKey(readFileSync(credentials.keyPath, 'utf8')); }
  catch (error) { throw new McpDomainError('CONFIGURATION', 'The local App Store Connect signing key could not be read.', error); }
  try { return `${header}.${payload}.${base64url(sign('sha256', Buffer.from(`${header}.${payload}`), { key: privateKey, dsaEncoding: 'ieee-p1363' }))}`; }
  catch (error) { throw new McpDomainError('AUTHORIZATION', 'The local App Store Connect signing key could not sign a token.', error); }
}

export class AppStoreAdapter implements ProviderAdapter {
  public readonly provider = 'app-store' as const;

  constructor(private readonly environment: NodeJS.ProcessEnv = process.env, private readonly request: AppleFetch = fetch) {}

  isConfigured(): boolean {
    return Boolean(this.credentials('default'));
  }

  async listVersions(appStoreId: string, options: { limit: number; cursor?: string; platform?: string }): Promise<{ versions: AppleVersion[]; nextCursor?: string }> {
    const result = await this.getJson<ApiCollection<{ versionString?: string; platform?: string; appStoreState?: string; releaseType?: string }>>('/appStoreVersions', { 'filter[app]': appStoreId, limit: String(options.limit), ...(options.cursor ? { cursor: options.cursor } : {}), ...(options.platform ? { 'filter[platform]': options.platform } : {}) });
    return { versions: result.data.map((item) => ({ id: item.id, ...item.attributes })), ...(result.links?.next ? { nextCursor: cursorFromLink(result.links.next) } : {}) };
  }

  async listBuilds(appStoreId: string, options: { limit: number; cursor?: string; version?: string }): Promise<{ builds: AppleBuild[]; nextCursor?: string }> {
    const result = await this.getJson<ApiCollection<{ version?: string; uploadedDate?: string; processingState?: string; usesNonExemptEncryption?: boolean }>>('/builds', { 'filter[app]': appStoreId, limit: String(options.limit), ...(options.cursor ? { cursor: options.cursor } : {}), ...(options.version ? { 'filter[version]': options.version } : {}) });
    return { builds: result.data.map((item) => ({ id: item.id, ...item.attributes })), ...(result.links?.next ? { nextCursor: cursorFromLink(result.links.next) } : {}) };
  }

  async listReviews(appStoreId: string, options: { limit: number; cursor?: string; territory?: string }): Promise<{ reviews: AppleReview[]; nextCursor?: string }> {
    const result = await this.getJson<ApiCollection<{ rating?: number; title?: string; body?: string; reviewerNickname?: string; createdDate?: string; territory?: string }>>('/customerReviews', { 'filter[app]': appStoreId, limit: String(options.limit), ...(options.cursor ? { cursor: options.cursor } : {}), ...(options.territory ? { 'filter[territory]': options.territory } : {}) });
    return { reviews: result.data.map((item) => ({ id: item.id, ...item.attributes })), ...(result.links?.next ? { nextCursor: cursorFromLink(result.links.next) } : {}) };
  }

  async listDiagnosticSignatures(buildId: string, options: { limit: number; cursor?: string }): Promise<{ signatures: AppleDiagnosticSignature[]; nextCursor?: string }> {
    const result = await this.getJson<ApiCollection<{ diagnosticType?: string; signature?: string; weight?: number }>>(`/builds/${encodeURIComponent(buildId)}/diagnosticSignatures`, { limit: String(options.limit), ...(options.cursor ? { cursor: options.cursor } : {}) });
    return { signatures: result.data.map((item) => ({ id: item.id, ...item.attributes })), ...(result.links?.next ? { nextCursor: cursorFromLink(result.links.next) } : {}) };
  }

  async readSalesDownloads(vendorNumber: string, reportDate: string): Promise<{ metrics: AppleDownloadMetric[]; reportAvailable: boolean }> {
    const bytes = await this.getBytes('/salesReports', { 'filter[frequency]': 'DAILY', 'filter[reportType]': 'SALES', 'filter[reportSubType]': 'SUMMARY', 'filter[reportDate]': reportDate, 'filter[vendorNumber]': vendorNumber }, 'sales', true);
    if (!bytes) return { metrics: [], reportAvailable: false };
    return { metrics: parseSalesReport(bytes, reportDate), reportAvailable: true };
  }

  async listAnalytics(appStoreId: string, options: { limit: number; cursor?: string }): Promise<{ requests: AnalyticsRequest[]; nextCursor?: string }> {
    const requests = await this.getJson<ApiCollection<{ name?: string; category?: string }>>('/analyticsReportRequests', { 'filter[app]': appStoreId, limit: String(options.limit), ...(options.cursor ? { cursor: options.cursor } : {}) }, 'analytics');
    const output: AnalyticsRequest[] = []; let remainingReports = options.limit;
    for (const item of requests.data) {
      if (!remainingReports) break;
      const reports = await this.getJson<ApiCollection<{ name?: string; category?: string }>>(`/analyticsReportRequests/${encodeURIComponent(item.id)}/reports`, { limit: '1' }, 'analytics');
      for (const report of reports.data) {
        if (!remainingReports) break;
        const instances = await this.getJson<ApiCollection<{ processingDate?: string }>>(`/analyticsReports/${encodeURIComponent(report.id)}/instances`, { limit: String(Math.min(options.limit, 10)) }, 'analytics');
        output.push({ id: item.id, name: item.attributes.name, category: item.attributes.category, reports: instances.data.map((instance) => ({ id: instance.id, reportId: report.id, processingDate: instance.attributes.processingDate })) });
        remainingReports -= 1;
      }
    }
    return { requests: output, ...(requests.links?.next ? { nextCursor: cursorFromLink(requests.links.next) } : {}) };
  }

  async listAnalyticsSegments(instanceId: string, limit: number): Promise<{ segments: AnalyticsSegment[]; dataAvailable: boolean }> {
    const result = await this.getJson<ApiCollection<{ url?: string }>>(`/analyticsReportInstances/${encodeURIComponent(instanceId)}/segments`, { limit: String(limit) }, 'analytics');
    return { segments: result.data.map((item) => ({ id: item.id })), dataAvailable: result.data.length > 0 };
  }

  private credentials(role: CredentialRole): AppleCredential | undefined {
    const prefix = role === 'default' ? 'APP_STORE_CONNECT' : `APP_STORE_CONNECT_${role.toUpperCase()}`;
    const keyPath = this.environment[`${prefix}_KEY_PATH`] ?? this.environment.APP_STORE_CONNECT_KEY_PATH;
    const keyId = this.environment[`${prefix}_KEY_ID`] ?? this.environment.APP_STORE_CONNECT_KEY_ID;
    const issuerId = this.environment[`${prefix}_ISSUER_ID`] ?? this.environment.APP_STORE_CONNECT_ISSUER_ID;
    return keyPath && keyId && issuerId ? { keyPath, keyId, issuerId } : undefined;
  }

  private async getJson<T>(path: string, parameters: Record<string, string>, role: CredentialRole = 'default'): Promise<T> {
    const response = await this.getResponse(`${API_BASE_URL}${path}?${new URLSearchParams(parameters)}`, role);
    try { return await response.json() as T; } catch (error) { throw new McpDomainError('PROVIDER', 'App Store Connect returned an invalid response.', error); }
  }
  private async getBytes(path: string, parameters: Record<string, string>, role: CredentialRole, missingIsEmpty = false): Promise<Uint8Array | undefined> {
    let response: Response;
    try { response = await this.getResponse(`${API_BASE_URL}${path}?${new URLSearchParams(parameters)}`, role); }
    catch (error) { if (missingIsEmpty && error instanceof McpDomainError && error.code === 'NOT_FOUND') return undefined; throw error; }
    const length = Number(response.headers.get('content-length')); if (Number.isFinite(length) && length > MAX_REPORT_BYTES) throw new McpDomainError('PROVIDER', 'App Store report exceeds the 5242880 byte download limit.');
    const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.length > MAX_REPORT_BYTES) throw new McpDomainError('PROVIDER', 'App Store report exceeds the 5242880 byte download limit.'); return bytes;
  }
  private async getResponse(url: string, role: CredentialRole): Promise<Response> {
    const credentials = this.credentials(role); if (!credentials) throw new McpDomainError('CONFIGURATION', `Local App Store Connect ${role} credentials are not configured.`);
    let jwt: string; try { jwt = createAppStoreJwt(credentials); } catch (error) { throw error; }
    let response: Response; try { response = await this.request(url, { method: 'GET', headers: { authorization: `Bearer ${jwt}`, accept: 'application/json' } }); } catch (error) { throw new McpDomainError('PROVIDER', 'The App Store Connect request could not be completed.', error); }
    if (!response.ok) throw appStoreError(response.status); return response;
  }
}

interface ApiCollection<T> { data: Array<{ id: string; attributes: T }>; links?: { next?: string }; }
export interface AppleDownloadMetric { name: 'initialDownloads' | 'redownloads' | 'downloads'; value: number; source: 'app-store-sales-and-trends'; period: { start: string; end: string }; dimensions: Record<string, string>; }
export interface AnalyticsRequest { id: string; name?: string; category?: string; reports: Array<{ id: string; reportId: string; processingDate?: string }>; }
export interface AnalyticsSegment { id: string; }
function cursorFromLink(link: string): string | undefined { try { return new URL(link).searchParams.get('cursor') ?? undefined; } catch { return undefined; } }
function parseSalesReport(bytes: Uint8Array, reportDate: string): AppleDownloadMetric[] {
  const raw = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  const rows = new TextDecoder('utf-8').decode(raw).replace(/^\uFEFF/, '').trim().split(/\r?\n/).map((line) => line.split('\t'));
  if (rows.length < 2) return []; const headers = rows[0]!; const units = headers.indexOf('Units'); const type = headers.indexOf('Product Type Identifier'); const orderType = headers.indexOf('Order Type');
  if (units < 0 || type < 0) throw new McpDomainError('PROVIDER', 'Sales report does not contain required download columns.');
  return rows.slice(1).flatMap((row) => { if (row[type] !== '1') return []; const value = Number(row[units]); if (!Number.isFinite(value)) return []; const redownload = orderType >= 0 && /redownload/i.test(row[orderType] ?? ''); return [{ name: orderType >= 0 ? (redownload ? 'redownloads' : 'initialDownloads') : 'downloads', value, source: 'app-store-sales-and-trends' as const, period: { start: reportDate, end: reportDate }, dimensions: Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']).filter(([header]) => !['Units'].includes(header))) }]; });
}
function appStoreError(status: number): McpDomainError { if (status === 401 || status === 403) return new McpDomainError('AUTHORIZATION', 'App Store Connect credentials are missing, invalid, or lack the required role.'); if (status === 404) return new McpDomainError('NOT_FOUND', 'The requested App Store Connect resource or report was not found.'); if (status === 429) return new McpDomainError('PROVIDER', 'App Store Connect rate limited the request.'); return new McpDomainError('PROVIDER', 'App Store Connect could not complete the request.'); }
