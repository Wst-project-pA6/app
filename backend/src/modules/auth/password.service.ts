import { Injectable } from '@nestjs/common';
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

const PARAMETERS = Object.freeze({
  memory: 19456,
  passes: 2,
  parallelism: 1,
  tagLength: 32,
});
const SALT_LENGTH = 16;
const HASH_LENGTH = 32;
const PHC_PREFIX = '$argon2id$v=19$m=19456,t=2,p=1$';
const DUMMY_HASH = `${PHC_PREFIX}BwcHBwcHBwcHBwcHBwcHBw$LgScOfU2ru0cvLQ/UDBJoBeicda44ISHu2Dj0fa2NFc`;

interface ParsedHash {
  salt: Buffer;
  hash: Buffer;
}

function encodeBase64(value: Buffer): string {
  return value.toString('base64').replace(/=+$/u, '');
}

function decodeBase64(value: string, expectedLength: number): Buffer | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(value) || value.includes('=')) return null;
  if (value.length % 4 === 1) return null;
  const decoded = Buffer.from(value, 'base64');
  if (encodeBase64(decoded) !== value || decoded.length !== expectedLength) return null;
  return decoded;
}

function parsePhc(value: string): ParsedHash | null {
  if (typeof value !== 'string') return null;
  const parts = value.split('$');
  if (parts.length !== 6 || parts[0] !== '' || parts[1] !== 'argon2id' || parts[2] !== 'v=19') return null;
  if (parts[3] !== 'm=19456,t=2,p=1') return null;
  const salt = decodeBase64(parts[4], SALT_LENGTH);
  const hash = decodeBase64(parts[5], HASH_LENGTH);
  return salt && hash ? { salt, hash } : null;
}

function derive(message: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', { message, nonce: salt, ...PARAMETERS }, (error, key) => {
      if (error) reject(error);
      else resolve(Buffer.from(key));
    });
  });
}

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const derived = await derive(password, salt);
    return `${PHC_PREFIX}${encodeBase64(salt)}$${encodeBase64(derived)}`;
  }

  async verify(password: string, storedHash?: string): Promise<boolean> {
    const hashToCheck = storedHash ?? DUMMY_HASH;
    const parsed = parsePhc(hashToCheck);
    const verificationHash = parsed ?? parsePhc(DUMMY_HASH)!;
    const derived = await derive(password, verificationHash.salt);
    const matches = derived.length === verificationHash.hash.length
      ? timingSafeEqual(derived, verificationHash.hash)
      : false;
    return parsed !== null && matches;
  }

}

export const ARGON2_PARAMETERS = PARAMETERS;
