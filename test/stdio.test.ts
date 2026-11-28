import { mkdtempSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';

const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function connect(environment: Record<string, string>): Promise<Client> {
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(process.cwd(), 'dist/index.js')],
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    stderr: 'pipe'
  });
  await client.connect(transport);
  clients.push(client);
  return client;
}

async function connectWithProviderFixtures(environment: Record<string, string>): Promise<Client> {
  const client = new Client({ name: 'provider-fixture-integration-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', join(process.cwd(), 'test/stdio-fixture-fetch.mjs'), join(process.cwd(), 'dist/index.js')],
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    stderr: 'pipe'
  });
  await client.connect(transport);
  clients.push(client);
  return client;
}

describe('stdio MCP server', () => {
  it('completes handshake, lists tools, and returns configured apps', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mobile-developer-mcp-'));
    const configPath = join(directory, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      apps: [{ id: 'sample-app', appStore: { appId: '1234567890' } }]
    }));
    const client = await connect({ MOBILE_DEVELOPER_MCP_CONFIG_PATH: configPath });

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      'mobile_developer_list_apps',
      'mobile_developer_provider_status'
    ]));

    const result = await client.callTool({ name: 'mobile_developer_list_apps', arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result)).toContain('sample-app');
  });

  it('returns a structured configuration error without leaking secrets', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mobile-developer-mcp-'));
    const configPath = join(directory, 'config.json');
    writeFileSync(configPath, '{"apps":"bad","token":"Bearer very-secret-token"}');
    const client = await connect({ MOBILE_DEVELOPER_MCP_CONFIG_PATH: configPath });

    const result = await client.callTool({ name: 'mobile_developer_list_apps', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('CONFIGURATION');
    expect(JSON.stringify(result)).not.toContain('very-secret-token');
  });

  it('uses the injected process environment for provider status', async () => {
    const client = await connect({ GOOGLE_APPLICATION_CREDENTIALS: '/private/service-account.json' });
    const result = await client.callTool({ name: 'mobile_developer_provider_status', arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result)).toContain('"provider":"google-play","credentialsConfigured":true');
  });

  it('calls Google Play and App Store tools over stdio using GET-only provider fixtures', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mobile-developer-mcp-'));
    const configPath = join(directory, 'config.json');
    const keyPath = join(directory, 'fixture-key.p8');
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    writeFileSync(configPath, JSON.stringify({ apps: [{
      id: 'fixture-app',
      googlePlay: { packageName: 'com.example.fixture', tracks: ['production'] },
      appStore: { appId: '1234567890' }
    }] }));
    const client = await connectWithProviderFixtures({
      MOBILE_DEVELOPER_MCP_CONFIG_PATH: configPath,
      GOOGLE_OAUTH_ACCESS_TOKEN: 'fixture-token-not-a-secret',
      APP_STORE_CONNECT_KEY_PATH: keyPath,
      APP_STORE_CONNECT_KEY_ID: 'FIXTUREKEY',
      APP_STORE_CONNECT_ISSUER_ID: 'fixture-issuer'
    });

    const google = await client.callTool({ name: 'mobile_developer_google_play_releases', arguments: { appId: 'fixture-app', track: 'production' } });
    const apple = await client.callTool({ name: 'mobile_developer_app_store_versions', arguments: { appId: 'fixture-app' } });
    expect(google.isError).not.toBe(true);
    expect(apple.isError).not.toBe(true);
    expect(JSON.stringify(google)).toContain('fixture-google-release');
    expect(JSON.stringify(apple)).toContain('fixture-apple-version');
    expect(JSON.stringify({ google, apple })).not.toContain('fixture-token-not-a-secret');
  });
});
