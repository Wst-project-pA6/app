import { DatabaseService } from '../../common/database/database.service';
import { ReorderBaselineRepository } from './reorder-baseline.repository';

describe('ReorderBaselineRepository.findCandidates', () => {
  it('scopes by organization_scope_id, requires ACTIVE store/part, and applies the min-level trigger condition', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new ReorderBaselineRepository(db as unknown as DatabaseService);
    await repository.findCandidates(['scope-1'], 8);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('s.organization_scope_id = ANY($1::uuid[])');
    expect(sql).toContain("s.status = 'ACTIVE' AND p.status = 'ACTIVE'");
    expect(sql).toContain('(sb.on_hand - sb.reserved) + COALESCE(open_po.qty, 0) <= sb.min_level');
    expect(params).toEqual([['scope-1'], 8]);
  });

  it('adds a storeId filter only when provided', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new ReorderBaselineRepository(db as unknown as DatabaseService);
    await repository.findCandidates(['scope-1'], 8, 'store-1');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('sb.store_id = $3');
    expect(params).toEqual([['scope-1'], 8, 'store-1']);
  });

  it('only counts open purchase orders in flight (PENDING_APPROVAL/APPROVED/PARTIALLY_RECEIVED)', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new ReorderBaselineRepository(db as unknown as DatabaseService);
    await repository.findCandidates(['scope-1'], 8);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("po.status IN ('PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED')");
  });
});
