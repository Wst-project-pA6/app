import { SeedContext } from '../context';
import { ensureCreated, findIdByField } from '../idempotent';
import { DEMO_PASSWORD, DEMO_SCOPES, DEMO_USERS, bootstrapAdmin } from '../fixtures';

/**
 * Resolves the id of a demo user that already exists (a 409 from `createUserAsAdmin`) by
 * searching for their exact email via the admin-only `GET /users` listing.
 */
async function findExistingUserId(ctx: SeedContext, email: string): Promise<string> {
  const page = await ctx.client.get('users', 'admin', { q: email, pageSize: 20 });
  const match = (page.items as Array<{ id: string; email: string }>).find((u) => u.email === email);
  if (!match) throw new Error(`createUserAsAdmin() got 409 for ${email} but GET /users?q= could not find it`);
  return match.id;
}

export async function seedAccess(ctx: SeedContext): Promise<void> {
  const { client } = ctx;

  ctx.log('Creating organization scopes...');
  for (const scope of DEMO_SCOPES) {
    const result = await ensureCreated(ctx, `scope:${scope.key}`, {
      create: () => client.post('organization-scopes', 'admin', { code: scope.code, name: scope.name, type: scope.type }, [201]),
      recoverOnDuplicate: () => findIdByField(ctx, 'organization-scopes', 'admin', 'code', scope.code),
    });
    ctx.ids.scopes[scope.key] = result.id;
  }
  const allScopeIds = Object.values(ctx.ids.scopes);

  ctx.log('Creating demo user accounts...');
  for (const user of DEMO_USERS) {
    if (user.key === bootstrapAdmin.key) {
      // Already exists: registered via the real public /auth/register endpoint and logged in by
      // bootstrap-admin.ts (its token is already cached under the 'admin' actor key).
      const principal = await client.get('auth/me', 'admin');
      ctx.ids.users[user.key] = principal.id as string;
      continue;
    }

    // Admin-created (POST /users), not self-registration: more realistic for staff/student
    // accounts provisioned by a workshop admin, and it avoids the public /auth/register
    // endpoint's per-IP rate limit (10/hour) that a dozen self-registrations would exceed.
    const created = await client.createUserAsAdmin({
      email: user.email,
      displayName: user.displayName,
      preferredLocale: user.preferredLocale,
      temporaryPassword: DEMO_PASSWORD,
    });
    const userId = created ? created.id : await findExistingUserId(ctx, user.email);
    ctx.ids.users[user.key] = userId;

    await client.loginAs(user.key, user.email, DEMO_PASSWORD);
  }

  ctx.log('Granting roles and organization scopes to demo users...');
  for (const user of DEMO_USERS) {
    const userId = ctx.ids.users[user.key];
    const rolesKey = `access:roles:${user.key}`;
    if (ctx.manifest.get(rolesKey) !== 'done') {
      if (user.key === bootstrapAdmin.key) {
        // Self-role-assignment is blocked (SEPARATION_OF_DUTIES_VIOLATION) and unnecessary here:
        // bootstrap-admin.ts already granted SYSTEM_ADMIN via the documented in-process exception.
        ctx.manifest.set(rolesKey, 'done');
      } else {
        await client.put(`users/${userId}/roles`, 'admin', { roles: [user.role] });
        ctx.manifest.set(rolesKey, 'done');
      }
    }
    const scopesKey = `access:scopes:${user.key}`;
    if (ctx.manifest.get(scopesKey) !== 'done') {
      await client.put(`users/${userId}/organization-scopes`, 'admin', { organizationScopeIds: allScopeIds });
      ctx.manifest.set(scopesKey, 'done');
    }
  }

  ctx.log(`Demo access ready: ${DEMO_USERS.length} users across ${DEMO_SCOPES.length} organization scopes.`);
}
