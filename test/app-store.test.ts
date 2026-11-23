import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { AppStoreAdapter, createAppStoreJwt } from '../src/providers/app-store.js';

const fixtureKey = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIGul4YEmRvdRZxxnt9jTjTfzBj36LJfNdv1Hs9ptRWAOoAoGCCqGSM49
AwEHoUQDQgAEciHMjmuhiVWjNnk8i4E+81mqIbdnqDb+Yn6horjIn9kfFfZV02m6
kTP4atFEHnnOtGLo6i2ZEoVKMDaOlspi3w==
-----END EC PRIVATE KEY-----`;

function environment() {
  const path = join(mkdtempSync(join(tmpdir(), 'apple-key-')), 'AuthKey_TEST.p8');
  writeFileSync(path, fixtureKey);
  return { APP_STORE_CONNECT_KEY_PATH: path, APP_STORE_CONNECT_KEY_ID: 'TESTKEY', APP_STORE_CONNECT_ISSUER_ID: 'issuer-fixture' };
}
function fixtureAdapter(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  return { calls, adapter: new AppStoreAdapter(environment(), async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }) };
}

describe('App Store Connect read-only adapter', () => {
  it('signs a short-lived ES256 JWT locally without exposing the private key', () => {
    const credentials = { keyPath: environment().APP_STORE_CONNECT_KEY_PATH!, keyId: 'TESTKEY', issuerId: 'issuer-fixture' };
    const token = createAppStoreJwt(credentials, new Date('2026-01-01T00:00:00Z'));
    const [header, payload, signature] = token.split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toMatchObject({ alg: 'ES256', kid: 'TESTKEY' });
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString())).toMatchObject({ iss: 'issuer-fixture', aud: 'appstoreconnect-v1', exp: 1767226740 });
    expect(signature).toHaveLength(86);
    expect(token).not.toContain('PRIVATE KEY');
  });

  it('reads versions, builds and reviews through bounded GET requests', async () => {
    const { adapter, calls } = fixtureAdapter({ data: [{ id: 'version-1', attributes: { versionString: '2.0', appStoreState: 'READY_FOR_SALE' } }], links: { next: 'https://api.appstoreconnect.apple.com/v1/appStoreVersions?cursor=next' } });
    await expect(adapter.listVersions('123', { limit: 20, cursor: 'old', platform: 'IOS' })).resolves.toEqual({ versions: [{ id: 'version-1', versionString: '2.0', appStoreState: 'READY_FOR_SALE' }], nextCursor: 'next' });
    expect(calls[0]?.url).toContain('/appStoreVersions?filter%5Bapp%5D=123&limit=20&cursor=old&filter%5Bplatform%5D=IOS');
    expect(calls[0]?.init).toMatchObject({ method: 'GET' });
    expect(String(calls[0]?.init.headers)).not.toContain('PRIVATE KEY');
  });

  it('returns diagnostic signatures with their explicit incomplete-coverage boundary', async () => {
    const { adapter, calls } = fixtureAdapter({ data: [{ id: 'signature-1', attributes: { diagnosticType: 'HANGS', signature: 'main-thread', weight: 7 } }] });
    await expect(adapter.listDiagnosticSignatures('build-1', { limit: 10 })).resolves.toEqual({ signatures: [{ id: 'signature-1', diagnosticType: 'HANGS', signature: 'main-thread', weight: 7 }] });
    expect(calls[0]?.url).toContain('/builds/build-1/diagnosticSignatures?limit=10');
    expect(calls[0]?.init.method).toBe('GET');
  });

  it('decodes gzip Sales reports, excludes in-app purchases, and keeps redownload semantics', async () => {
    const report = 'Provider\tProvider Country\tSKU\tDeveloper\tTitle\tVersion\tProduct Type Identifier\tUnits\tOrder Type\n1\tAR\tapp\tDev\tApp\t1.0\t1\t4\tNew\n1\tAR\tapp\tDev\tApp\t1.0\t1\t2\tRedownload\n1\tAR\tiap\tDev\tIAP\t1.0\t1F\t99\tNew\n';
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const adapter = new AppStoreAdapter({ ...environment(), APP_STORE_CONNECT_SALES_KEY_PATH: environment().APP_STORE_CONNECT_KEY_PATH! }, async (url, init) => { calls.push({ url, init }); return new Response(gzipSync(report), { status: 200 }); });
    const result = await adapter.readSalesDownloads('VENDOR', '2026-01-02');
    expect(result).toMatchObject({ reportAvailable: true, metrics: [{ name: 'initialDownloads', value: 4 }, { name: 'redownloads', value: 2 }] });
    expect(JSON.stringify(result)).not.toContain('1F');
    expect(calls[0]?.url).toContain('/salesReports?filter%5Bfrequency%5D=DAILY');
    expect(calls[0]?.init.method).toBe('GET');
  });

  it('keeps absent reports absent and maps authorization errors clearly', async () => {
    const missing = new AppStoreAdapter(environment(), async () => new Response('', { status: 404 }));
    await expect(missing.readSalesDownloads('VENDOR', '2026-01-02')).resolves.toEqual({ metrics: [], reportAvailable: false });
    const denied = new AppStoreAdapter(environment(), async () => new Response('', { status: 403 }));
    await expect(denied.listReviews('123', { limit: 1 })).rejects.toMatchObject({ code: 'AUTHORIZATION' });
  });

  it('reads existing analytics resources only and never returns signed segment URLs', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const adapter = new AppStoreAdapter({ ...environment(), APP_STORE_CONNECT_ANALYTICS_KEY_PATH: environment().APP_STORE_CONNECT_KEY_PATH! }, async (url, init) => { calls.push({ url, init }); if (url.includes('/segments')) return new Response(JSON.stringify({ data: [{ id: 'segment-1', attributes: { url: 'https://private.example/signed' } }] }), { status: 200 }); return new Response(JSON.stringify({ data: [] }), { status: 200 }); });
    await expect(adapter.listAnalyticsSegments('instance-1', 10)).resolves.toEqual({ segments: [{ id: 'segment-1' }], dataAvailable: true });
    expect(calls).toHaveLength(1); expect(calls[0]?.init.method).toBe('GET');
  });
});
