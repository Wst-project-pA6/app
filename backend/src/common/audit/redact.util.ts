export const REDACTED = '[REDACTED]';

/**
 * Field names (matched case-insensitively after stripping non-letters) that must never
 * appear in plain text in an audit event. Centralized here so every writer of
 * AuditEvent.changes redacts the same way instead of each caller inventing its own rule.
 */
const SENSITIVE_FIELD_MARKERS = [
  'password',
  'passwordhash',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'secret',
  'storagekey',
  'objectstoragekey',
  'token',
];

function isSensitiveFieldName(field: string): boolean {
  const normalized = field.toLowerCase().replace(/[^a-z]/gu, '');
  return SENSITIVE_FIELD_MARKERS.some((marker) => normalized.includes(marker));
}

/**
 * Recursively redacts any object/array key matching a sensitive marker, replacing only that
 * key's value with REDACTED. Never mutates its input — every level that needs a change is
 * copied first, and untouched branches return the original reference unchanged, so a caller
 * that reads a row straight from `pg` can never have that row mutated in place.
 */
function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const mapped = value.map((entry) => {
      const redactedEntry = redactValue(entry);
      if (redactedEntry !== entry) changed = true;
      return redactedEntry;
    });
    return changed ? mapped : value;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    let changed = false;
    const result: Record<string, unknown> = {};
    for (const [key, nested] of entries) {
      if (isSensitiveFieldName(key)) {
        result[key] = REDACTED;
        if (nested !== REDACTED) changed = true;
      } else {
        const redactedNested = redactValue(nested);
        result[key] = redactedNested;
        if (redactedNested !== nested) changed = true;
      }
    }
    return changed ? result : value;
  }
  return value;
}

/**
 * Redacts sensitive values from the `changes` payload before it is persisted to (or read
 * back from) the immutable audit_events table. Session 10 writers use a flat
 * `{ field, before, after }` shape where before/after may be a string or a nested object
 * (e.g. labor entry corrections). A change whose top-level `field` name is itself sensitive
 * has its whole before/after replaced; otherwise before/after are walked recursively so a
 * sensitive key nested inside an object value (e.g. `{ field: 'session', before: { token }
 * }`) is still caught. Never mutates the input array/objects — see redactValue.
 */
export function redactChanges(changes: unknown): unknown {
  if (!Array.isArray(changes)) return changes;
  return changes.map((change) => {
    if (typeof change !== 'object' || change === null) return change;
    const record = change as Record<string, unknown>;
    const field = record.field;
    const topLevelSensitive = typeof field === 'string' && isSensitiveFieldName(field);
    let changed = false;
    const redacted: Record<string, unknown> = { ...record };
    if ('before' in redacted) {
      const value = topLevelSensitive ? REDACTED : redactValue(redacted.before);
      if (value !== redacted.before) changed = true;
      redacted.before = value;
    }
    if ('after' in redacted) {
      const value = topLevelSensitive ? REDACTED : redactValue(redacted.after);
      if (value !== redacted.after) changed = true;
      redacted.after = value;
    }
    return changed ? redacted : change;
  });
}
