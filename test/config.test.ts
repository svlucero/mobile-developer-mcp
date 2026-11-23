import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { McpDomainError, redactForLog, redactSecrets } from '../src/errors.js';

describe('local configuration', () => {
  it('accepts either provider without requiring the other', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mobile-developer-mcp-'));
    const configPath = join(directory, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      apps: [{ id: 'android-only', googlePlay: { packageName: 'com.example.app', tracks: ['production'] } }]
    }));

    expect(loadConfig({ MOBILE_DEVELOPER_MCP_CONFIG_PATH: configPath }).apps).toHaveLength(1);
  });

  it('returns a sanitized configuration error for invalid files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mobile-developer-mcp-'));
    const configPath = join(directory, 'config.json');
    writeFileSync(configPath, '{"token":"super-secret-value","apps":"not-an-array"}');

    try {
      loadConfig({ MOBILE_DEVELOPER_MCP_CONFIG_PATH: configPath });
      throw new Error('expected loadConfig to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(McpDomainError);
      expect(error).toMatchObject({ code: 'CONFIGURATION', message: 'The local application configuration is invalid.' });
      expect(String(error)).not.toContain('super-secret-value');
    }
  });
});

describe('secret redaction', () => {
  it('redacts known token forms and sensitive object keys', () => {
    expect(redactSecrets('Authorization: Bearer private-token')).not.toContain('private-token');
    expect(redactForLog({ accessToken: 'private-token', safe: 'value' })).toEqual({ accessToken: '[REDACTED]', safe: 'value' });
  });
});
