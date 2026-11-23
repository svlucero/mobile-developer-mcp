import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { redactForLog } from './errors.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error('mobile-developer-mcp connected over stdio');
}

main().catch((error: unknown) => {
  console.error('mobile-developer-mcp failed to start', redactForLog(error instanceof Error ? error.message : error));
  process.exitCode = 1;
});
