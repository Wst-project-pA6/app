import { extensionForContentType, sniffContentType } from './file-signature.util';

describe('sniffContentType', () => {
  it('recognizes JPEG, PNG, WebP and PDF magic bytes', () => {
    expect(sniffContentType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
    expect(sniffContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffContentType(Buffer.from('%PDF-1.4', 'ascii'))).toBe('application/pdf');
    const webp = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP', 'ascii')]);
    expect(sniffContentType(webp)).toBe('image/webp');
  });

  it('returns null for unsupported or malformed content, including truncated buffers', () => {
    expect(sniffContentType(Buffer.from('not an image', 'ascii'))).toBeNull();
    expect(sniffContentType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffContentType(Buffer.alloc(0))).toBeNull();
    const fakeRiff = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0, 0, 0, 0]), Buffer.from('AVI ', 'ascii')]);
    expect(sniffContentType(fakeRiff)).toBeNull();
  });

  it('does not trust a declared extension embedded in bytes it does not otherwise match', () => {
    const fakeJpeg = Buffer.from('GIF89a-pretending-to-be-a.jpg', 'ascii');
    expect(sniffContentType(fakeJpeg)).toBeNull();
  });
});

describe('extensionForContentType', () => {
  it('maps each supported content type to a fixed extension', () => {
    expect(extensionForContentType('image/jpeg')).toBe('jpg');
    expect(extensionForContentType('image/png')).toBe('png');
    expect(extensionForContentType('image/webp')).toBe('webp');
    expect(extensionForContentType('application/pdf')).toBe('pdf');
  });
});
