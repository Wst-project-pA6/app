import { validationSchema } from './validation.schema';

const BASE_ENV = { AUTH_JWT_SECRET: 'x'.repeat(32) };

describe('validationSchema', () => {
  describe('ATTACHMENTS_SIGNING_SECRET', () => {
    it('allows an empty value (falls back to AUTH_JWT_SECRET elsewhere)', () => {
      const { error } = validationSchema.validate({ ...BASE_ENV, ATTACHMENTS_SIGNING_SECRET: '' });
      expect(error).toBeUndefined();
    });

    it('allows a value of at least 32 bytes', () => {
      const { error } = validationSchema.validate({ ...BASE_ENV, ATTACHMENTS_SIGNING_SECRET: 'y'.repeat(32) });
      expect(error).toBeUndefined();
    });

    it('rejects a value shorter than 32 bytes', () => {
      const { error } = validationSchema.validate({ ...BASE_ENV, ATTACHMENTS_SIGNING_SECRET: 'too-short' });
      expect(error).toBeDefined();
    });
  });

  describe('APP_BASE_URL', () => {
    it('accepts https in production', () => {
      const { error } = validationSchema.validate({ ...BASE_ENV, NODE_ENV: 'production', APP_BASE_URL: 'https://wst.example.com' });
      expect(error).toBeUndefined();
    });

    it('rejects http in production, even for a real host', () => {
      const { error } = validationSchema.validate({ ...BASE_ENV, NODE_ENV: 'production', APP_BASE_URL: 'http://wst.example.com' });
      expect(error).toBeDefined();
    });

    it.each(['localhost', '127.0.0.1'])('accepts http for %s outside production', (host) => {
      const { error } = validationSchema.validate({ ...BASE_ENV, NODE_ENV: 'development', APP_BASE_URL: `http://${host}:3000` });
      expect(error).toBeUndefined();
    });

    it('rejects a public http host outside production', () => {
      const { error } = validationSchema.validate({ ...BASE_ENV, NODE_ENV: 'development', APP_BASE_URL: 'http://wst.example.com' });
      expect(error).toBeDefined();
    });

    it('accepts https for a public host outside production', () => {
      const { error } = validationSchema.validate({ ...BASE_ENV, NODE_ENV: 'development', APP_BASE_URL: 'https://wst.example.com' });
      expect(error).toBeUndefined();
    });

    it('rejects a malformed URL', () => {
      const { error } = validationSchema.validate({ ...BASE_ENV, APP_BASE_URL: 'not a url' });
      expect(error).toBeDefined();
    });

    it('is a no-op when unset', () => {
      const { error } = validationSchema.validate({ ...BASE_ENV });
      expect(error).toBeUndefined();
    });
  });
});
