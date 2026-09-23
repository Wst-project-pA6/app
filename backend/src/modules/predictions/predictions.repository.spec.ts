import { DatabaseService } from '../../common/database/database.service';
import { PredictionsRepository } from './predictions.repository';

const scopeIds = ['scope-1'];

function makeRepository(rows: unknown[] = [], count = 0) {
  const db = {
    query: jest.fn().mockResolvedValue({ rows }),
    queryValue: jest.fn().mockResolvedValue(count),
  };
  return { repository: new PredictionsRepository(db as unknown as DatabaseService), db };
}

describe('PredictionsRepository.list — permission-based type omission', () => {
  it('returns an empty page without querying when the caller holds neither read permission', async () => {
    const { repository, db } = makeRepository();
    const result = await repository.list({ page: 1, pageSize: 20 }, scopeIds, false, false, undefined);
    expect(result).toEqual({ rows: [], totalItems: 0 });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('only includes the REORDER_SUGGESTION branch when the caller lacks predictions.risk.read', async () => {
    const { repository, db } = makeRepository();
    await repository.list({ page: 1, pageSize: 20 }, scopeIds, true, false, undefined);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("p.type = 'REORDER_SUGGESTION'");
    expect(sql).not.toContain("p.type = 'TRAINING_RISK'");
  });

  it('OR-combines both branches when the caller holds both read permissions', async () => {
    const { repository, db } = makeRepository();
    await repository.list({ page: 1, pageSize: 20 }, scopeIds, true, true, undefined);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("p.type = 'REORDER_SUGGESTION'");
    expect(sql).toContain("p.type = 'TRAINING_RISK'");
    expect(sql).toMatch(/OR/);
  });

  it('adds the mentor-own-students restriction to the risk branch only when mentorUserId is given', async () => {
    const { repository, db } = makeRepository();
    await repository.list({ page: 1, pageSize: 20 }, scopeIds, false, true, 'mentor-1');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('ts.mentor_id = $2');
    expect(params).toEqual([scopeIds, 'mentor-1', 20, 0]);
  });
});

describe('PredictionsRepository.list — filters and sort', () => {
  it('defaults to -generatedAt (newest first) and rejects any other sort field', async () => {
    const { repository, db } = makeRepository();
    await repository.list({ page: 1, pageSize: 20 }, scopeIds, true, true, undefined);
    expect(db.query.mock.calls[0][0]).toContain('ORDER BY p.generated_at DESC, p.id ASC');

    await expect(repository.list({ page: 1, pageSize: 20, sort: 'status' }, scopeIds, true, true, undefined)).rejects.toThrow('INVALID_SORT');
  });

  it('applies from/to/type/status/storeId/partId/studentId/courseId/riskLevel filters only when provided', async () => {
    const { repository, db } = makeRepository();
    await repository.list(
      { page: 1, pageSize: 20, from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z', type: 'REORDER_SUGGESTION' as never, storeId: 'store-1', partId: 'part-1' },
      scopeIds, true, true, undefined,
    );
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('p.generated_at >= $2::timestamptz');
    expect(sql).toContain('p.generated_at < $3::timestamptz');
    expect(sql).toContain('p.type = $4');
    expect(sql).toContain('p.store_id = $5');
    expect(sql).toContain('p.part_id = $6');
  });
});

describe('PredictionsRepository.findScoped', () => {
  it('returns null immediately (no query) when the caller holds neither read permission', async () => {
    const { repository, db } = makeRepository();
    const result = await repository.findScoped('pred-1', scopeIds, false, false, undefined);
    expect(result).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('scopes by the prediction id plus the readable-type branch', async () => {
    const { repository, db } = makeRepository([{ id: 'pred-1' }]);
    await repository.findScoped('pred-1', scopeIds, true, false, undefined);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('p.id = $2');
    expect(params).toEqual([scopeIds, 'pred-1']);
  });
});

describe('PredictionsRepository.supersedeActiveReorder / supersedeActiveRisk', () => {
  it('only ever writes to the predictions table (status=SUPERSEDED, scoped by store+part)', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new PredictionsRepository({} as DatabaseService);
    await repository.supersedeActiveReorder(client as never, 'store-1', 'part-1');
    expect(client.query.mock.calls[0][0]).toContain('UPDATE predictions');
    expect(client.query.mock.calls[0][0]).toContain("SET status = 'SUPERSEDED'");
    expect(client.query.mock.calls[0][1]).toEqual(['store-1', 'part-1']);
  });

  it('supersedeActiveRisk scopes by student+course', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new PredictionsRepository({} as DatabaseService);
    await repository.supersedeActiveRisk(client as never, 'student-1', 'course-1');
    expect(client.query.mock.calls[0][0]).toContain('UPDATE predictions');
    expect(client.query.mock.calls[0][1]).toEqual(['student-1', 'course-1']);
  });
});

describe('PredictionsRepository.recordDecision', () => {
  it('updates status/decision/decidedBy/decidedAt on the predictions row only', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'pred-1', status: 'ACCEPTED' }] }) };
    const repository = new PredictionsRepository({} as DatabaseService);
    await repository.recordDecision(client as never, 'pred-1', { status: 'ACCEPTED', decidedBy: 'user-1' });
    expect(client.query.mock.calls[0][0]).toContain('UPDATE predictions');
    expect(client.query.mock.calls[0][1]).toEqual(['pred-1', 'ACCEPTED', 'user-1', null, null, null]);
  });
});
