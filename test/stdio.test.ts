import { mkdtempSync, writeFileSync } from 'node:fs';
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
});
