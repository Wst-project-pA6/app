import { readFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { LocalAttachmentStorage } from './local-attachment-storage';

function makeStorage(dir: string): LocalAttachmentStorage {
  const configService = { get: (key: string) => (key === 'attachments.storageDir' ? dir : 'test-secret') };
  return new LocalAttachmentStorage(configService as never);
}

describe('LocalAttachmentStorage', () => {
  let dir: string;
  let storage: LocalAttachmentStorage;

  beforeEach(() => {
    dir = path.join(os.tmpdir(), `wst-attachments-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    storage = makeStorage(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes the exact bytes under a server-chosen key, ignoring path separators in the key', async () => {
    await storage.put('../escape.jpg', Buffer.from('bytes'), 'image/jpeg');
    const written = await readFile(path.join(dir, 'escape.jpg'));
    expect(written.toString()).toBe('bytes');
  });

  it('reads back exactly the bytes that were written, confined to the same sanitized key', async () => {
    await storage.put('key1.jpg', Buffer.from('bytes'), 'image/jpeg');
    await expect(storage.get('../key1.jpg')).resolves.toEqual(Buffer.from('bytes'));
  });

  it('rejects a key that resolves to nothing but directory traversal', async () => {
    await expect(storage.get('..')).rejects.toThrow();
    await expect(storage.get('.')).rejects.toThrow();
  });

  it('removes an object so it can no longer be read', async () => {
    await storage.put('key1', Buffer.from('bytes'), 'image/png');
    await storage.remove('key1');
    await expect(readFile(path.join(dir, 'key1'))).rejects.toThrow();
    await expect(storage.get('key1')).rejects.toThrow();
  });

  it('removing a never-written key is a safe no-op', async () => {
    await expect(storage.remove('never-written')).resolves.toBeUndefined();
  });

  it.each([
    ['the repository root (process.cwd())', () => process.cwd()],
    ['the user home directory', () => os.homedir()],
    ['the OS temp directory', () => os.tmpdir()],
    ['a filesystem root', () => path.parse(process.cwd()).root],
    ['an empty string', () => ''],
  ] as const)('refuses to use %s as the storage directory', async (_label, getUnsafeDir) => {
    const unsafeStorage = makeStorage(getUnsafeDir());
    await expect(unsafeStorage.put('key1', Buffer.from('x'), 'image/png')).rejects.toThrow();
  });

  it('accepts a normal subdirectory even though it is under the temp directory', async () => {
    const safeSubdir = path.join(os.tmpdir(), `wst-safe-subdir-${Date.now()}`);
    const safeStorage = makeStorage(safeSubdir);
    await expect(safeStorage.put('key1', Buffer.from('x'), 'image/png')).resolves.toBeUndefined();
    await rm(safeSubdir, { recursive: true, force: true });
  });
});
