import { createHash } from 'node:crypto';
import { generateVerificationToken, hashVerificationToken } from './certificate-token.util';

const VERIFICATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,86}$/u;
const TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/u;

describe('certificate-token.util', () => {
  it('generates a 256-bit token matching the frozen VerificationToken parameter shape exactly', () => {
    const { token } = generateVerificationToken();
    expect(token).toMatch(VERIFICATION_TOKEN_PATTERN);
    // 32 raw bytes base64url-encoded without padding is exactly 43 characters.
    expect(token).toHaveLength(43);
  });

  it('never generates the same token twice (cryptographically secure randomness)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateVerificationToken().token);
    expect(seen.size).toBe(200);
  });

  it('hashes to a SHA-256 hex digest matching the frozen verification_token_hash column shape', () => {
    const { token, tokenHash } = generateVerificationToken();
    expect(tokenHash).toMatch(TOKEN_HASH_PATTERN);
    expect(tokenHash).toBe(createHash('sha256').update(token, 'utf8').digest('hex'));
  });

  it('hashVerificationToken is deterministic and never returns the raw input', () => {
    const first = hashVerificationToken('a-known-raw-token-value');
    const second = hashVerificationToken('a-known-raw-token-value');
    expect(first).toBe(second);
    expect(first).not.toBe('a-known-raw-token-value');
    expect(hashVerificationToken('a-different-value')).not.toBe(first);
  });
});
