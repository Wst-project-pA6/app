import { PasswordService, ARGON2_PARAMETERS } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('uses the approved Argon2id PHC format and verifies asynchronously', async () => {
    const hash = await service.hash('p ässword');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/u);
    expect(hash.split('$')[4]).toHaveLength(22);
    expect(hash.split('$')[5]).toHaveLength(43);
    await expect(service.verify('p ässword', hash)).resolves.toBe(true);
    await expect(service.verify('wrong', hash)).resolves.toBe(false);
    expect(ARGON2_PARAMETERS).toEqual({ memory: 19456, passes: 2, parallelism: 1, tagLength: 32 });
  }, 15000);

  it('does one safe dummy verification for an unknown user', async () => {
    await expect(service.verify('anything')).resolves.toBe(false);
  }, 15000);

  it('rejects malformed or non-approved PHC hashes without exposing them', async () => {
    await expect(service.verify('password', '$argon2i$bad')).resolves.toBe(false);
    await expect(service.verify('password', '$argon2id$v=18$m=19456,t=2,p=1$BwcHBwcHBwcHBwcHBwcHBw$LgScOfU2ru0cvLQ/UDBJoBeicda44ISHu2Dj0fa2NFc')).resolves.toBe(false);
    await expect(service.verify('password', '$argon2id$v=19$m=19456,t=3,p=1$BwcHBwcHBwcHBwcHBwcHBw$LgScOfU2ru0cvLQ/UDBJoBeicda44ISHu2Dj0fa2NFc')).resolves.toBe(false);
  }, 15000);
});
