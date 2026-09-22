import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttachmentStorage } from './attachment-storage';

/**
 * Private, filesystem-backed object storage for attachments (OQ-02: local disk chosen for
 * this session; the AttachmentStorage interface lets a real object-storage provider replace
 * this later without touching callers). Files are written under a private directory that is
 * never served directly by any HTTP route — content only ever leaves this class through
 * `get()`, called by the signed-download route after the caller's token is verified.
 */
@Injectable()
export class LocalAttachmentStorage implements AttachmentStorage {
  constructor(private readonly configService: ConfigService) {}

  private get baseDir(): string {
    const configured = this.configService.get<string>('attachments.storageDir') ?? 'storage/attachments';
    const resolved = path.resolve(path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured));
    this.assertSafeDirectory(configured, resolved);
    return resolved;
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<void> {
    void _contentType;
    await mkdir(this.baseDir, { recursive: true });
    const finalPath = this.resolve(key);
    const tempPath = `${finalPath}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(tempPath, data, { mode: 0o600 });
    await rename(tempPath, finalPath);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  /** Confines every read/write to a single named file directly inside baseDir. */
  private resolve(key: string): string {
    const safeKey = path.basename(key);
    if (!safeKey || safeKey === '.' || safeKey === '..') {
      throw new Error(`Refusing to resolve an unsafe attachment storage key: ${key}`);
    }
    return path.join(this.baseDir, safeKey);
  }

  /**
   * Refuses to use a storage directory broad enough that a stray write could reach the
   * repository, the user's home directory, or a filesystem root — configuration mistakes
   * this severe must fail loudly rather than silently write outside the intended sandbox.
   */
  private assertSafeDirectory(configuredValue: string, resolved: string): void {
    if (!configuredValue.trim()) {
      throw new Error('ATTACHMENTS_STORAGE_DIR must not be empty');
    }
    const unsafe = new Set(
      [process.cwd(), os.homedir(), os.tmpdir(), path.parse(resolved).root]
        .map((candidate) => path.resolve(candidate)),
    );
    if (unsafe.has(resolved)) {
      throw new Error(`Refusing to use an unsafe attachments storage directory: ${resolved}`);
    }
  }
}
