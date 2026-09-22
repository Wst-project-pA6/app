import 'reflect-metadata';
import { DatabaseService } from '../../common/database/database.service';
import { PartIssueStatus } from './dto/part-issue.dto';
import { StockMovementType } from './dto/stock-balance.dto';
import {
  IssueStockBalanceRow,
  orderPartIssuesBy,
  PartIssueReversalRow,
  PartIssueRow,
  PartIssuesRepository,
} from './part-issues.repository';

const mockIssue: PartIssueRow = {
  id: 'issue-1',
  job_id: 'job-1',
  part_id: 'part-1',
  part_sku: 'BRK-001',
  store_id: 'store-1',
  work_item_id: null,
  reservation_id: null,
  quantity: 2,
  reversed_quantity: 0,
  unit_price_amount: '50.0000',
  unit_price_currency: 'SAR',
  unit_cost_amount: '30.0000',
  unit_cost_currency: 'SAR',
  line_total_amount: '100.0000',
  line_total_currency: 'SAR',
  status: PartIssueStatus.ISSUED,
  stock_movement_id: 'movement-1',
  idempotency_key: null,
  created_at: new Date(),
  updated_at: new Date(),
  created_by: 'user-1',
  updated_by: 'user-1',
};

describe('PartIssuesRepository', () => {
  describe('orderPartIssuesBy', () => {
    it('orders by createdAt ASC by default and handles DESC', () => {
      expect(orderPartIssuesBy()).toBe('pi.created_at ASC');
      expect(orderPartIssuesBy('createdAt')).toBe('pi.created_at ASC');
      expect(orderPartIssuesBy('-createdAt')).toBe('pi.created_at DESC');
      expect(() => orderPartIssuesBy('quantity')).toThrow('INVALID_SORT');
    });
  });

  describe('listByJobId', () => {
    it('queries issues for a job with pagination', async () => {
      const queryValue = jest.fn().mockResolvedValue(1);
      const query = jest.fn().mockResolvedValue({ rows: [mockIssue] });
      const repository = new PartIssuesRepository({ queryValue, query } as unknown as DatabaseService);

      const result = await repository.listByJobId('job-1', { page: 2, pageSize: 10, sort: '-createdAt' });

      expect(result.totalItems).toBe(1);
      expect(result.rows).toEqual([mockIssue]);
      expect(queryValue).toHaveBeenCalledWith(expect.stringContaining('pi.job_id = $1'), ['job-1']);
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY pi.created_at DESC, pi.id ASC');
      expect(sql).toContain('LIMIT $2 OFFSET $3');
      expect(query.mock.calls[0][1]).toEqual(['job-1', 10, 10]);
    });
  });

  describe('acquireIdempotencyLock', () => {
    it('acquires a two-key advisory transaction lock', async () => {
      const clientQuery = jest.fn().mockResolvedValue({ rows: [] });
      const client = { query: clientQuery };
      const repository = new PartIssuesRepository({} as DatabaseService);

      await repository.acquireIdempotencyLock(client as never, 'part_issue', 'key-1');

      expect(clientQuery).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        ['part_issue', 'key-1'],
      );
    });
  });

  describe('findByIdempotencyKey', () => {
    it('looks up a part issue by idempotency key', async () => {
      const clientQuery = jest.fn().mockResolvedValue({ rows: [mockIssue] });
      const client = { query: clientQuery };
      const repository = new PartIssuesRepository({} as DatabaseService);

      const result = await repository.findByIdempotencyKey(client as never, 'key-1');

      expect(result).toEqual(mockIssue);
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('pi.idempotency_key = $1'),
        ['key-1'],
      );
    });
  });

  describe('lockBalanceForIssue', () => {
    it('executes SELECT FOR UPDATE including average cost columns', async () => {
      const mockBalance: IssueStockBalanceRow = {
        store_id: 'store-1',
        part_id: 'part-1',
        on_hand: 10,
        reserved: 3,
        average_cost_amount: '25.0000',
        average_cost_currency: 'SAR',
      };
      const clientQuery = jest.fn().mockResolvedValue({ rows: [mockBalance] });
      const client = { query: clientQuery };
      const repository = new PartIssuesRepository({} as DatabaseService);

      const result = await repository.lockBalanceForIssue(client as never, 'store-1', 'part-1');

      expect(result).toEqual(mockBalance);
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT store_id, part_id, on_hand, reserved, average_cost_amount, average_cost_currency'),
        ['store-1', 'part-1'],
      );
      expect(clientQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    });
  });

  describe('updateBalanceForIssue', () => {
    it('applies on_hand and reserved deltas in a single statement', async () => {
      const clientQuery = jest.fn().mockResolvedValue({ rows: [{ on_hand: 8, reserved: 2 }] });
      const client = { query: clientQuery };
      const repository = new PartIssuesRepository({} as DatabaseService);

      const result = await repository.updateBalanceForIssue(client as never, 'store-1', 'part-1', -2, -1);

      expect(result).toEqual({ on_hand: 8, reserved: 2 });
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET on_hand = on_hand + $3'),
        ['store-1', 'part-1', -2, -1],
      );
    });
  });

  describe('computeLineTotal', () => {
    it('delegates rounding to PostgreSQL NUMERIC arithmetic', async () => {
      const clientQuery = jest.fn().mockResolvedValue({ rows: [{ line_total: '100.0000' }] });
      const client = { query: clientQuery };
      const repository = new PartIssuesRepository({} as DatabaseService);

      const result = await repository.computeLineTotal(client as never, '50.0000', 2);

      expect(result).toBe('100.0000');
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('ROUND($1::numeric * $2::numeric, 4)'),
        ['50.0000', 2],
      );
    });
  });

  describe('createIssueMovement', () => {
    it('inserts an ISSUE movement without part_issue_id', async () => {
      const clientQuery = jest.fn().mockResolvedValue({ rows: [{ id: 'movement-1' }] });
      const client = { query: clientQuery };
      const repository = new PartIssuesRepository({} as DatabaseService);

      const result = await repository.createIssueMovement(client as never, {
        storeId: 'store-1',
        partId: 'part-1',
        onHandDelta: -2,
        reservedDelta: -1,
        onHandAfter: 8,
        reservedAfter: 2,
        unitCostAmount: '30.0000',
        unitCostCurrency: 'SAR',
        jobId: 'job-1',
        actorId: 'user-1',
        reason: 'Issued to job JOB-001',
      });

      expect(result).toBe('movement-1');
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO stock_movements'),
        [
          'store-1',
          'part-1',
          StockMovementType.ISSUE,
          -2,
          -1,
          8,
          2,
          '30.0000',
          'SAR',
          'job-1',
          'user-1',
          'Issued to job JOB-001',
        ],
      );
      expect(clientQuery.mock.calls[0][0]).not.toContain('part_issue_id');
    });
  });

  describe('createPartIssue', () => {
    it('inserts a part issue snapshotting price, cost and line total', async () => {
      const clientQuery = jest.fn().mockResolvedValue({ rows: [mockIssue] });
      const client = { query: clientQuery };
      const repository = new PartIssuesRepository({} as DatabaseService);

      const result = await repository.createPartIssue(client as never, {
        jobId: 'job-1',
        partId: 'part-1',
        partSku: 'BRK-001',
        storeId: 'store-1',
        quantity: 2,
        unitPriceAmount: '50.0000',
        unitPriceCurrency: 'SAR',
        unitCostAmount: '30.0000',
        unitCostCurrency: 'SAR',
        lineTotalAmount: '100.0000',
        lineTotalCurrency: 'SAR',
        stockMovementId: 'movement-1',
        actorId: 'user-1',
      });

      expect(result).toEqual(mockIssue);
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO part_issues'),
        [
          'job-1',
          'part-1',
          'BRK-001',
          'store-1',
          null,
          null,
          2,
          '50.0000',
          'SAR',
          '30.0000',
          'SAR',
          '100.0000',
          'SAR',
          'movement-1',
          null,
          'user-1',
        ],
      );
      expect(clientQuery.mock.calls[0][0]).toContain("'ISSUED'");
    });
  });

  describe('lockIssue', () => {
    it('executes SELECT FOR UPDATE on part_issues by id', async () => {
      const clientQuery = jest.fn().mockResolvedValue({ rows: [mockIssue] });
      const client = { query: clientQuery };
      const repository = new PartIssuesRepository({} as DatabaseService);

      const result = await repository.lockIssue(client as never, 'issue-1');

      expect(result).toEqual(mockIssue);
      expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('pi.id = $1'), ['issue-1']);
      expect(clientQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    });
  });

  describe('createReversalMovement', () => {
    it('inserts an ISSUE_REVERSAL movement referencing the original part_issue_id', async () => {
      const clientQuery = jest.fn().mockResolvedValue({ rows: [{ id: 'movement-2' }] });
      const client = { query: clientQuery };
      const repository = new PartIssuesRepository({} as DatabaseService);

      const result = await repository.createReversalMovement(client as never, {
        storeId: 'store-1',
        partId: 'part-1',
        quantity: 1,
        onHandAfter: 9,
        reservedAfter: 2,
        unitCostAmount: '30.0000',
        unitCostCurrency: 'SAR',
        jobId: 'job-1',
        partIssueId: 'issue-1',
        actorId: 'user-1',
        reason: 'Wrong part installed',
      });

      expect(result).toBe('movement-2');
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO stock_movements'),
        [
          'store-1',
          'part-1',
          StockMovementType.ISSUE_REVERSAL,
          1,
          9,
          2,
          '30.0000',
          'SAR',
          'job-1',
          'issue-1',
          'user-1',
          'Wrong part installed',
        ],
      );
    });
  });

  describe('createReversal', () => {
    it('inserts an append-only part_issue_reversals row', async () => {
      const mockReversal: PartIssueReversalRow = {
        id: 'reversal-1',
        part_issue_id: 'issue-1',
        quantity: 1,
        reason: 'Wrong part installed',
        reversed_by: 'user-1',
        reversed_at: new Date(),
        stock_movement_id: 'movement-2',
        idempotency_key: null,
      };
      const clientQuery = jest.fn().mockResolvedValue({ rows: [mockReversal] });
      const client = { query: clientQuery };
      const repository = new PartIssuesRepository({} as DatabaseService);

      const result = await repository.createReversal(client as never, {
        partIssueId: 'issue-1',
        quantity: 1,
        reason: 'Wrong part installed',
        reversedBy: 'user-1',
        stockMovementId: 'movement-2',
      });

      expect(result).toEqual(mockReversal);
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO part_issue_reversals'),
        ['issue-1', 1, 'Wrong part installed', 'user-1', 'movement-2', null],
      );
    });
  });

  describe('applyReversal', () => {
    it('increments reversed_quantity and sets status', async () => {
      const updated = { ...mockIssue, reversed_quantity: 1, status: PartIssueStatus.PARTIALLY_REVERSED };
      const clientQuery = jest.fn().mockResolvedValue({ rows: [updated] });
      const client = { query: clientQuery };
      const repository = new PartIssuesRepository({} as DatabaseService);

      const result = await repository.applyReversal(
        client as never,
        'issue-1',
        1,
        PartIssueStatus.PARTIALLY_REVERSED,
        'user-1',
      );

      expect(result).toEqual(updated);
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('reversed_quantity = reversed_quantity + $2'),
        ['issue-1', 1, PartIssueStatus.PARTIALLY_REVERSED, 'user-1'],
      );
    });
  });
});
