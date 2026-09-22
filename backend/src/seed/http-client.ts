import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { API_PREFIX } from '../app-bootstrap';

export class SeedApiError extends Error {
  constructor(
    method: string,
    path: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`${method} ${path} -> ${status}: ${JSON.stringify(body)}`);
  }
}

export interface Attachment {
  fieldName: string;
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

/**
 * Thin wrapper around supertest bound to the in-process Nest application (the same pattern
 * `test/*.e2e-spec.ts` uses). Every call this makes is a real HTTP request through the real
 * global pipes/guards/filters — there is no direct-to-repository or direct-to-DB path here.
 */
export class SeedHttpClient {
  private readonly tokens = new Map<string, string>();

  constructor(private readonly app: INestApplication) {}

  private agent() {
    return request(this.app.getHttpServer());
  }

  private url(path: string): string {
    return `/${API_PREFIX}/${path.replace(/^\//, '')}`;
  }

  /** Logs in with a real credential pair and caches the access token under `actorKey`. */
  async loginAs(actorKey: string, email: string, password: string): Promise<void> {
    const response = await this.agent().post(this.url('auth/login')).send({ email, password });
    if (response.status !== 200) {
      throw new SeedApiError('POST', 'auth/login', response.status, response.body);
    }
    this.tokens.set(actorKey, response.body.accessToken as string);
  }

  hasToken(actorKey: string): boolean {
    return this.tokens.has(actorKey);
  }

  /** Registers a new self-service account. Returns null on 409 (email already registered). */
  async register(body: {
    email: string;
    displayName: string;
    preferredLocale: 'en' | 'ar';
    password: string;
  }): Promise<{ id: string } | null> {
    const response = await this.agent().post(this.url('auth/register')).send(body);
    if (response.status === 201) return response.body as { id: string };
    if (response.status === 409) return null;
    throw new SeedApiError('POST', 'auth/register', response.status, response.body);
  }

  /**
   * Creates a user via the admin-only `POST /users` path (no self-registration rate limit —
   * that limiter is specific to `/auth/register`, which the demo seed reserves for the one or
   * two accounts that must exist before any admin does; see bootstrap-admin.ts). Returns null on
   * 409 so callers can fall back to looking the existing user up.
   */
  async createUserAsAdmin(body: {
    email: string;
    displayName: string;
    preferredLocale: 'en' | 'ar';
    temporaryPassword: string;
  }): Promise<{ id: string } | null> {
    const response = await this.agent().post(this.url('users')).set('Authorization', this.bearer('admin')).send(body);
    if (response.status === 201) return response.body as { id: string };
    if (response.status === 409) return null;
    throw new SeedApiError('POST', 'users', response.status, response.body);
  }

  async get(path: string, actorKey: string, query?: Record<string, string | number>): Promise<any> {
    let req = this.agent().get(this.url(path)).set('Authorization', this.bearer(actorKey));
    if (query) req = req.query(query);
    return this.expect(req, 'GET', path, [200]);
  }

  /** Returns null instead of throwing when the resource does not exist (404). */
  async tryGet(path: string, actorKey: string): Promise<any> {
    const response = await this.agent().get(this.url(path)).set('Authorization', this.bearer(actorKey));
    if (response.status === 404) return null;
    if (response.status !== 200) throw new SeedApiError('GET', path, response.status, response.body);
    return response.body;
  }

  async post(
    path: string,
    actorKey: string,
    body: object,
    expectedStatuses: number[] = [200, 201],
  ): Promise<any> {
    const req = this.agent().post(this.url(path)).set('Authorization', this.bearer(actorKey)).send(body);
    return this.expect(req, 'POST', path, expectedStatuses);
  }

  async patch(path: string, actorKey: string, body: object): Promise<any> {
    const req = this.agent().patch(this.url(path)).set('Authorization', this.bearer(actorKey)).send(body);
    return this.expect(req, 'PATCH', path, [200]);
  }

  async put(path: string, actorKey: string, body: object): Promise<any> {
    const req = this.agent().put(this.url(path)).set('Authorization', this.bearer(actorKey)).send(body);
    return this.expect(req, 'PUT', path, [200]);
  }

  async uploadAttachment(actorKey: string, purpose: string, file: Attachment): Promise<{ id: string }> {
    const req = this.agent()
      .post(this.url('attachments'))
      .set('Authorization', this.bearer(actorKey))
      .field('purpose', purpose)
      .attach(file.fieldName, file.buffer, { filename: file.fileName, contentType: file.contentType });
    return this.expect(req, 'POST', 'attachments', [200, 201]);
  }

  private bearer(actorKey: string): string {
    const token = this.tokens.get(actorKey);
    if (!token) throw new Error(`No cached access token for actor "${actorKey}" — call loginAs() first`);
    return `Bearer ${token}`;
  }

  private async expect(
    req: request.Test,
    method: string,
    path: string,
    expectedStatuses: number[],
  ): Promise<any> {
    const response = await req;
    if (!expectedStatuses.includes(response.status)) {
      throw new SeedApiError(method, path, response.status, response.body);
    }
    return response.body;
  }
}
