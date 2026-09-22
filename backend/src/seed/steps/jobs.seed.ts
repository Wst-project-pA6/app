import { SeedContext } from '../context';
import { ensureCreated, isDone, markDone, step } from '../idempotent';
import { CURRENCY } from '../fixtures';
import { generateSyntheticPhoto, Rgb } from '../png';

interface PartUsage {
  partKey: string;
  quantity: number;
}

interface AdditionalWork {
  description: string;
  parts?: PartUsage[];
}

type StopAtStage = 'RECEIVED' | 'READY' | 'DELIVERED';
/**
 * `POST /invoices/:id/payments` only ever accepts a single payment whose amount exactly equals
 * the invoice total (PAYMENT_AMOUNT_MISMATCH otherwise) — there is no partial-payment path in
 * this API, so "issued but not fully paid" is demonstrated by simply never recording a payment.
 */
type InvoicePlan = 'none' | 'draft' | 'issued-unpaid' | 'paid';

interface JobScenario {
  key: string;
  vehicleKey: string;
  complaint: string;
  serviceType: 'MAINTENANCE' | 'REPAIR' | 'DIAGNOSTIC' | 'INSPECTION' | 'OTHER';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  mileageAtIntake: number;
  workItems: string[];
  bayKey: string;
  technicianKey: string;
  parts: PartUsage[];
  additionalWork?: AdditionalWork;
  stopAtStage: StopAtStage;
  invoicePlan: InvoicePlan;
}

const SCENARIOS: JobScenario[] = [
  {
    key: 'job1',
    vehicleKey: 'veh1',
    complaint: 'Customer reports a squeaking noise from the front brakes when stopping.',
    serviceType: 'REPAIR',
    priority: 'NORMAL',
    mileageAtIntake: 42150,
    workItems: ['Inspect front brake pads and rotors', 'Replace front brake pads'],
    bayKey: 'bay1',
    technicianKey: 'tech1',
    parts: [{ partKey: 'brake-pads-front', quantity: 1 }],
    stopAtStage: 'DELIVERED',
    invoicePlan: 'paid',
  },
  {
    key: 'job2',
    vehicleKey: 'veh2',
    complaint: 'Routine maintenance visit: oil and oil filter change.',
    serviceType: 'MAINTENANCE',
    priority: 'LOW',
    mileageAtIntake: 58200,
    workItems: ['Replace engine oil', 'Replace oil filter'],
    bayKey: 'bay2',
    technicianKey: 'tech2',
    parts: [
      { partKey: 'engine-oil', quantity: 4 },
      { partKey: 'oil-filter', quantity: 1 },
    ],
    stopAtStage: 'DELIVERED',
    invoicePlan: 'issued-unpaid',
  },
  {
    key: 'job3',
    vehicleKey: 'veh3',
    complaint: 'Check engine light is on; customer requests a diagnostic scan.',
    serviceType: 'DIAGNOSTIC',
    priority: 'NORMAL',
    mileageAtIntake: 21050,
    workItems: ['Run diagnostic scan', 'Inspect and clean spark plugs'],
    bayKey: 'bay2',
    technicianKey: 'tech1',
    parts: [{ partKey: 'spark-plug', quantity: 4 }],
    stopAtStage: 'READY',
    invoicePlan: 'draft',
  },
  {
    key: 'job4',
    vehicleKey: 'veh4',
    complaint: 'Fleet vehicle: air conditioning compressor is not engaging.',
    serviceType: 'REPAIR',
    priority: 'HIGH',
    mileageAtIntake: 91250,
    workItems: ['Diagnose AC compressor fault', 'Replace cabin/engine air filter'],
    bayKey: 'bay3',
    technicianKey: 'tech2',
    parts: [{ partKey: 'air-filter', quantity: 1 }],
    additionalWork: {
      description: 'Spark plugs found worn during inspection; customer approved replacement.',
      parts: [{ partKey: 'spark-plug', quantity: 4 }],
    },
    stopAtStage: 'DELIVERED',
    invoicePlan: 'paid',
  },
];

/** Left queued at RECEIVED with only a pending (undecided) approval — demonstrates the pending-approval workflow. */
const PENDING_SCENARIO = {
  key: 'job5',
  vehicleKey: 'veh5',
  complaint: 'Customer requests front tire replacement; awaiting customer approval on cost.',
  serviceType: 'REPAIR' as const,
  priority: 'NORMAL' as const,
  mileageAtIntake: 103400,
  workItems: ['Replace front tires'],
};

const PHOTO_COLORS: Record<string, { background: Rgb; body: Rgb; label: Rgb }> = {
  job1: { background: { r: 235, g: 240, b: 245 }, body: { r: 40, g: 90, b: 200 }, label: { r: 20, g: 20, b: 20 } },
  job2: { background: { r: 235, g: 240, b: 245 }, body: { r: 200, g: 40, b: 40 }, label: { r: 20, g: 20, b: 20 } },
  job3: { background: { r: 235, g: 240, b: 245 }, body: { r: 60, g: 150, b: 70 }, label: { r: 20, g: 20, b: 20 } },
  job4: { background: { r: 235, g: 240, b: 245 }, body: { r: 120, g: 120, b: 120 }, label: { r: 20, g: 20, b: 20 } },
  job5: { background: { r: 235, g: 240, b: 245 }, body: { r: 230, g: 190, b: 40 }, label: { r: 20, g: 20, b: 20 } },
};

function isoInMinutes(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getWorkItemIds(ctx: SeedContext, jobId: string): Promise<Array<{ id: string; description: string }>> {
  const list = await ctx.client.get(`job-cards/${jobId}/work-items`, 'advisor', { pageSize: 50 });
  return list.items as Array<{ id: string; description: string }>;
}

async function uploadAndLinkPhoto(
  ctx: SeedContext,
  jobId: string,
  scenarioKey: string,
  suffix: string,
): Promise<void> {
  const key = `job:${scenarioKey}:photo:${suffix}`;
  if (isDone(ctx, key)) return;
  const colors = PHOTO_COLORS[scenarioKey];
  const buffer = generateSyntheticPhoto(320, 240, colors.background, colors.body, colors.label);
  const attachment = await ctx.client.uploadAttachment('advisor', 'JOB_PHOTO', {
    fieldName: 'file',
    buffer,
    fileName: `${scenarioKey}-${suffix}.png`,
    contentType: 'image/png',
  });
  await ctx.client.post(`job-cards/${jobId}/attachments`, 'advisor', { attachmentIds: [attachment.id] }, [200]);
  markDone(ctx, key);
}

async function recordInitialApproval(ctx: SeedContext, scenario: { key: string }, jobId: string): Promise<void> {
  const createKey = `job:${scenario.key}:approval:initial`;
  const approvalId = ctx.manifest.get(createKey);
  let id = approvalId;
  if (!id) {
    const approval = await ctx.client.post(`job-cards/${jobId}/approvals`, 'advisor', {
      scope: 'INITIAL_WORK',
      description: 'Customer approved the initial diagnosis and quoted work over the phone.',
    });
    id = approval.id as string;
    ctx.manifest.set(createKey, id);
  }
  await step(ctx, `job:${scenario.key}:approval:initial:decided`, async () => {
    await ctx.client.post(`job-cards/${jobId}/approvals/${id}/decision`, 'advisor', {
      decision: 'APPROVED',
      method: 'PHONE',
      approvedByName: 'Customer (phone confirmation)',
      notes: 'Approved verbally; recorded by service advisor.',
    });
  });
}

/**
 * A job recovered via `findExisting` (manifest lost, e.g. after a rebuilt/cleared manifest.json)
 * only has its top-level id restored — none of its per-step "done" markers. Re-running every
 * step unconditionally would either duplicate harmless records (a second photo, a second labor
 * entry) or hit a hard state-machine error (re-transitioning a stage, re-issuing an invoice).
 * This inspects the job's actual current state via the real API and pre-marks the state-machine
 * steps (transitions, approval decisions) so only what is genuinely still missing gets (re)run.
 */
async function reconcileRecoveredJob(ctx: SeedContext, scenario: JobScenario, jobId: string): Promise<void> {
  const { client } = ctx;
  const current = await client.get(`job-cards/${jobId}`, 'advisor');
  const stage = current.stage as string;
  const stageOrder = ['RECEIVED', 'IN_PROGRESS', 'QUALITY_CHECK', 'READY', 'DELIVERED'];
  const reached = (target: string) => stageOrder.indexOf(stage) >= stageOrder.indexOf(target);

  if (reached('IN_PROGRESS')) {
    markDone(ctx, `job:${scenario.key}:assigned`);
    markDone(ctx, `job:${scenario.key}:transition:in-progress`);
  }
  if (reached('QUALITY_CHECK')) {
    // The IN_PROGRESS -> QUALITY_CHECK transition requires every work item DONE/CANCELLED, so by
    // definition labor/parts/work-item-completion for the initial work items already happened —
    // and labor/part-issue endpoints reject calls once the job has moved past IN_PROGRESS anyway.
    markDone(ctx, `job:${scenario.key}:transition:quality-check`);
    for (const description of scenario.workItems) {
      markDone(ctx, `job:${scenario.key}:labor:${description}`);
      markDone(ctx, `job:${scenario.key}:workitem-done:${description}`);
    }
    for (const usage of scenario.parts) markDone(ctx, `job:${scenario.key}:part-issue:${usage.partKey}`);
  }
  if (reached('READY')) {
    // QUALITY_CHECK -> READY requires a PASSED quality check to already exist.
    markDone(ctx, `job:${scenario.key}:transition:ready`);
    markDone(ctx, `job:${scenario.key}:quality-check`);
  }
  if (reached('DELIVERED')) markDone(ctx, `job:${scenario.key}:transition:delivered`);

  const approvals = await client.get(`job-cards/${jobId}/approvals`, 'advisor', { pageSize: 50 });
  for (const approval of approvals.items as Array<{ id: string; scope: string; status: string }>) {
    if (approval.scope === 'INITIAL_WORK') {
      ctx.manifest.set(`job:${scenario.key}:approval:initial`, approval.id);
      if (approval.status !== 'PENDING') markDone(ctx, `job:${scenario.key}:approval:initial:decided`);
    } else if (approval.scope === 'ADDITIONAL_WORK') {
      ctx.manifest.set(`job:${scenario.key}:approval:additional`, approval.id);
      if (approval.status !== 'PENDING') markDone(ctx, `job:${scenario.key}:approval:additional:decided`);
      markDone(ctx, `job:${scenario.key}:additional-work-item`);
      markDone(ctx, `job:${scenario.key}:additional-work-item-done`);
      for (const usage of scenario.additionalWork?.parts ?? []) {
        markDone(ctx, `job:${scenario.key}:part-issue:${usage.partKey}`);
      }
    }
  }
}

async function seedScenario(ctx: SeedContext, scenario: JobScenario): Promise<void> {
  const { client, ids } = ctx;
  ctx.log(`Seeding job "${scenario.key}"...`);

  const jobResult = await ensureCreated(ctx, `job:${scenario.key}`, {
    verify: async (id) => (await client.tryGet(`job-cards/${id}`, 'advisor')) !== null,
    findExisting: async () => {
      // Each demo vehicle has exactly one demo job, so vehicleId is a reliable natural key —
      // self-heals a lost manifest instead of creating a second job card for the same vehicle.
      const page = await client.get('job-cards', 'advisor', { vehicleId: ids.vehicles[scenario.vehicleKey], pageSize: 1 });
      return (page.items[0]?.id as string) ?? null;
    },
    create: () =>
      client.post('job-cards', 'advisor', {
        vehicleId: ids.vehicles[scenario.vehicleKey],
        complaint: scenario.complaint,
        serviceType: scenario.serviceType,
        priority: scenario.priority,
        mileageAtIntake: scenario.mileageAtIntake,
        expectedCompletionAt: isoInMinutes(24 * 60),
        workItems: scenario.workItems.map((description) => ({ description })),
      }, [201]),
  });
  const jobId = jobResult.id;

  if (!jobResult.created) await reconcileRecoveredJob(ctx, scenario, jobId);

  await uploadAndLinkPhoto(ctx, jobId, scenario.key, 'intake');
  await recordInitialApproval(ctx, scenario, jobId);

  // Bay/technician assignment (requires the current job version).
  await step(ctx, `job:${scenario.key}:assigned`, async () => {
    const job = await client.get(`job-cards/${jobId}`, 'advisor');
    await client.put(`job-cards/${jobId}/assignment`, 'manager', {
      version: job.version,
      bayId: ids.bays[scenario.bayKey],
      technicianId: ids.users[scenario.technicianKey],
      scheduledStartAt: isoInMinutes(5),
      expectedCompletionAt: isoInMinutes(24 * 60),
    });
  });

  // RECEIVED -> IN_PROGRESS
  await step(ctx, `job:${scenario.key}:transition:in-progress`, async () => {
    await client.post(`job-cards/${jobId}/transitions`, 'manager', {
      toStage: 'IN_PROGRESS',
      expectedFromStage: 'RECEIVED',
    });
  });

  const workItems = await getWorkItemIds(ctx, jobId);

  // Labor + parts against the initial work items.
  for (const description of scenario.workItems) {
    const workItem = workItems.find((w) => w.description === description);
    await step(ctx, `job:${scenario.key}:labor:${description}`, async () => {
      await client.post(`job-cards/${jobId}/labor-entries`, scenario.technicianKey, {
        workItemId: workItem?.id,
        workDate: todayDateOnly(),
        durationMinutes: 60,
        description: `Work performed: ${description}`,
      });
    });
  }

  for (const usage of scenario.parts) {
    await issuePartAgainstJob(ctx, scenario.key, jobId, scenario.technicianKey, usage);
  }

  for (const description of scenario.workItems) {
    await step(ctx, `job:${scenario.key}:workitem-done:${description}`, async () => {
      const workItem = workItems.find((w) => w.description === description);
      if (workItem) await client.patch(`job-cards/${jobId}/work-items/${workItem.id}`, scenario.technicianKey, { status: 'DONE' });
    });
  }

  if (scenario.additionalWork) {
    await seedAdditionalWork(ctx, scenario, jobId);
  }

  // IN_PROGRESS -> QUALITY_CHECK (requires every work item DONE/CANCELLED).
  await step(ctx, `job:${scenario.key}:transition:quality-check`, async () => {
    await client.post(`job-cards/${jobId}/transitions`, 'manager', {
      toStage: 'QUALITY_CHECK',
      expectedFromStage: 'IN_PROGRESS',
    });
  });

  await uploadAndLinkPhoto(ctx, jobId, scenario.key, 'quality');
  await step(ctx, `job:${scenario.key}:quality-check`, async () => {
    const evidence = await client.uploadAttachment('qc', 'QUALITY_EVIDENCE', {
      fieldName: 'file',
      buffer: generateSyntheticPhoto(320, 240, PHOTO_COLORS[scenario.key].background, PHOTO_COLORS[scenario.key].label, PHOTO_COLORS[scenario.key].body),
      fileName: `${scenario.key}-qc-evidence.png`,
      contentType: 'image/png',
    });
    await client.post(`job-cards/${jobId}/quality-checks`, 'qc', {
      result: 'PASSED',
      notes: 'All work items verified complete; no follow-up required.',
      evidenceAttachmentIds: [evidence.id],
    });
  });

  // QUALITY_CHECK -> READY (auto-generates the draft invoice).
  await step(ctx, `job:${scenario.key}:transition:ready`, async () => {
    await client.post(`job-cards/${jobId}/transitions`, 'manager', {
      toStage: 'READY',
      expectedFromStage: 'QUALITY_CHECK',
    });
  });

  await handleInvoice(ctx, scenario, jobId);

  if (scenario.stopAtStage === 'READY') return;

  // READY -> DELIVERED (requires a non-void invoice, which now exists).
  await step(ctx, `job:${scenario.key}:transition:delivered`, async () => {
    await client.post(`job-cards/${jobId}/transitions`, 'advisor', {
      toStage: 'DELIVERED',
      expectedFromStage: 'READY',
    });
  });
}

async function issuePartAgainstJob(
  ctx: SeedContext,
  scenarioKey: string,
  jobId: string,
  technicianKey: string,
  usage: PartUsage,
): Promise<void> {
  const { client, ids } = ctx;
  const storeId = ids.stores.store1;
  await step(ctx, `job:${scenarioKey}:part-issue:${usage.partKey}`, async () => {
    await client.post(`job-cards/${jobId}/part-issues`, technicianKey, {
      partId: ids.parts[usage.partKey],
      storeId,
      quantity: usage.quantity,
    });
  });
}

async function seedAdditionalWork(ctx: SeedContext, scenario: JobScenario, jobId: string): Promise<void> {
  const { client } = ctx;
  const additional = scenario.additionalWork!;

  await step(ctx, `job:${scenario.key}:additional-work-item`, async () => {
    await client.post(`job-cards/${jobId}/work-items`, 'advisor', {
      description: additional.description,
      isAdditionalWork: true,
    }, [201]);
  });

  const items = await getWorkItemIds(ctx, jobId);
  const addedItem = items.find((w) => w.description === additional.description);

  const approvalKey = `job:${scenario.key}:approval:additional`;
  let approvalId = ctx.manifest.get(approvalKey);
  if (!approvalId) {
    const approval = await client.post(`job-cards/${jobId}/approvals`, 'advisor', {
      scope: 'ADDITIONAL_WORK',
      description: additional.description,
      workItemIds: addedItem ? [addedItem.id] : [],
    });
    approvalId = approval.id as string;
    ctx.manifest.set(approvalKey, approvalId);
  }
  await step(ctx, `job:${scenario.key}:approval:additional:decided`, async () => {
    await client.post(`job-cards/${jobId}/approvals/${approvalId}/decision`, 'advisor', {
      decision: 'APPROVED',
      method: 'MESSAGE',
      approvedByName: 'Fleet coordinator (SMS confirmation)',
    });
  });

  for (const usage of additional.parts ?? []) {
    await issuePartAgainstJob(ctx, scenario.key, jobId, scenario.technicianKey, usage);
  }

  await step(ctx, `job:${scenario.key}:additional-work-item-done`, async () => {
    if (addedItem) await client.patch(`job-cards/${jobId}/work-items/${addedItem.id}`, scenario.technicianKey, { status: 'DONE' });
  });
}

async function handleInvoice(ctx: SeedContext, scenario: JobScenario, jobId: string): Promise<void> {
  if (scenario.invoicePlan === 'none') return;
  const { client } = ctx;

  const invoiceList = await client.get('invoices', 'advisor', { jobId });
  let invoice = invoiceList.items[0];
  if (!invoice) {
    // A draft invoice is normally auto-generated on the QUALITY_CHECK -> READY transition; this
    // is a defensive fallback (e.g. a prior interrupted run) that regenerates it via the real
    // API. Regeneration itself only works while the job is still at READY, so if the job has
    // since moved to DELIVERED there is no API path left to recover it — skip rather than crash.
    try {
      invoice = await client.post(`job-cards/${jobId}/invoices`, 'advisor', {}, [201]);
    } catch (error) {
      ctx.log(`  Could not (re)generate an invoice for job "${scenario.key}": ${error instanceof Error ? error.message : String(error)} — skipping invoice steps for this job.`);
      return;
    }
  }
  if (scenario.invoicePlan === 'draft') return;
  const invoiceId = invoice.id as string;
  // Reconciles a recovered invoice's actual status (findExisting/regeneration above only
  // restores the id, not the manifest's "done" markers) so an already-ISSUED/PAID invoice is
  // never re-transitioned or re-paid — both are hard state-machine errors, not harmless no-ops.
  if (invoice.status !== 'DRAFT') markDone(ctx, `job:${scenario.key}:invoice:issued`);
  if (invoice.status === 'PAID') markDone(ctx, `job:${scenario.key}:invoice:payment`);

  await step(ctx, `job:${scenario.key}:invoice:issued`, async () => {
    await client.post(`invoices/${invoiceId}/transitions`, 'advisor', { toStatus: 'ISSUED' });
  });

  if (scenario.invoicePlan === 'issued-unpaid') return;

  const issued = await client.get(`invoices/${invoiceId}`, 'advisor');
  const totalAmount = issued.totals.total.amount as string;

  await step(ctx, `job:${scenario.key}:invoice:payment`, async () => {
    await client.post(`invoices/${invoiceId}/payments`, 'advisor', {
      method: 'CARD',
      reference: `DEMO-PMT-${scenario.key.toUpperCase()}`,
      amount: { amount: totalAmount, currency: CURRENCY },
      paidAt: new Date().toISOString(),
    });
  });
}

async function seedPendingScenario(ctx: SeedContext): Promise<void> {
  const { client, ids } = ctx;
  const scenario = PENDING_SCENARIO;
  ctx.log(`Seeding job "${scenario.key}" (left pending approval, no assignment)...`);

  const jobResult = await ensureCreated(ctx, `job:${scenario.key}`, {
    verify: async (id) => (await client.tryGet(`job-cards/${id}`, 'advisor')) !== null,
    findExisting: async () => {
      const page = await client.get('job-cards', 'advisor', { vehicleId: ids.vehicles[scenario.vehicleKey], pageSize: 1 });
      return (page.items[0]?.id as string) ?? null;
    },
    create: () =>
      client.post('job-cards', 'advisor', {
        vehicleId: ids.vehicles[scenario.vehicleKey],
        complaint: scenario.complaint,
        serviceType: scenario.serviceType,
        priority: scenario.priority,
        mileageAtIntake: scenario.mileageAtIntake,
        expectedCompletionAt: isoInMinutes(48 * 60),
        workItems: scenario.workItems.map((description) => ({ description })),
      }, [201]),
  });
  const jobId = jobResult.id;

  await uploadAndLinkPhoto(ctx, jobId, scenario.key, 'intake');

  const key = `job:${scenario.key}:approval:initial`;
  if (!ctx.manifest.get(key)) {
    const approval = await client.post(`job-cards/${jobId}/approvals`, 'advisor', {
      scope: 'INITIAL_WORK',
      description: 'Awaiting customer approval on the quoted price for front tire replacement.',
    });
    ctx.manifest.set(key, approval.id as string);
  }
}

export async function seedJobs(ctx: SeedContext): Promise<void> {
  for (const scenario of SCENARIOS) {
    try {
      await seedScenario(ctx, scenario);
    } catch (error) {
      // One job's failure (e.g. a recovered job whose sub-records were removed by hand outside
      // this tool, leaving it in a state the reconciliation above cannot fully infer) should
      // never block every other domain from seeding — surface it clearly and move on.
      ctx.log(`  Job "${scenario.key}" could not be fully seeded and was skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await seedPendingScenario(ctx);
  ctx.log(`Jobs ready: ${SCENARIOS.length} through their lifecycle, 1 left pending approval.`);
}
