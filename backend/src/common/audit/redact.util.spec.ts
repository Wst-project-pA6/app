import { redactChanges, REDACTED } from './redact.util';

describe('redactChanges', () => {
  it('redacts before/after string values for sensitive field names', () => {
    const result = redactChanges([
      { field: 'passwordHash', before: 'abc', after: 'def' },
      { field: 'refreshToken', before: null, after: 'xyz' },
    ]);
    expect(result).toEqual([
      { field: 'passwordHash', before: REDACTED, after: REDACTED },
      { field: 'refreshToken', before: REDACTED, after: REDACTED },
    ]);
  });

  it('redacts object-shaped before/after values for a sensitive field', () => {
    const result = redactChanges([
      { field: 'authorizationHeader', before: { raw: 'Bearer x' }, after: { raw: 'Bearer y' } },
    ]);
    expect(result).toEqual([{ field: 'authorizationHeader', before: REDACTED, after: REDACTED }]);
  });

  it('leaves non-sensitive fields untouched, including non-string before/after', () => {
    const change = { field: 'laborEntry', before: { durationMinutes: 90 }, after: { durationMinutes: 60 } };
    expect(redactChanges([change])).toEqual([change]);
  });

  it('is a no-op for non-array input', () => {
    expect(redactChanges(undefined)).toBeUndefined();
    expect(redactChanges(null)).toBeNull();
    expect(redactChanges('not-an-array')).toBe('not-an-array');
  });

  it('ignores malformed entries without a string field', () => {
    const entries = [{ before: 'x' }, 'not-an-object', 42];
    expect(redactChanges(entries)).toEqual(entries);
  });

  it('recurses into nested objects to redact a sensitive key even under a non-sensitive field name', () => {
    const result = redactChanges([
      { field: 'session', before: { token: 'abc', userId: 'u1' }, after: { token: 'def', userId: 'u1' } },
    ]);
    expect(result).toEqual([
      { field: 'session', before: { token: REDACTED, userId: 'u1' }, after: { token: REDACTED, userId: 'u1' } },
    ]);
  });

  it('recurses through nested arrays and redacts cookie/secret keys wherever they appear', () => {
    const result = redactChanges([
      { field: 'requestHeaders', before: [{ cookie: 'a=b' }, { host: 'x' }], after: { apiSecret: 'shh', ok: true } },
    ]);
    expect(result).toEqual([
      { field: 'requestHeaders', before: [{ cookie: REDACTED }, { host: 'x' }], after: { apiSecret: REDACTED, ok: true } },
    ]);
  });

  it('never mutates the input, even when it is frozen (proves it cannot corrupt an immutable row)', () => {
    const original = Object.freeze([
      Object.freeze({ field: 'session', before: Object.freeze({ token: 'abc' }), after: Object.freeze({ token: 'def' }) }),
    ]);
    expect(() => redactChanges(original)).not.toThrow();
    const result = redactChanges(original) as Array<{ before: { token: string } }>;
    expect(result[0].before).toEqual({ token: REDACTED });
    expect(original[0].before.token).toBe('abc');
  });
});
