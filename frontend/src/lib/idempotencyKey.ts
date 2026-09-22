/**
 * Generates a fresh idempotency key for write operations the contract marks
 * with an `Idempotency-Key` header (part issues, reversals, reservations,
 * stock adjustments, goods receipts). A new key per submit attempt lets a
 * retried request be recognized as a duplicate by the backend rather than
 * double-applying a stock change.
 */
export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
