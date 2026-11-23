export type ErrorCode = 'CONFIGURATION' | 'AUTHORIZATION' | 'NOT_FOUND' | 'PROVIDER';

const sensitiveName = /(secret|token|password|credential|private.?key|authorization)/i;
const sensitiveValue = /(bearer\s+\S+|AIza[\w-]+|ya29\.[\w-]+|-----BEGIN[\s\S]*?-----END)/gi;

export function redactSecrets(value: string): string {
  return value.replace(sensitiveValue, '[REDACTED]');
}

export class McpDomainError extends Error {
  public readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(redactSecrets(message));
    this.name = 'McpDomainError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

export function asToolError(error: unknown) {
  const domainError = error instanceof McpDomainError
    ? error
    : new McpDomainError('PROVIDER', 'The provider request could not be completed.');
  const payload = { error: { code: domainError.code, message: redactSecrets(domainError.message) } };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true
  };
}

export function redactForLog(value: unknown): unknown {
  if (typeof value === 'string') return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactForLog);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      sensitiveName.test(key) ? '[REDACTED]' : redactForLog(nested)
    ]));
  }
  return value;
}
