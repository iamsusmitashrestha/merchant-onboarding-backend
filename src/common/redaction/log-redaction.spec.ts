import pino from 'pino';
import { Writable } from 'stream';
import { LOG_REDACT_PATHS } from './redaction';

// Uses the exact redact config from app.module.ts against a captured stream.
function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const logger = pino(
    { redact: { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' } },
    stream,
  );
  return { logger, output: () => lines.join('') };
}

describe('log redaction', () => {
  it('redacts the Authorization header and cookies of a logged request', () => {
    const { logger, output } = captureLogger();

    logger.info({
      req: {
        method: 'GET',
        headers: {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.secret.signature',
          cookie: 'session=abc123',
        },
      },
    });

    expect(output()).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(output()).not.toContain('session=abc123');
    expect(output()).toContain('[REDACTED]');
    expect(output()).toContain('GET');
  });

  it('redacts passwords and sensitive fields in a logged request body', () => {
    const { logger, output } = captureLogger();

    logger.info({
      req: {
        body: {
          email: 'sales@example.com',
          password: 'hunter2-hunter2',
          taxId: '00-0000001',
        },
      },
    });

    expect(output()).not.toContain('hunter2-hunter2');
    expect(output()).not.toContain('00-0000001');
    expect(output()).toContain('sales@example.com');
  });

  it('redacts secret keys on any logged object', () => {
    const { logger, output } = captureLogger();

    logger.info({ user: { email: 'a@example.com', passwordHash: '$2b$12$x' } });
    logger.info({ auth: { accessToken: 'token-value-123' } });

    expect(output()).not.toContain('$2b$12$x');
    expect(output()).not.toContain('token-value-123');
  });
});
