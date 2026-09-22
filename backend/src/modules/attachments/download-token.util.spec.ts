import { signDownloadToken, verifyDownloadToken } from './download-token.util';

const authorizationId = '11111111-1111-4111-8111-111111111111';
const issuedTo = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secret = 'test-secret';

describe('signDownloadToken / verifyDownloadToken', () => {
  it('verifies a signature it produced itself', () => {
    const sig = signDownloadToken(authorizationId, issuedTo, 10_000, secret);
    expect(verifyDownloadToken(authorizationId, issuedTo, 10_000, sig, secret)).toBe(true);
  });

  it('changes the signature when the authorization id, issuedTo, expiry, or secret changes', () => {
    const sig = signDownloadToken(authorizationId, issuedTo, 10_000, secret);
    expect(verifyDownloadToken('22222222-2222-4222-8222-222222222222', issuedTo, 10_000, sig, secret)).toBe(false);
    expect(verifyDownloadToken(authorizationId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 10_000, sig, secret)).toBe(false);
    expect(verifyDownloadToken(authorizationId, issuedTo, 20_000, sig, secret)).toBe(false);
    expect(verifyDownloadToken(authorizationId, issuedTo, 10_000, sig, 'a-different-secret')).toBe(false);
  });

  it('never contains the object storage key, only the authorization id, issuedTo and expiry', () => {
    const sig = signDownloadToken(authorizationId, issuedTo, 10_000, secret);
    expect(sig).not.toContain('object_storage_key');
    // The signature is a base64url HMAC digest — a fixed-length opaque token, not a
    // reversible encoding of its inputs.
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  it('rejects malformed input without throwing', () => {
    expect(verifyDownloadToken(authorizationId, issuedTo, Number.NaN, 'sig', secret)).toBe(false);
    expect(verifyDownloadToken(authorizationId, issuedTo, 10_000, '', secret)).toBe(false);
    expect(verifyDownloadToken(authorizationId, issuedTo, 10_000, undefined as unknown as string, secret)).toBe(false);
  });

  it('rejects a signature of a different length without throwing (constant-time path)', () => {
    expect(verifyDownloadToken(authorizationId, issuedTo, 10_000, 'short', secret)).toBe(false);
  });
});
