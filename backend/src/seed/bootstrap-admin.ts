import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessService } from '../modules/access/access.service';
import { RoleCode, UserStatus } from '../modules/access/dto/access.dto';
import type { AuthenticatedPrincipal } from '../modules/auth/authenticated-principal';
import { SeedHttpClient } from './http-client';
import { DEMO_PASSWORD, bootstrapActor, bootstrapAdmin } from './fixtures';

/** Builds a minimal AuthenticatedPrincipal-shaped actor. Only `.id` matters to `replaceRoles`
 * (it is used for the self-modification check and as the `granted_by` audit value) — the other
 * fields are never read by that method, so a synthetic principal is safe to pass in-process. */
function actorFrom(userRow: { id: string; email: string; displayName: string; preferredLocale: string; roles: string[] }): AuthenticatedPrincipal {
  return {
    id: userRow.id,
    email: userRow.email,
    displayName: userRow.displayName,
    preferredLocale: userRow.preferredLocale,
    roles: userRow.roles,
    permissions: [],
    organizationScopeIds: [],
    mustChangePassword: false,
  };
}

/**
 * ONE deliberate, narrowly-scoped exception to "everything goes through the real HTTP API":
 * bootstrapping the demo SYSTEM_ADMIN's role grant.
 *
 * Why it exists: by design (docs/DECISIONS.md, `AccessService.replaceRoles`/`updateUser`) role
 * grants require an authenticated actor who already holds `roles.assign`, self-modification is
 * blocked, and public self-registration (`POST /auth/register`) always grants zero roles.
 * schema.sql seeds the role/permission catalogue itself but never a default admin user, so on a
 * freshly-created database there is no HTTP-reachable way to mint the first admin at all — a
 * genuine chicken-and-egg gap in the product (see OQ-08/roadmap Session 27), not something a
 * seed script should route around silently.
 *
 * What this does instead: it registers the demo admin account through the real
 * `POST /auth/register` endpoint (so the account and its password hash are created by the real
 * service, exactly like any organic signup), then calls `AccessService.replaceRoles` directly,
 * in-process, to grant it SYSTEM_ADMIN. This runs the exact same transaction, validation and
 * audit-record code path a real `PUT /users/:id/roles` request would run — it only skips the
 * HTTP-layer `@Permissions` guard. The granting actor is:
 *   - an already-existing active SYSTEM_ADMIN, if this database has one (looked up in-process;
 *     no password needed, since the call never goes over HTTP as that user), or
 *   - a second freshly-registered demo account, only when the database truly has zero admins.
 * It no-ops as soon as the demo admin already holds SYSTEM_ADMIN (checked via a real
 * `GET /auth/me` call), and refuses outright outside development/test environments. Every other
 * seeded record — including every role/scope grant for every other demo account — goes through
 * real, permission-checked HTTP calls using the token this produces.
 */
export async function bootstrapFirstAdmin(
  app: INestApplication,
  client: SeedHttpClient,
  log: (message: string) => void,
): Promise<void> {
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('nodeEnv') ?? process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') {
    throw new Error(
      'Refusing to bootstrap a demo SYSTEM_ADMIN: NODE_ENV=production. The demo seed system is for development/test environments only.',
    );
  }

  await client.register({
    email: bootstrapAdmin.email,
    displayName: bootstrapAdmin.displayName,
    preferredLocale: bootstrapAdmin.preferredLocale,
    password: DEMO_PASSWORD,
  });

  await client.loginAs('admin', bootstrapAdmin.email, DEMO_PASSWORD);
  const adminPrincipal = await client.get('auth/me', 'admin');
  if ((adminPrincipal.roles as string[]).includes('SYSTEM_ADMIN')) {
    log(`Demo admin (${bootstrapAdmin.email}) already holds SYSTEM_ADMIN — skipping bootstrap grant.`);
    return;
  }

  const accessService = app.get(AccessService);
  const existingAdmins = await accessService.listUsers({
    page: 1,
    pageSize: 1,
    role: RoleCode.SYSTEM_ADMIN,
    status: UserStatus.ACTIVE,
  });

  let actor: AuthenticatedPrincipal;
  if (existingAdmins.page.totalItems > 0 && existingAdmins.items[0].id !== adminPrincipal.id) {
    const existing = existingAdmins.items[0];
    log(`An active SYSTEM_ADMIN already exists (${existing.email}) — using it as the in-process granting actor.`);
    actor = actorFrom(existing);
  } else {
    log('No active SYSTEM_ADMIN exists yet — registering a second demo account to act as the granting actor.');
    await client.register({
      email: bootstrapActor.email,
      displayName: bootstrapActor.displayName,
      preferredLocale: bootstrapActor.preferredLocale,
      password: DEMO_PASSWORD,
    });
    await client.loginAs('bootstrap-actor', bootstrapActor.email, DEMO_PASSWORD);
    actor = await client.get('auth/me', 'bootstrap-actor');
  }

  log(`Granting SYSTEM_ADMIN to ${bootstrapAdmin.email} (in-process bootstrap exception).`);
  await accessService.replaceRoles(adminPrincipal.id, { roles: [RoleCode.SYSTEM_ADMIN] }, actor);
}
