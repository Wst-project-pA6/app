import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Persists the mapping from a deterministic synthetic key (e.g. "customer:ahmed-hassan") to the
 * id the real API returned when that record was created. Reruns look a key up here first and,
 * if found, verify the id still resolves via a real GET before reusing it — this is what makes
 * `npm run seed` safe to run repeatedly without creating duplicate rows for domains (customers,
 * vehicles, job cards, training terms/groups) that have no database-level uniqueness constraint
 * to fall back on. Never edit this file by hand; `npm run seed:reset` deletes it together with
 * the rows it points at so the two never drift apart.
 */
export class SeedManifest {
  private readonly filePath: string;
  private data: Record<string, string>;

  private constructor(filePath: string, data: Record<string, string>) {
    this.filePath = filePath;
    this.data = data;
  }

  static load(filePath = path.join(process.cwd(), 'storage', 'seed', 'manifest.json')): SeedManifest {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return new SeedManifest(filePath, parsed as Record<string, string>);
      }
    } catch {
      // No manifest yet, or it is unreadable/corrupt — start fresh.
    }
    return new SeedManifest(filePath, {});
  }

  get(key: string): string | undefined {
    return this.data[key];
  }

  set(key: string, id: string): void {
    this.data[key] = id;
    this.save();
  }

  delete(key: string): void {
    delete this.data[key];
    this.save();
  }

  allEntries(): Array<[string, string]> {
    return Object.entries(this.data);
  }

  static resetPath(filePath = path.join(process.cwd(), 'storage', 'seed', 'manifest.json')): void {
    try {
      fs.rmSync(filePath, { force: true });
    } catch {
      // Nothing to remove.
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }
}
