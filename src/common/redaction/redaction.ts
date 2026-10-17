/**
 * The single place that decides what is secret or sensitive.
 * Used by: log redaction (pino), audit metadata, and API response masking.
 */

/** Removed entirely wherever they appear. */
export const SECRET_KEYS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'secret',
  'jwt',
] as const;

/** Kept, but only the last 4 characters are visible. */
export const MASKED_KEYS = ['taxId', 'ownerPhone'] as const;

export const REDACTED = '[REDACTED]';

const secretKeySet = new Set(SECRET_KEYS.map((k) => k.toLowerCase()));
const maskedKeySet = new Set(MASKED_KEYS.map((k) => k.toLowerCase()));

export function maskLast4(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value.length <= 4) return '*'.repeat(value.length);
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

/** Deep copy of `value` with secret keys replaced and masked keys masked. Never mutates input. */
export function redact<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value === null || typeof value !== 'object' || value instanceof Date) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (secretKeySet.has(lower)) {
      out[key] = REDACTED;
    } else if (maskedKeySet.has(lower)) {
      out[key] = typeof inner === 'string' ? maskLast4(inner) : REDACTED;
    } else {
      out[key] = redactValue(inner);
    }
  }
  return out;
}

/**
 * pino redaction paths. pino matches exact paths (not key names anywhere), so
 * we list the places request data shows up in HTTP logs.
 */
export const LOG_REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...[...SECRET_KEYS, ...MASKED_KEYS].flatMap((k) => [
    `req.body.${k}`,
    `*.${k}`,
  ]),
];
