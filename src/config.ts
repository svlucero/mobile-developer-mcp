import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { McpDomainError } from './errors.js';

const appSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9-]*$/),
  googlePlay: z.object({
    packageName: z.string().min(3).max(255),
    tracks: z.array(z.string().min(1).max(100)).min(1).max(20)
  }).optional(),
  appStore: z.object({
    appId: z.string().regex(/^\d+$/)
  }).optional()
}).refine((app) => app.googlePlay || app.appStore, {
  message: 'an app must configure Google Play, App Store, or both'
});

const configSchema = z.object({ apps: z.array(appSchema).max(100) })
  .refine(({ apps }) => new Set(apps.map((app) => app.id)).size === apps.length, {
    message: 'app ids must be unique'
  });

export type AppConfig = z.infer<typeof appSchema>;
export type McpConfig = z.infer<typeof configSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): McpConfig {
  const configuredPath = environment.MOBILE_DEVELOPER_MCP_CONFIG_PATH;
  if (!configuredPath) return { apps: [] };

  const path = resolve(configuredPath);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new McpDomainError('CONFIGURATION', 'The local application configuration could not be read.', error);
  }

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new McpDomainError('CONFIGURATION', 'The local application configuration is invalid.');
  }
  return parsed.data;
}
