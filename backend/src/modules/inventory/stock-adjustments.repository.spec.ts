import 'reflect-metadata';
import { DatabaseService } from '../../common/database/database.service';
import {
  StockAdjustmentReasonCode,
  StockAdjustmentStatus,
} from './dto/stock-adjustment.dto';
import {
  orderAdjustmentsBy,
  StockAdjustmentRow,
  StockAdjustmentsRepository,
} from './stock-adjustments.repository';

describe('StockAdjustmentsRepository', () => {
  const sampleAdjustment: StockAdjustmentRow = {
    id: 'adj-1',
    store_id: 'store-1',
    part_id: 'part-1',
    quantity_delta: 5,
    reason_code: StockAdjustmentReasonCode.FOUND,
    note: 'Found in back',
    status: StockAdjustmentStatus.PENDING_APPROVAL,
    requested_by: 'user-1',
    decided_by: null,
    decided_at: null,
    decision_reason: null,
    stock_movement_id: null,
    idempotency_key: 'key-123',
    created_at: new Date('2026-09-01T00:00:00Z'),
    updated_at: new Date('2026-09-01T00:00:00Z'),
  };

  describe('orderAdjustmentsBy', () => {
    it('defaults to sa.created_at DESC when no sort is passed', () => {
      expect(orderAdjustmentsBy(undefined)).toBe('sa.created_at DESC');
    });

    it('handles createdAt and -createdAt', () => {
      expect(orderAdjustmentsBy('createdAt')).toBe('sa.created_at ASC');
      expect(orderAdjustmentsBy('-createdAt')).toBe('sa.created_at DESC');
    });

    it('throws Error(INVALID_SORT) for unknown sort fields', () => {
      expect(() => orderAdjustmentsBy('quantity')).toThrow('INVALID_SORT');
    });
  });

  describe('list', () => {
    it('executes parameterized query with filters and deterministic tie-breaker', async () => {
      const queryValue = jest.fn().mockResolvedValue(1);
      const query = jest.fn().mockResolvedValue({ rows: [sampleAdjustment] });
      const db = {
        queryValue,
        query,
      } as unknown as DatabaseService;
      const repository = new StockAdjustmentsRepository(db);

      const result = await repository.list(
        {
          page: 1,
          pageSize: 20,
          status: StockAdjustmentStatus.PENDING_APPROVAL,
          storeId: 'store-1',
          partId: 'part-1',
          sort: '-createdAt',
        },
        ['scope-1'],
      );

      expect(result).toEqual({ rows: [sampleAdjustment], totalItems: 1 });
      expect(queryValue).toHaveBeenCalledWith(
        expect.stringContaining('s.organization_scope_id = ANY($1::uuid[])'),
        [['scope-1'], StockAdjustmentStatus.PENDING_APPROVAL, 'store-1', 'part-1'],
      );
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY sa.created_at DESC, sa.id ASC'),
        [['scope-1'], StockAdjustmentStatus.PENDING_APPROVAL, 'store-1', 'part-1', 20, 0],
      );
    });
  });

  describe('acquireIdempotencyLock', () => {
    it('executes pg_advisory_xact_lock with namespace and key', async () => {
      const client = { query: jest.fn().mockResolvedValue({}) };
      const repository = new StockAdjustmentsRepository({} as DatabaseService);

      await repository.acquireIdempotencyLock(client as never, 'stock_adjustment', 'my-key');

      expect(client.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        ['stock_adjustment', 'my-key'],
      );
    });
  });

  describe('findByIdempotencyKey', () => {
    it('queries stock_adjustments by idempotency_key', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [sampleAdjustment] }) };
      const repository = new StockAdjustmentsRepository({} as DatabaseService);

      const result = await repository.findByIdempotencyKey(client as never, 'key-123');

      expect(result).toEqual(sampleAdjustment);
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE sa.idempotency_key = $1'),
        ['key-123'],
      );
    });
  });

  describe('create', () => {
    it('inserts a pending stock adjustment row', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [sampleAdjustment] }) };
      const repository = new StockAdjustmentsRepository({} as DatabaseService);

      const result = await repository.create(client as never, {
        storeId: 'store-1',
        partId: 'part-1',
        quantityDelta: 5,
        reasonCode: StockAdjustmentReasonCode.FOUND,
        note: 'Found in back',
        requestedBy: 'user-1',
        idempotencyKey: 'key-123',
      });

      expect(result).toEqual(sampleAdjustment);
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO stock_adjustments"),
        [
          'store-1',
          'part-1',
          5,
          StockAdjustmentReasonCode.FOUND,
          'Found in back',
          'user-1',
          'key-123',
        ],
      );
    });
  });

  describe('lockAdjustment', () => {
    it('queries stock adjustment FOR UPDATE OF sa filtered by store scope', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [sampleAdjustment] }) };
      const repository = new StockAdjustmentsRepository({} as DatabaseService);

      const result = await repository.lockAdjustment(client as never, 'adj-1', ['scope-1']);

      expect(result).toEqual(sampleAdjustment);
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE OF sa'),
        ['adj-1', ['scope-1']],
      );
    });
  });

  describe('lockBalance', () => {
    it('queries stock balance FOR UPDATE', async () => {
      const mockBalance = {
        store_id: 'store-1',
        part_id: 'part-1',
        on_hand: 10,
        reserved: 2,
        min_level: 0,
        max_level: 100,
        average_cost_amount: '25.0000',
        average_cost_currency: 'SAR',
      };
      const client = { query: jest.fn().mockResolvedValue({ rows: [mockBalance] }) };
      const repository = new StockAdjustmentsRepository({} as DatabaseService);

      const result = await repository.lockBalance(client as never, 'store-1', 'part-1');

      expect(result).toEqual(mockBalance);
      expect(client.query).toHaveBeenCalledWith(
        expect.stringMatching(/FROM stock_balances\s+WHERE store_id = \$1 AND part_id = \$2\s+FOR UPDATE/),
        ['store-1', 'part-1'],
      );
    });
  });

  describe('initZeroBalance', () => {
    it('inserts a zero baseline with NULL currency on conflict do nothing', async () => {
      const client = { query: jest.fn().mockResolvedValue({}) };
      const repository = new StockAdjustmentsRepository({} as DatabaseService);

      await repository.initZeroBalance(client as never, 'store-1', 'part-1');

      const [sql, params] = client.query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO stock_balances\s*\(\s*store_id,\s*part_id,\s*on_hand,\s*reserved,\s*min_level,\s*max_level,\s*average_cost_amount,\s*average_cost_currency,\s*updated_at\s*\)\s*VALUES\s*\(\s*\$1,\s*\$2,\s*0,\s*0,\s*0,\s*0,\s*0,\s*NULL,\s*now\(\)\s*\)\s*ON CONFLICT \(store_id, part_id\) DO NOTHING/i);
      expect(params).toEqual(['store-1', 'part-1']);
    });
  });

  describe('updateBalanceOnHand', () => {
    it('updates on_hand on stock_balances', async () => {
      const client = { query: jest.fn().mockResolvedValue({}) };
      const repository = new StockAdjustmentsRepository({} as DatabaseService);

      await repository.updateBalanceOnHand(client as never, 'store-1', 'part-1', 15);

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE stock_balances'),
        ['store-1', 'part-1', 15],
      );
    });
  });

  describe('createAdjustmentMovement', () => {
    it('inserts an immutable ADJUSTMENT movement with exact columns, parameter positions, and no movement_type/quantity columns', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'mov-1' }] }) };
      const repository = new StockAdjustmentsRepository({} as DatabaseService);

      const result = await repository.createAdjustmentMovement(client as never, {
        storeId: 'store-1',
        partId: 'part-1',
        onHandDelta: 5,
        onHandAfter: 15,
        reservedAfter: 2,
        unitCostAmount: null,
        unitCostCurrency: null,
        stockAdjustmentId: 'adj-1',
        reason: 'Stock adjustment (FOUND)',
        actorId: 'user-2',
      });

      expect(result).toBe('mov-1');
      const [sql, params] = client.query.mock.calls[0];

      // Exact columns and values
      expect(sql).toMatch(
        /INSERT INTO stock_movements\s*\(\s*store_id,\s*part_id,\s*type,\s*on_hand_delta,\s*reserved_delta,\s*on_hand_after,\s*reserved_after,\s*unit_cost_amount,\s*unit_cost_currency,\s*stock_adjustment_id,\s*reason,\s*actor_id,\s*occurred_at\s*\)\s*VALUES\s*\(\s*\$1,\s*\$2,\s*'ADJUSTMENT',\s*\$3,\s*0,\s*\$4,\s*\$5,\s*\$6,\s*\$7,\s*\$8,\s*\$9,\s*\$10,\s*now\(\)\s*\)\s*RETURNING id/i,
      );

      // Verify nonexistent columns are NOT present
      expect(sql).not.toContain('movement_type');
      expect(sql).not.toMatch(/\bquantity\b/);

      // Exact parameter mapping: $1..$10
      expect(params).toEqual([
        'store-1',
        'part-1',
        5,
        15,
        2,
        null,
        null,
        'adj-1',
        'Stock adjustment (FOUND)',
        'user-2',
      ]);
    });
  });

  describe('applyDecision', () => {
    it('updates status, decided_by, decided_at, and references stock_movement_id', async () => {
      const decidedRow = {
        ...sampleAdjustment,
        status: StockAdjustmentStatus.APPROVED,
        decided_by: 'user-2',
        decided_at: new Date('2026-09-02T00:00:00Z'),
        decision_reason: 'Approved after verification',
        stock_movement_id: 'mov-1',
      };
      const client = { query: jest.fn().mockResolvedValue({ rows: [decidedRow] }) };
      const repository = new StockAdjustmentsRepository({} as DatabaseService);

      const result = await repository.applyDecision(client as never, {
        adjustmentId: 'adj-1',
        status: StockAdjustmentStatus.APPROVED,
        decidedBy: 'user-2',
        decisionReason: 'Approved after verification',
        stockMovementId: 'mov-1',
      });

      expect(result).toEqual(decidedRow);
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE stock_adjustments'),
        [
          'adj-1',
          StockAdjustmentStatus.APPROVED,
          'user-2',
          'Approved after verification',
          'mov-1',
        ],
      );
    });
  });
});
