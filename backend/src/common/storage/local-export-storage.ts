import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttachmentStorage } from './attachment-storage';

export const EXPORT_STORAGE = Symbol('EXPORT_STORAGE');

/**
 * Private, filesystem-backed object storage for generated export files (CSV/PDF), following the
 * exact same pattern as LocalAttachmentStorage: a private directory never served directly by any
 * HTTP route, content only ever leaves through `get()` after a signed download token is
 * verified. Kept as its own small class (rather than parameterizing LocalAttachmentStorage)
 * so the already-tested attachments storage code path is untouched by this session's work.
 */
@Injectable()
export class LocalExportStorage implements AttachmentStorage {
  constructor(private readonly configService: ConfigService) {}

  private get baseDir(): string {
    const configured = this.configService.get<string>('exports.storageDir') ?? 'storage/exports';
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

  private resolve(key: string): string {
    const safeKey = path.basename(key);
    if (!safeKey || safeKey === '.' || safeKey === '..') {
      throw new Error(`Refusing to resolve an unsafe export storage key: ${key}`);
    }
    return path.join(this.baseDir, safeKey);
  }

  private assertSafeDirectory(configuredValue: string, resolved: string): void {
    if (!configuredValue.trim()) {
      throw new Error('EXPORTS_STORAGE_DIR must not be empty');
    }
    const unsafe = new Set(
      [process.cwd(), os.homedir(), os.tmpdir(), path.parse(resolved).root]
        .map((candidate) => path.resolve(candidate)),
    );
    if (unsafe.has(resolved)) {
      throw new Error(`Refusing to use an unsafe exports storage directory: ${resolved}`);
    }
  }
}
