import * as fs from 'node:fs';
import * as path from 'node:path';
import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../common/database/database.service';
import { SeedManifest } from './manifest';
import { DEMO_USERS } from './fixtures';

const DEMO_USER_EMAIL_PATTERN = 'demo.%@demo.wst.local';
const DEMO_CUSTOMER_EMAIL_PATTERN = '%@demo-customer.wst.local';
const DEMO_VIN_PATTERN = 'WST0%';
const DEMO_CODE_PATTERN = 'DEMO-%';
const DEMO_VENDOR_CODE_PATTERN = 'DEMO-VEND-%';
const DEMO_PART_SKU_PATTERN = 'DEMO-PART-%';
const DEMO_COURSE_CODE_PATTERN = 'DEMO-CRS-%';

const DEMO_USER_IDS = `(SELECT id FROM users WHERE email LIKE '${DEMO_USER_EMAIL_PATTERN}')`;
const DEMO_VEHICLE_IDS = `(SELECT id FROM vehicles WHERE vin LIKE '${DEMO_VIN_PATTERN}')`;
const DEMO_JOB_IDS = `(SELECT id FROM job_cards WHERE vehicle_id IN ${DEMO_VEHICLE_IDS})`;
const DEMO_VENDOR_IDS = `(SELECT id FROM vendors WHERE code LIKE '${DEMO_VENDOR_CODE_PATTERN}')`;
const DEMO_PO_IDS = `(SELECT id FROM purchase_orders WHERE vendor_id IN ${DEMO_VENDOR_IDS})`;
const DEMO_STORE_IDS = `(SELECT id FROM stores WHERE code LIKE '${DEMO_CODE_PATTERN}')`;
const DEMO_COURSE_IDS = `(SELECT id FROM courses WHERE code LIKE '${DEMO_COURSE_CODE_PATTERN}')`;
const DEMO_GROUP_IDS = `(SELECT id FROM training_groups WHERE course_id IN ${DEMO_COURSE_IDS})`;
const DEMO_STUDENT_IDS = `(SELECT id FROM students WHERE user_id IN ${DEMO_USER_IDS})`;
const DEMO_SCOPE_IDS = `(SELECT id FROM organization_scopes WHERE code LIKE '${DEMO_CODE_PATTERN}')`;

/**
 * schema.sql makes seven tables strictly append-only (job_stage_events, quality_checks,
 * stock_movements, part_issue_reversals, purchase_approvals, goods_receipts, audit_events —
 * `forbid_mutation()` trigger, "Table % is append-only"). Job creation always writes a
 * job_stage_events row and a received purchase order always has a goods_receipts row, so once a
 * demo seed has actually run, its whole operational chain — job_cards and everything a foreign
 * key RESTRICTs from deleting *them* (vehicle, customer), and purchase_orders and everything
 * downstream of a goods receipt (store, parts, vendor, stock balances/movements) — can never be
 * removed again, by anyone, through any path. This is a deliberate audit-integrity property of
 * the real system, not a gap in this reset script.
 *
 * So reset does not try to force it: it first checks, read-only, whether that immutable history
 * already exists. If it does, the entire operational chain (and its manifest entries) is left
 * completely untouched — deleting only some of it while leaving job_stage_events behind would
 * desync the manifest from the database (a "done" marker pointing at a row that no longer
 * exists), which is worse than deleting nothing. Only the training domain (which has no
 * append-only table anywhere in it) and the demo user accounts that never acted on locked rows
 * are ever removed.
 */
async function hasLockedJobHistory(database: DatabaseService): Promise<boolean> {
  const value = await database.queryValue<boolean>(
    `SELECT EXISTS (SELECT 1 FROM job_stage_events WHERE job_id IN ${DEMO_JOB_IDS}) AS exists`,
  );
  return value === true;
}

async function hasLockedPurchasingHistory(database: DatabaseService): Promise<boolean> {
  const value = await database.queryValue<boolean>(
    `SELECT EXISTS (
       SELECT 1 FROM goods_receipts WHERE purchase_order_id IN ${DEMO_PO_IDS}
       UNION ALL
       SELECT 1 FROM purchase_approvals WHERE purchase_order_id IN ${DEMO_PO_IDS}
       UNION ALL
       SELECT 1 FROM stock_movements WHERE store_id IN ${DEMO_STORE_IDS}
     ) AS exists`,
  );
  return value === true;
}

async function collectAttachmentStorageKeys(database: DatabaseService): Promise<string[]> {
  const rows = await database.query<{ object_storage_key: string }>(
    `SELECT object_storage_key FROM attachments WHERE uploaded_by IN ${DEMO_USER_IDS}`,
  );
  return rows.rows.map((row) => row.object_storage_key);
}

function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0];
}

function clearManifestPrefix(manifest: SeedManifest, prefix: string): void {
  for (const [key] of manifest.allEntries()) {
    if (key.startsWith(prefix)) manifest.delete(key);
  }
}

async function tryDelete(
  database: DatabaseService,
  sql: string,
  params: unknown[] | undefined,
  log: (message: string) => void,
): Promise<boolean> {
  try {
    await database.execute(sql, params);
    return true;
  } catch (error) {
    log(`  [retained, by design — see immutable-history note] ${describeFailure(error)}`);
    return false;
  }
}

export async function resetDemoData(
  appContext: INestApplicationContext,
  log: (message: string) => void,
): Promise<void> {
  const configService = appContext.get(ConfigService);
  const nodeEnv = configService.get<string>('nodeEnv') ?? process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') {
    throw new Error('Refusing to reset demo data: NODE_ENV=production.');
  }

  const database = appContext.get(DatabaseService);
  const manifest = SeedManifest.load();
  let cleared = 0;
  let retained = 0;

  // --- Training domain: no append-only table anywhere in it, always fully removable. ---
  const trainingStatements = [
    `DELETE FROM certificates WHERE enrollment_id IN (SELECT id FROM enrollments WHERE group_id IN ${DEMO_GROUP_IDS})`,
    `DELETE FROM assessment_evidence_attachments WHERE assessment_id IN (SELECT id FROM assessments WHERE student_id IN ${DEMO_STUDENT_IDS})`,
    `DELETE FROM assessments WHERE student_id IN ${DEMO_STUDENT_IDS}`,
    `DELETE FROM attendance_records WHERE student_id IN ${DEMO_STUDENT_IDS}`,
    `DELETE FROM conflict_overrides WHERE training_session_id IN (SELECT id FROM training_sessions WHERE group_id IN ${DEMO_GROUP_IDS})`,
    `DELETE FROM training_sessions WHERE group_id IN ${DEMO_GROUP_IDS}`,
    `DELETE FROM enrollments WHERE group_id IN ${DEMO_GROUP_IDS}`,
    `DELETE FROM training_groups WHERE course_id IN ${DEMO_COURSE_IDS}`,
    `DELETE FROM course_tasks WHERE course_id IN ${DEMO_COURSE_IDS}`,
    `DELETE FROM students WHERE user_id IN ${DEMO_USER_IDS}`,
    `DELETE FROM courses WHERE code LIKE '${DEMO_COURSE_CODE_PATTERN}'`,
    `DELETE FROM training_terms WHERE organization_scope_id IN ${DEMO_SCOPE_IDS}`,
  ];
  let trainingOk = true;
  for (const statement of trainingStatements) {
    const ok = await tryDelete(database, statement, undefined, log);
    if (ok) cleared += 1;
    else { trainingOk = false; retained += 1; }
  }
  if (trainingOk) {
    for (const prefix of ['training-term:', 'course:', 'student:', 'training-group:', 'training-session:', 'enrollment:']) {
      clearManifestPrefix(manifest, prefix);
    }
    log('Training domain fully cleared.');
  }

  // --- Job/vehicle/customer chain: all-or-nothing, gated on whether it is already locked. ---
  const jobsLocked = await hasLockedJobHistory(database);
  if (jobsLocked) {
    log('Job cards have append-only stage/quality history — the entire job/vehicle/customer chain is retained by design.');
    retained += 1;
  } else {
    const jobChainStatements = [
      `DELETE FROM quality_check_evidence_attachments WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE job_id IN ${DEMO_JOB_IDS})`,
      `DELETE FROM job_approval_evidence_attachments WHERE approval_id IN (SELECT id FROM job_approvals WHERE job_id IN ${DEMO_JOB_IDS})`,
      `DELETE FROM job_card_attachments WHERE job_id IN ${DEMO_JOB_IDS}`,
      `DELETE FROM payment_references WHERE invoice_id IN (SELECT id FROM invoices WHERE job_id IN ${DEMO_JOB_IDS})`,
      `DELETE FROM invoices WHERE job_id IN ${DEMO_JOB_IDS}`,
      `DELETE FROM part_issue_reversals WHERE part_issue_id IN (SELECT id FROM part_issues WHERE job_id IN ${DEMO_JOB_IDS})`,
      `DELETE FROM part_issues WHERE job_id IN ${DEMO_JOB_IDS}`,
      `DELETE FROM labor_entries WHERE job_id IN ${DEMO_JOB_IDS}`,
      `DELETE FROM sublet_entries WHERE job_id IN ${DEMO_JOB_IDS}`,
      `DELETE FROM job_approvals WHERE job_id IN ${DEMO_JOB_IDS}`,
      `DELETE FROM quality_checks WHERE job_id IN ${DEMO_JOB_IDS}`,
      `DELETE FROM work_items WHERE job_id IN ${DEMO_JOB_IDS}`,
      `DELETE FROM job_stage_events WHERE job_id IN ${DEMO_JOB_IDS}`,
      `DELETE FROM part_reservations WHERE job_id IN ${DEMO_JOB_IDS}`,
      `DELETE FROM service_reminders WHERE vehicle_id IN ${DEMO_VEHICLE_IDS}`,
      `DELETE FROM job_cards WHERE vehicle_id IN ${DEMO_VEHICLE_IDS}`,
      `DELETE FROM vehicles WHERE vin LIKE '${DEMO_VIN_PATTERN}'`,
      `DELETE FROM customers WHERE email LIKE '${DEMO_CUSTOMER_EMAIL_PATTERN}'`,
    ];
    let ok = true;
    for (const statement of jobChainStatements) {
      const succeeded = await tryDelete(database, statement, undefined, log);
      if (!succeeded) ok = false;
    }
    if (ok) {
      cleared += jobChainStatements.length;
      for (const prefix of ['job:', 'vehicle:', 'customer:']) clearManifestPrefix(manifest, prefix);
      log('Job/vehicle/customer chain fully cleared.');
    } else {
      retained += 1;
      log('Job/vehicle/customer chain partially blocked mid-way — leaving all of it and its manifest entries untouched to avoid desyncing them.');
    }
  }

  // --- Purchasing/inventory chain: same all-or-nothing gating. ---
  const purchasingLocked = await hasLockedPurchasingHistory(database);
  if (purchasingLocked) {
    log('Purchase orders/stock movements have append-only history — the entire purchasing/inventory chain is retained by design.');
    retained += 1;
  } else {
    const purchasingStatements = [
      `DELETE FROM stock_adjustments WHERE store_id IN ${DEMO_STORE_IDS}`,
      `DELETE FROM goods_receipts WHERE purchase_order_id IN ${DEMO_PO_IDS}`,
      `DELETE FROM purchase_orders WHERE vendor_id IN ${DEMO_VENDOR_IDS}`,
      `DELETE FROM stock_movements WHERE store_id IN ${DEMO_STORE_IDS}`,
      `DELETE FROM stock_balances WHERE store_id IN ${DEMO_STORE_IDS}`,
      `DELETE FROM parts WHERE sku LIKE '${DEMO_PART_SKU_PATTERN}'`,
      `DELETE FROM stores WHERE code LIKE '${DEMO_CODE_PATTERN}'`,
      `DELETE FROM vendors WHERE code LIKE '${DEMO_VENDOR_CODE_PATTERN}'`,
    ];
    let ok = true;
    for (const statement of purchasingStatements) {
      const succeeded = await tryDelete(database, statement, undefined, log);
      if (!succeeded) ok = false;
    }
    if (ok) {
      cleared += purchasingStatements.length;
      for (const prefix of ['purchase-order:', 'stock-adjustment:', 'stock-level:', 'part:', 'store:', 'vendor:']) {
        clearManifestPrefix(manifest, prefix);
      }
      log('Purchasing/inventory chain fully cleared.');
    } else {
      retained += 1;
      log('Purchasing/inventory chain partially blocked mid-way — leaving all of it and its manifest entries untouched to avoid desyncing them.');
    }
  }

  // --- Bays: only ever SET NULL from job_cards, and training_sessions was already handled above. ---
  if (await tryDelete(database, `DELETE FROM bays WHERE code LIKE '${DEMO_CODE_PATTERN}'`, undefined, log)) {
    cleared += 1;
    clearManifestPrefix(manifest, 'bay:');
  } else {
    retained += 1;
  }

  // --- Attachments: only ever blocked by the link tables already handled above. ---
  const storageKeys = await collectAttachmentStorageKeys(database);
  const attachmentsCleared = await tryDelete(database, `DELETE FROM attachments WHERE uploaded_by IN ${DEMO_USER_IDS}`, undefined, log);
  if (attachmentsCleared) cleared += 1; else retained += 1;

  // --- Users: one at a time — several are blocked (they acted on rows that must stay
  // immutable) while others are perfectly safe to remove, and a single combined DELETE would
  // abort entirely on the first blocked row instead of removing the rest. ---
  const userRows = await database.query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE email LIKE '${DEMO_USER_EMAIL_PATTERN}'`,
  );
  for (const user of userRows.rows) {
    await tryDelete(database, 'DELETE FROM refresh_tokens WHERE user_id = $1', [user.id], log);
    const fixture = DEMO_USERS.find((u) => u.email === user.email);
    const ok = await tryDelete(database, 'DELETE FROM users WHERE id = $1', [user.id], log);
    if (ok) {
      cleared += 1;
      // Users have no id-bearing manifest entry (their id is resolved fresh via GET /auth/me on
      // every run) — the role/scope "done" markers are the only thing to clear so a reseed
      // re-grants them to the freshly re-created account instead of skipping the grant.
      if (fixture) {
        manifest.delete(`access:roles:${fixture.key}`);
        manifest.delete(`access:scopes:${fixture.key}`);
      }
    } else {
      retained += 1;
    }
  }

  // --- Organization scopes: only blocked by customers/bays/stores/training_terms, all handled above. ---
  if (await tryDelete(database, `DELETE FROM organization_scopes WHERE code LIKE '${DEMO_CODE_PATTERN}'`, undefined, log)) {
    cleared += 1;
    clearManifestPrefix(manifest, 'scope:');
  } else {
    retained += 1;
  }

  if (attachmentsCleared && storageKeys.length > 0) {
    const storageDir = configService.get<string>('attachments.storageDir') ?? 'storage/attachments';
    const baseDir = path.isAbsolute(storageDir) ? storageDir : path.join(process.cwd(), storageDir);
    log(`Removing ${storageKeys.length} demo attachment file(s) from local storage...`);
    for (const key of storageKeys) {
      try {
        fs.rmSync(path.join(baseDir, key), { force: true });
      } catch {
        // Best-effort cleanup only.
      }
    }
  }

  log(
    `Reset finished: ${cleared} statement(s) applied, ${retained} group(s) retained by design ` +
      '(append-only audit history — see the notes above and docs/DEMO_SEED.md). ' +
      'The manifest was trimmed to match: prefixes for removed domains are gone, entries for retained domains are kept so the next `npm run seed` reuses them instead of duplicating.',
  );
}
