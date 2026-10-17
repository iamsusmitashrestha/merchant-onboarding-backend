import { maskLast4, redact, REDACTED } from './redaction';

describe('maskLast4', () => {
  it('keeps only the last 4 characters', () => {
    expect(maskLast4('00-0000001')).toBe('******0001');
  });

  it('fully masks values of 4 characters or fewer', () => {
    expect(maskLast4('123')).toBe('***');
  });

  it('passes null and undefined through as null', () => {
    expect(maskLast4(null)).toBeNull();
    expect(maskLast4(undefined)).toBeNull();
  });
});

describe('redact', () => {
  it('replaces secret keys regardless of case', () => {
    expect(
      redact({ Password: 'x', accessToken: 'y', email: 'a@example.com' }),
    ).toEqual({
      Password: REDACTED,
      accessToken: REDACTED,
      email: 'a@example.com',
    });
  });

  it('masks sensitive keys instead of removing them', () => {
    expect(redact({ taxId: '00-0000001', ownerPhone: '555-0100' })).toEqual({
      taxId: '******0001',
      ownerPhone: '****0100',
    });
  });

  it('handles nested objects and arrays', () => {
    const input = {
      user: { passwordHash: 'h' },
      items: [{ token: 't', n: 1 }],
    };
    expect(redact(input)).toEqual({
      user: { passwordHash: REDACTED },
      items: [{ token: REDACTED, n: 1 }],
    });
  });

  it('does not mutate the input', () => {
    const input = { password: 'secret' };
    redact(input);
    expect(input.password).toBe('secret');
  });

  it('leaves primitives, null and dates untouched', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    expect(redact({ a: null, b: 2, c: date })).toEqual({
      a: null,
      b: 2,
      c: date,
    });
    expect(redact('plain')).toBe('plain');
  });
});
