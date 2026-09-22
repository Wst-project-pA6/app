const FALLBACK_NAME = 'file';
const MAX_LENGTH = 200;

/**
 * Sanitizes a user-supplied file name for safe storage as metadata only.
 * Strips path separators, control characters and leading dots/whitespace so the value can
 * never be (mis)used as a storage key or traverse a directory. The result is never itself
 * used to address storage — object keys are always server-generated.
 */
function isControlCharacter(codePoint: number): boolean {
  return codePoint <= 0x1f || codePoint === 0x7f;
}

export function sanitizeFileName(originalName: string | undefined): string {
  const base = (originalName ?? '').split(/[/\\]/u).pop() ?? '';
  const withoutControlChars = Array.from(base)
    .filter((char) => !isControlCharacter(char.codePointAt(0) ?? 0))
    .join('');
  const stripped = withoutControlChars.replace(/^[.\s]+/u, '').trim();
  const safe = stripped.length > 0 ? stripped : FALLBACK_NAME;
  return safe.slice(0, MAX_LENGTH);
}
