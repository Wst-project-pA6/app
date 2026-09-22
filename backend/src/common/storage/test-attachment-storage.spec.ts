import { TestAttachmentStorage } from './test-attachment-storage';

describe('TestAttachmentStorage', () => {
  it('stores bytes in memory and never touches disk or a network', async () => {
    const storage = new TestAttachmentStorage();
    const data = Buffer.from('hello');
    await storage.put('key1', data, 'image/jpeg');
    expect(storage.objects.get('key1')).toEqual({ data, contentType: 'image/jpeg' });
  });

  it('reads back exactly the bytes that were stored', async () => {
    const storage = new TestAttachmentStorage();
    const data = Buffer.from('hello');
    await storage.put('key1', data, 'image/jpeg');
    await expect(storage.get('key1')).resolves.toEqual(data);
  });

  it('rejects reading a key that was never stored (or already removed)', async () => {
    const storage = new TestAttachmentStorage();
    await expect(storage.get('missing')).rejects.toThrow();
  });

  it('removes stored objects and records the removal', async () => {
    const storage = new TestAttachmentStorage();
    await storage.put('key1', Buffer.from('x'), 'image/png');
    await storage.remove('key1');
    expect(storage.objects.has('key1')).toBe(false);
    expect(storage.removedKeys).toEqual(['key1']);
    await expect(storage.get('key1')).rejects.toThrow();
  });
});
