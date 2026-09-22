import { AttachmentStorage } from './attachment-storage';

/**
 * In-memory AttachmentStorage for unit tests. Never touches disk or a network — satisfies the
 * "no real object-storage connection" testing constraint while exercising the same interface
 * the application code depends on.
 */
export class TestAttachmentStorage implements AttachmentStorage {
  readonly objects = new Map<string, { data: Buffer; contentType: string }>();
  readonly removedKeys: string[] = [];

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { data, contentType });
  }

  async get(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) throw new Error(`No such object: ${key}`);
    return object.data;
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key);
    this.removedKeys.push(key);
  }
}
