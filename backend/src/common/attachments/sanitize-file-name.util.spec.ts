import { sanitizeFileName } from './sanitize-file-name.util';

describe('sanitizeFileName', () => {
  it('strips directory components so a path cannot be smuggled in as a file name', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Windows\\System32\\evil.exe')).toBe('evil.exe');
  });

  it('strips control characters and leading dots/whitespace', () => {
    expect(sanitizeFileName('\u0000\u0007bad\u007f.jpg')).toBe('bad.jpg');
    expect(sanitizeFileName('  ...leading.png')).toBe('leading.png');
  });

  it('falls back to a default name for empty or undefined input', () => {
    expect(sanitizeFileName(undefined)).toBe('file');
    expect(sanitizeFileName('')).toBe('file');
    expect(sanitizeFileName('   ')).toBe('file');
  });

  it('truncates to 200 characters', () => {
    const longName = `${'a'.repeat(250)}.jpg`;
    expect(sanitizeFileName(longName).length).toBe(200);
  });

  it('preserves an already-safe name unchanged', () => {
    expect(sanitizeFileName('front-bumper-damage.jpg')).toBe('front-bumper-damage.jpg');
  });
});
