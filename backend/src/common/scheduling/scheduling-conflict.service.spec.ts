import { ScheduleConflict, SchedulingConflictService } from './scheduling-conflict.service';

const bayId = '11111111-1111-4111-8111-111111111111';
const personId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const sessionId = '44444444-4444-4444-8444-444444444444';

describe('SchedulingConflictService.findOverlaps', () => {
  it('queries all four overlap branches with UTC half-open intervals and exclusion guards', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const client = { query } as never;
    const service = new SchedulingConflictService();
    const startsAt = new Date('2026-10-05T09:00:00Z');
    const endsAt = new Date('2026-10-05T13:00:00Z');

    await service.findOverlaps(client, {
      bayId, personId, startsAt, endsAt, excludeJobId: jobId, excludeSessionId: sessionId, includePersonJobOverlap: true,
    });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('BAY_JOB_CONFLICT');
    expect(sql).toContain('BAY_SESSION_CONFLICT');
    expect(sql).toContain('MENTOR_SESSION_CONFLICT');
    expect(sql).toContain('MENTOR_WORKSHOP_CONFLICT');
    // Half-open interval: strict inequalities only, so a touching boundary never conflicts.
    expect(sql).not.toMatch(/<=|>=/);
    expect(sql).toContain('ORDER BY starts_at ASC, kind ASC, reference_id ASC');
    expect(params).toEqual([bayId, startsAt, endsAt, personId, jobId, sessionId, true]);
  });

  it('passes null exclusions and a false overlap flag when omitted', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const client = { query } as never;
    const service = new SchedulingConflictService();
    const startsAt = new Date('2026-10-05T09:00:00Z');
    const endsAt = new Date('2026-10-05T10:00:00Z');

    await service.findOverlaps(client, { bayId, personId, startsAt, endsAt, includePersonJobOverlap: false });

    expect(query.mock.calls[0][1]).toEqual([bayId, startsAt, endsAt, personId, null, null, false]);
  });
});

describe('SchedulingConflictService.mapOverlaps', () => {
  const service = new SchedulingConflictService();

  it('builds stable conflict keys, sets bayId for bay conflicts and mentorId for person conflicts, and marks only the requested kinds overridable', () => {
    const rows = [
      { kind: 'BAY_JOB_CONFLICT' as const, reference_id: jobId, reference_label: 'JC-2026-000001', starts_at: new Date('2026-10-05T09:00:00Z'), ends_at: new Date('2026-10-05T13:00:00Z') },
      { kind: 'MENTOR_SESSION_CONFLICT' as const, reference_id: sessionId, reference_label: 'Engine Basics', starts_at: new Date('2026-10-05T09:00:00Z'), ends_at: new Date('2026-10-05T13:00:00Z') },
    ];
    const conflicts = service.mapOverlaps(rows, { bayId, personId, overridableKinds: new Set(['BAY_JOB_CONFLICT']) });
    expect(conflicts[0]).toMatchObject({
      conflictKey: `BAY_JOB_CONFLICT-${jobId}`, kind: 'BAY_JOB_CONFLICT', overridable: true, bayId,
      conflictingReference: expect.objectContaining({ kind: 'JOB', referenceId: jobId }),
    });
    expect(conflicts[0]).not.toHaveProperty('mentorId');
    expect(conflicts[1]).toMatchObject({
      conflictKey: `MENTOR_SESSION_CONFLICT-${sessionId}`, kind: 'MENTOR_SESSION_CONFLICT', overridable: false, mentorId: personId,
      conflictingReference: expect.objectContaining({ kind: 'TRAINING_SESSION', referenceId: sessionId }),
    });
    expect(conflicts[1]).not.toHaveProperty('bayId');
  });
});

describe('SchedulingConflictService synthetic conflicts', () => {
  const service = new SchedulingConflictService();

  it('builds a non-overridable BAY_UNAVAILABLE conflict keyed by bay', () => {
    expect(service.bayUnavailableConflict(bayId)).toMatchObject({
      conflictKey: `BAY_UNAVAILABLE-${bayId}`, kind: 'BAY_UNAVAILABLE', overridable: false, overridden: false, bayId,
    });
  });

  it('builds a non-overridable BAY_CAPACITY_EXCEEDED conflict describing the shortfall', () => {
    const conflict = service.bayCapacityExceededConflict(bayId, 4, 6);
    expect(conflict).toMatchObject({ conflictKey: `BAY_CAPACITY_EXCEEDED-${bayId}`, kind: 'BAY_CAPACITY_EXCEEDED', overridable: false, bayId });
    expect(conflict.message).toContain('4');
    expect(conflict.message).toContain('6');
  });
});

describe('SchedulingConflictService.sortConflicts', () => {
  const service = new SchedulingConflictService();
  const fallback = new Date('2026-10-05T09:00:00Z');

  it('orders by the competing window start time, then kind, then conflict key deterministically', () => {
    const later: ScheduleConflict = {
      conflictKey: 'BAY_SESSION_CONFLICT-b', kind: 'BAY_SESSION_CONFLICT', overridable: false, overridden: false, message: '',
      conflictingReference: { kind: 'TRAINING_SESSION', referenceId: 'b', referenceLabel: '', startsAt: new Date('2026-10-05T11:00:00Z'), endsAt: new Date('2026-10-05T12:00:00Z') },
    };
    const earlier: ScheduleConflict = {
      conflictKey: 'BAY_JOB_CONFLICT-a', kind: 'BAY_JOB_CONFLICT', overridable: true, overridden: false, message: '',
      conflictingReference: { kind: 'JOB', referenceId: 'a', referenceLabel: '', startsAt: new Date('2026-10-05T09:30:00Z'), endsAt: new Date('2026-10-05T10:00:00Z') },
    };
    const synthetic = service.bayUnavailableConflict(bayId);

    const sorted = service.sortConflicts([later, earlier, synthetic], fallback);
    expect(sorted.map((c) => c.conflictKey)).toEqual([synthetic.conflictKey, earlier.conflictKey, later.conflictKey]);
  });

  it('breaks ties at the same instant by kind, then by conflict key', () => {
    const a: ScheduleConflict = { conflictKey: 'BAY_UNAVAILABLE-x', kind: 'BAY_UNAVAILABLE', overridable: false, overridden: false, message: '' };
    const b: ScheduleConflict = { conflictKey: 'BAY_CAPACITY_EXCEEDED-x', kind: 'BAY_CAPACITY_EXCEEDED', overridable: false, overridden: false, message: '' };
    const sorted = service.sortConflicts([a, b], fallback);
    expect(sorted.map((c) => c.kind)).toEqual(['BAY_CAPACITY_EXCEEDED', 'BAY_UNAVAILABLE']);
  });
});

describe('SchedulingConflictService.applyOverrides', () => {
  const service = new SchedulingConflictService();

  it('marks only overridable conflicts whose key has an active override, leaving others untouched', () => {
    const overridable: ScheduleConflict = { conflictKey: 'BAY_JOB_CONFLICT-a', kind: 'BAY_JOB_CONFLICT', overridable: true, overridden: false, message: '' };
    const nonOverridable: ScheduleConflict = { conflictKey: 'BAY_UNAVAILABLE-a', kind: 'BAY_UNAVAILABLE', overridable: false, overridden: false, message: '' };
    const result = service.applyOverrides([overridable, nonOverridable], new Set([overridable.conflictKey, nonOverridable.conflictKey]));
    expect(result[0].overridden).toBe(true);
    expect(result[1].overridden).toBe(false);
  });
});

describe('SchedulingConflictService.evaluateSessionConflicts', () => {
  const service = new SchedulingConflictService();
  const startsAt = new Date('2026-10-05T09:00:00Z');
  const endsAt = new Date('2026-10-05T13:00:00Z');

  it('prepends BAY_UNAVAILABLE and BAY_CAPACITY_EXCEEDED ahead of overlap conflicts when applicable', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const client = { query } as never;
    const conflicts = await service.evaluateSessionConflicts(client, {
      sessionId, bayId, bayStatus: 'MAINTENANCE', bayCapacity: 2, requiredCapacity: 5,
      mentorId: personId, startsAt, endsAt,
    });
    expect(conflicts.map((c) => c.kind)).toEqual(['BAY_CAPACITY_EXCEEDED', 'BAY_UNAVAILABLE']);
    expect(conflicts.every((c) => !c.overridable)).toBe(true);
  });

  it('excludes the session itself and marks only BAY_JOB_CONFLICT overridable among real overlaps', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { kind: 'BAY_JOB_CONFLICT', reference_id: jobId, reference_label: 'JC-2026-000001', starts_at: startsAt, ends_at: endsAt },
        { kind: 'MENTOR_WORKSHOP_CONFLICT', reference_id: jobId, reference_label: 'JC-2026-000002', starts_at: startsAt, ends_at: endsAt },
      ],
    });
    const client = { query } as never;
    const conflicts = await service.evaluateSessionConflicts(client, {
      sessionId, bayId, bayStatus: 'ACTIVE', bayCapacity: 10, requiredCapacity: 2,
      mentorId: personId, startsAt, endsAt,
    });
    expect(query.mock.calls[0][1]).toEqual([bayId, startsAt, endsAt, personId, null, sessionId, true]);
    expect(conflicts.find((c) => c.kind === 'BAY_JOB_CONFLICT')?.overridable).toBe(true);
    expect(conflicts.find((c) => c.kind === 'MENTOR_WORKSHOP_CONFLICT')?.overridable).toBe(false);
  });
});
