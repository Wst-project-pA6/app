export type SniffedContentType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];

function startsWith(buffer: Buffer, magic: number[]): boolean {
  if (buffer.length < magic.length) return false;
  return magic.every((byte, index) => buffer[index] === byte);
}

/**
 * Sniffs the actual file type from its magic bytes/content signature, independent of any
 * declared Content-Type header. Returns null when the content does not match a supported type.
 */
export function sniffContentType(buffer: Buffer): SniffedContentType | null {
  if (startsWith(buffer, JPEG_MAGIC)) return 'image/jpeg';
  if (startsWith(buffer, PNG_MAGIC)) return 'image/png';
  if (startsWith(buffer, PDF_MAGIC)) return 'application/pdf';
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

const EXTENSIONS_BY_CONTENT_TYPE: Record<SniffedContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Server-chosen extension for a validated content type — never derived from the client's file name. */
export function extensionForContentType(contentType: SniffedContentType): string {
  return EXTENSIONS_BY_CONTENT_TYPE[contentType];
}
