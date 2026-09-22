import { SeedContext } from './context';
import { SeedApiError } from './http-client';

export interface EnsureCreatedOptions {
  /**
   * Confirms a cached manifest id still resolves via a real GET. Omit for resources with no
   * single-item GET endpoint (several list-only resources in this API, e.g. organization-scopes,
   * bays, stores, vendors, training-terms, courses, training-groups, stock-adjustments) — a
   * cached id for those is trusted without a live check.
   */
  verify?: (id: string) => Promise<boolean>;
  /**
   * Recovers the existing id when `create()` throws a 409 (a unique-constraint conflict, e.g. on
   * code/sku/email) and there was no cached id to begin with — typically a list-and-find lookup,
   * since several of these resources also have no single-item GET. Omit for resources with no
   * database uniqueness constraint on the fields this seed sends (their manifest entry is the
   * only duplication guard — see docs/DEMO_SEED.md).
   */
  recoverOnDuplicate?: () => Promise<string>;
  /**
   * Tried before create(), only when there is no cached manifest id at all — a search against a
   * natural-key filter the list endpoint actually supports (e.g. vehicles' exact `vin` filter,
   * customers' exact `phone` filter). Self-heals a lost/rebuilt manifest for resources with no
   * database uniqueness constraint (so `recoverOnDuplicate` never fires) by finding the row this
   * seed already created on a previous run instead of blindly creating a duplicate.
   */
  findExisting?: () => Promise<string | null>;
  create: () => Promise<{ id: string }>;
}

/**
 * Looks `manifestKey` up in the manifest and, when possible, verifies it before reusing it;
 * otherwise creates the resource (a real POST) and records the new id. This is the core
 * idempotency primitive every domain step builds on.
 */
export async function ensureCreated(
  ctx: SeedContext,
  manifestKey: string,
  options: EnsureCreatedOptions,
): Promise<{ id: string; created: boolean }> {
  const cachedId = ctx.manifest.get(manifestKey);
  if (cachedId) {
    if (!options.verify) return { id: cachedId, created: false };
    const stillExists = await options.verify(cachedId);
    if (stillExists) return { id: cachedId, created: false };
    ctx.log(`Manifest entry "${manifestKey}" -> ${cachedId} no longer resolves via the API; recreating.`);
  } else if (options.findExisting) {
    const foundId = await options.findExisting();
    if (foundId) {
      ctx.manifest.set(manifestKey, foundId);
      return { id: foundId, created: false };
    }
  }

  try {
    const created = await options.create();
    ctx.manifest.set(manifestKey, created.id);
    return { id: created.id, created: true };
  } catch (error) {
    if (error instanceof SeedApiError && error.status === 409 && options.recoverOnDuplicate) {
      const id = await options.recoverOnDuplicate();
      ctx.manifest.set(manifestKey, id);
      return { id, created: false };
    }
    throw error;
  }
}

/** Marks a step (an action with no natural "GET by id" to verify, e.g. a decision or transition) as done. */
export function isDone(ctx: SeedContext, manifestKey: string): boolean {
  return ctx.manifest.get(manifestKey) === 'done';
}

export function markDone(ctx: SeedContext, manifestKey: string): void {
  ctx.manifest.set(manifestKey, 'done');
}

/** Runs `fn` (a single non-idempotent API call, e.g. a decision or a transition) only once. */
export async function step(ctx: SeedContext, manifestKey: string, fn: () => Promise<void>): Promise<void> {
  if (isDone(ctx, manifestKey)) return;
  await fn();
  markDone(ctx, manifestKey);
}

/** Finds a resource's id by an exact field match against a (list-endpoint) page of results. */
export async function findIdByField(
  ctx: SeedContext,
  path: string,
  actorKey: string,
  field: string,
  value: string,
  query?: Record<string, string | number>,
): Promise<string> {
  const page = await ctx.client.get(path, actorKey, { ...query, pageSize: 100 });
  const match = (page.items as Array<Record<string, unknown>>).find((item) => item[field] === value);
  if (!match) throw new Error(`Could not find existing ${path} with ${field}=${value} after a 409 conflict`);
  return match.id as string;
}
