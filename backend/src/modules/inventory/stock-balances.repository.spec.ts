import { DatabaseService } from '../../common/database/database.service';
import {
  orderBalancesBy,
  orderMovementsBy,
  StockBalancesRepository,
  StockBalanceRow,
  StockMovementRow,
  ReconciliationRow,
} from './stock-balances.repository';
import { StockMovementType } from './dto/stock-balance.dto';

describe('StockBalancesRepository', () => {
  describe('orderBalancesBy', () => {
    it('builds allowlisted deterministic order clauses and rejects unallowlisted sort fields', () => {
      expect(orderBalancesBy()).toBe('p.sku ASC');
      expect(orderBalancesBy('sku')).toBe('p.sku ASC');
      expect(orderBalancesBy('onHand')).toBe('sb.on_hand ASC');
      expect(orderBalancesBy('available')).toBe('(sb.on_hand - sb.reserved) ASC');
      expect(orderBalancesBy('-onHand')).toBe('sb.on_hand DESC');
      expect(orderBalancesBy('-available,sku')).toBe('(sb.on_hand - sb.reserved) DESC, p.sku ASC');
      expect(() => orderBalancesBy('averageCost')).toThrow('INVALID_SORT');
      expect(() => orderBalancesBy('minLevel')).toThrow('INVALID_SORT');
      expect(() => orderBalancesBy('unknownField')).toThrow('INVALID_SORT');
    });
  });

  describe('orderMovementsBy', () => {
    it('builds allowlisted order clauses for movements and rejects other fields', () => {
      expect(orderMovementsBy()).toBe('sm.occurred_at DESC');
      expect(orderMovementsBy('-occurredAt')).toBe('sm.occurred_at DESC');
      expect(orderMovementsBy('occurredAt')).toBe('sm.occurred_at ASC');
      expect(() => orderMovementsBy('type')).toThrow('INVALID_SORT');
      expect(() => orderMovementsBy('onHandDelta')).toThrow('INVALID_SORT');
    });
  });

  describe('listBalances', () => {
    it('uses parameterized filters, sorting, and pagination', async () => {
      const queryValue = jest.fn().mockResolvedValue(1);
      const mockRow: StockBalanceRow = {
        store_id: 'store-1',
        part_id: 'part-1',
        sku: 'SKU-001',
        name_en: 'Brake Pad',
        name_ar: null,
        selling_price_currency: 'SAR',
        on_hand: 5,
        reserved: 2,
        min_level: 2,
        max_level: 10,
        average_cost_amount: '15.5000',
        average_cost_currency: 'SAR',
        updated_at: new Date(),
      };
      const query = jest.fn().mockResolvedValue({ rows: [mockRow] });
      const repository = new StockBalancesRepository({ queryValue, query } as unknown as DatabaseService);

      const result = await repository.listBalances(
        {
          page: 2,
          pageSize: 5,
          storeId: 'store-1',
          partId: 'part-1',
          category: 'Brakes',
          belowMinimum: true,
          stockedOut: false,
          q: 'brake',
          sort: '-onHand',
        },
        ['scope-1'],
      );

      expect(result.totalItems).toBe(1);
      expect(result.rows).toHaveLength(1);

      expect(queryValue).toHaveBeenCalledWith(
        expect.stringContaining('s.organization_scope_id = ANY($1::uuid[])'),
        expect.arrayContaining([['scope-1'], 'store-1', 'part-1', 'Brakes', '%brake%']),
      );

      const sql = query.mock.calls[0][0] as string;
      expect(sql).toContain('sb.on_hand <= sb.min_level');
      expect(sql).toContain('sb.on_hand > 0');
      expect(sql).toContain('ORDER BY sb.on_hand DESC, sb.store_id ASC, sb.part_id ASC');
      expect(sql).toContain('LIMIT $6 OFFSET $7');
      expect(query.mock.calls[0][1]).toEqual([
        ['scope-1'],
        'store-1',
        'part-1',
        'Brakes',
        '%brake%',
        5,
        5,
      ]);
    });

    it('handles belowMinimum=false and stockedOut=true filters', async () => {
      const queryValue = jest.fn().mockResolvedValue(0);
      const query = jest.fn().mockResolvedValue({ rows: [] });
      const repository = new StockBalancesRepository({ queryValue, query } as unknown as DatabaseService);

      await repository.listBalances(
        {
          page: 1,
          pageSize: 20,
          belowMinimum: false,
          stockedOut: true,
        },
        ['scope-1'],
      );

      const countSql = queryValue.mock.calls[0][0] as string;
      expect(countSql).toContain('sb.on_hand > sb.min_level');
      expect(countSql).toContain('sb.on_hand = 0');
    });
  });

  describe('replaceLevels', () => {
    it('executes atomic upsert via CTE and returns updated balance row', async () => {
      const mockRow: StockBalanceRow = {
        store_id: 'store-1',
        part_id: 'part-1',
        sku: 'SKU-001',
        name_en: 'Oil Filter',
        name_ar: null,
        selling_price_currency: 'SAR',
        on_hand: 0,
        reserved: 0,
        min_level: 5,
        max_level: 25,
        average_cost_amount: '0.0000',
        average_cost_currency: null,
        updated_at: new Date(),
      };
      const clientQuery = jest.fn().mockResolvedValue({ rows: [mockRow] });
      const client = { query: clientQuery };
      const repository = new StockBalancesRepository({} as DatabaseService);

      const result = await repository.replaceLevels(client as never, 'store-1', 'part-1', 5, 25);

      expect(result).toEqual(mockRow);
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (store_id, part_id) DO UPDATE'),
        ['store-1', 'part-1', 5, 25],
      );
    });
  });

  describe('getReconciliation', () => {
    it('runs reconciliation query across active scopes without store filter', async () => {
      const mockRows: ReconciliationRow[] = [
        {
          store_id: 'store-1',
          part_id: 'part-1',
          ledger_on_hand: 10,
          balance_on_hand: 10,
          ledger_reserved: 2,
          balance_reserved: 2,
        },
      ];
      const query = jest.fn().mockResolvedValue({ rows: mockRows });
      const repository = new StockBalancesRepository({ query } as unknown as DatabaseService);

      const result = await repository.getReconciliation(['scope-1', 'scope-2']);

      expect(result).toEqual(mockRows);
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toContain('FULL OUTER JOIN ledger l ON l.store_id = b.store_id AND l.part_id = b.part_id');
      expect(sql).not.toContain('sm.store_id = $2');
      expect(query.mock.calls[0][1]).toEqual([['scope-1', 'scope-2']]);
    });

    it('adds store filter when storeId is provided', async () => {
      const query = jest.fn().mockResolvedValue({ rows: [] });
      const repository = new StockBalancesRepository({ query } as unknown as DatabaseService);

      await repository.getReconciliation(['scope-1'], 'store-1');

      const sql = query.mock.calls[0][0] as string;
      expect(sql).toContain('AND sm.store_id = $2');
      expect(sql).toContain('AND sb.store_id = $2');
      expect(query.mock.calls[0][1]).toEqual([['scope-1'], 'store-1']);
    });
  });

  describe('listMovements', () => {
    it('uses parameterized filters, sorting, and pagination for movements', async () => {
      const queryValue = jest.fn().mockResolvedValue(1);
      const mockRow: StockMovementRow = {
        id: 'mov-1',
        store_id: 'store-1',
        part_id: 'part-1',
        type: StockMovementType.RECEIPT,
        on_hand_delta: 10,
        reserved_delta: 0,
        on_hand_after: 10,
        reserved_after: 0,
        unit_cost_amount: '20.0000',
        unit_cost_currency: 'SAR',
        job_id: null,
        part_issue_id: null,
        purchase_order_id: 'po-1',
        goods_receipt_id: 'gr-1',
        stock_adjustment_id: null,
        reason: 'Initial stock',
        actor_id: 'user-1',
        occurred_at: new Date(),
      };
      const query = jest.fn().mockResolvedValue({ rows: [mockRow] });
      const repository = new StockBalancesRepository({ queryValue, query } as unknown as DatabaseService);

      const result = await repository.listMovements(
        {
          page: 1,
          pageSize: 10,
          storeId: 'store-1',
          partId: 'part-1',
          type: StockMovementType.RECEIPT,
          jobId: 'job-1',
          purchaseOrderId: 'po-1',
          goodsReceiptId: 'gr-1',
          stockAdjustmentId: 'adj-1',
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-01-31T23:59:59.999Z',
          sort: 'occurredAt',
        },
        ['scope-1'],
      );

      expect(result.totalItems).toBe(1);
      expect(result.rows).toHaveLength(1);

      const sql = query.mock.calls[0][0] as string;
      expect(sql).toContain('sm.type = $4');
      expect(sql).toContain('ORDER BY sm.occurred_at ASC, sm.id ASC');
      expect(sql).toContain('LIMIT $11 OFFSET $12');
      expect(query.mock.calls[0][1]).toEqual([
        ['scope-1'],
        'store-1',
        'part-1',
        StockMovementType.RECEIPT,
        'job-1',
        'po-1',
        'gr-1',
        'adj-1',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z',
        10,
        0,
      ]);
    });
  });
});
