import { readFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { LocalExportStorage } from './local-export-storage';

function makeStorage(dir: string): LocalExportStorage {
  const configService = { get: (key: string) => (key === 'exports.storageDir' ? dir : undefined) };
  return new LocalExportStorage(configService as never);
}

describe('LocalExportStorage', () => {
  let dir: string;
  let storage: LocalExportStorage;

  beforeEach(() => {
    dir = path.join(os.tmpdir(), `wst-exports-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    storage = makeStorage(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes the exact bytes under a server-chosen key, ignoring path separators in the key', async () => {
    await storage.put('../escape.csv', Buffer.from('a,b\n1,2\n'), 'text/csv');
    const written = await readFile(path.join(dir, 'escape.csv'));
    expect(written.toString()).toBe('a,b\n1,2\n');
  });

  it('reads back exactly the bytes that were written', async () => {
    await storage.put('key1.pdf', Buffer.from('%PDF-1.4'), 'application/pdf');
    await expect(storage.get('key1.pdf')).resolves.toEqual(Buffer.from('%PDF-1.4'));
  });

  it('rejects a key that resolves to nothing but directory traversal', async () => {
    await expect(storage.get('..')).rejects.toThrow();
    await expect(storage.get('.')).rejects.toThrow();
  });

  it('removes an object so it can no longer be read', async () => {
    await storage.put('key1', Buffer.from('bytes'), 'text/csv');
    await storage.remove('key1');
    await expect(storage.get('key1')).rejects.toThrow();
  });

  it.each([
    ['the repository root (process.cwd())', () => process.cwd()],
    ['the user home directory', () => os.homedir()],
    ['the OS temp directory', () => os.tmpdir()],
    ['a filesystem root', () => path.parse(process.cwd()).root],
    ['an empty string', () => ''],
  ] as const)('refuses to use %s as the storage directory', async (_label, getUnsafeDir) => {
    const unsafeStorage = makeStorage(getUnsafeDir());
    await expect(unsafeStorage.put('key1', Buffer.from('x'), 'text/csv')).rejects.toThrow();
  });
});
