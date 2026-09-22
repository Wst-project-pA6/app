import { DatabaseService } from '../../common/database/database.service';
import {
  orderReservationsBy,
  PartReservationRow,
  PartReservationsRepository,
  StockBalanceLockRow,
} from './part-reservations.repository';
import { PartReservationStatus } from './dto/part-reservation.dto';
import { StockMovementType } from './dto/stock-balance.dto';

describe('PartReservationsRepository', () => {
  describe('orderReservationsBy', () => {
    it('orders by createdAt ASC by default and handles DESC', () => {
      expect(orderReservationsBy()).toBe('r.created_at ASC');
      expect(orderReservationsBy('createdAt')).toBe('r.created_at ASC');
      expect(orderReservationsBy('-createdAt')).toBe('r.created_at DESC');
      expect(() => orderReservationsBy('quantity')).toThrow('INVALID_SORT');
      expect(() => orderReservationsBy('status')).toThrow('INVALID_SORT');
    });
  });

  describe('listByJobId', () => {
    it('queries reservations for a job with optional status filter and pagination', async () => {
      const mockRow: PartReservationRow = {
        id: 'res-1',
        job_id: 'job-1',
        part_id: 'part-1',
        store_id: 'store-1',
        quantity: 5,
        consumed_quantity: 0,
        status: PartReservationStatus.ACTIVE,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: 'user-1',
        updated_by: 'user-1',
      };
      const queryValue = jest.fn().mockResolvedValue(1);
      const query = jest.fn().mockResolvedValue({ rows: [mockRow] });
      const repository = new PartReservationsRepository({
        queryValue,
        query,
      } as unknown as DatabaseService);

      const result = await repository.listByJobId('job-1', {
        page: 2,
        pageSize: 10,
        status: PartReservationStatus.ACTIVE,
        sort: '-createdAt',
      });

      expect(result.totalItems).toBe(1);
      expect(result.rows).toEqual([mockRow]);

      expect(queryValue).toHaveBeenCalledWith(
        expect.stringContaining('r.job_id = $1 AND r.status = $2'),
        ['job-1', PartReservationStatus.ACTIVE],
      );

      const sql = query.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY r.created_at DESC, r.id ASC');
      expect(sql).toContain('LIMIT $3 OFFSET $4');
      expect(query.mock.calls[0][1]).toEqual([
        'job-1',
        PartReservationStatus.ACTIVE,
        10,
        10,
      ]);
    });
  });

  describe('lockBalance', () => {
    it('executes SELECT FOR UPDATE on stock_balances to serialize reservations', async () => {
      const mockBalance: StockBalanceLockRow = {
        store_id: 'store-1',
        part_id: 'part-1',
        on_hand: 10,
        reserved: 3,
      };
      const clientQuery = jest.fn().mockResolvedValue({ rows: [mockBalance] });
      const client = { query: clientQuery };
      const repository = new PartReservationsRepository({} as DatabaseService);

      const result = await repository.lockBalance(client as never, 'store-1', 'part-1');

      expect(result).toEqual(mockBalance);
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT store_id, part_id, on_hand, reserved'),
        ['store-1', 'part-1'],
      );
      expect(clientQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    });
  });

  describe('lockReservation', () => {
    it('executes SELECT FOR UPDATE on part_reservations', async () => {
      const mockRow: PartReservationRow = {
        id: 'res-1',
        job_id: 'job-1',
        part_id: 'part-1',
        store_id: 'store-1',
        quantity: 5,
        consumed_quantity: 0,
        status: PartReservationStatus.ACTIVE,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: 'user-1',
        updated_by: 'user-1',
      };
      const clientQuery = jest.fn().mockResolvedValue({ rows: [mockRow] });
      const client = { query: clientQuery };
      const repository = new PartReservationsRepository({} as DatabaseService);

      const result = await repository.lockReservation(client as never, 'res-1');

      expect(result).toEqual(mockRow);
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        ['res-1'],
      );
      expect(clientQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    });
  });

  describe('createReservation', () => {
    it('inserts an ACTIVE reservation with initial consumed_quantity=0', async () => {
      const mockRow: PartReservationRow = {
        id: 'res-1',
        job_id: 'job-1',
        part_id: 'part-1',
        store_id: 'store-1',
        quantity: 3,
        consumed_quantity: 0,
        status: PartReservationStatus.ACTIVE,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: 'user-1',
        updated_by: 'user-1',
      };
      const clientQuery = jest.fn().mockResolvedValue({ rows: [mockRow] });
      const client = { query: clientQuery };
      const repository = new PartReservationsRepository({} as DatabaseService);

      const result = await repository.createReservation(client as never, {
        jobId: 'job-1',
        partId: 'part-1',
        storeId: 'store-1',
        quantity: 3,
        actorId: 'user-1',
      });

      expect(result).toEqual(mockRow);
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO part_reservations'),
        ['job-1', 'part-1', 'store-1', 3, 'user-1'],
      );
    });
  });

  describe('updateBalanceReserved', () => {
    it('updates stock balance reserved quantity by delta', async () => {
      const mockRow: StockBalanceLockRow = {
        store_id: 'store-1',
        part_id: 'part-1',
        on_hand: 10,
        reserved: 5,
      };
      const clientQuery = jest.fn().mockResolvedValue({ rows: [mockRow] });
      const client = { query: clientQuery };
      const repository = new PartReservationsRepository({} as DatabaseService);

      const result = await repository.updateBalanceReserved(client as never, 'store-1', 'part-1', 2);

      expect(result).toEqual(mockRow);
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET reserved = reserved + $3'),
        ['store-1', 'part-1', 2],
      );
    });
  });

  describe('createMovement', () => {
    it('appends an immutable stock movement row', async () => {
      const clientQuery = jest.fn().mockResolvedValue({ rows: [] });
      const client = { query: clientQuery };
      const repository = new PartReservationsRepository({} as DatabaseService);

      await repository.createMovement(client as never, {
        storeId: 'store-1',
        partId: 'part-1',
        type: StockMovementType.RESERVATION,
        onHandDelta: 0,
        reservedDelta: 5,
        onHandAfter: 10,
        reservedAfter: 5,
        jobId: 'job-1',
        actorId: 'user-1',
        reason: 'Reserved for job JOB-001',
      });

      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO stock_movements'),
        [
          'store-1',
          'part-1',
          StockMovementType.RESERVATION,
          0,
          5,
          10,
          5,
          'job-1',
          'user-1',
          'Reserved for job JOB-001',
        ],
      );
    });
  });

  describe('consumeReservation', () => {
    it('increases consumed_quantity by the consumed delta and tracks actor', async () => {
      const mockRow: PartReservationRow = {
        id: 'res-1',
        job_id: 'job-1',
        part_id: 'part-1',
        store_id: 'store-1',
        quantity: 5,
        consumed_quantity: 4,
        status: PartReservationStatus.ACTIVE,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: 'user-1',
        updated_by: 'user-2',
      };
      const clientQuery = jest.fn().mockResolvedValue({ rows: [mockRow] });
      const client = { query: clientQuery };
      const repository = new PartReservationsRepository({} as DatabaseService);

      const result = await repository.consumeReservation(client as never, 'res-1', 2, 'user-2');

      expect(result).toEqual(mockRow);
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('consumed_quantity = consumed_quantity + $2'),
        ['res-1', 2, 'user-2'],
      );
      expect(clientQuery.mock.calls[0][0]).toContain("THEN 'FULFILLED'");
    });
  });

  describe('updateReservationStatus', () => {
    it('updates reservation status and tracks actor', async () => {
      const mockRow: PartReservationRow = {
        id: 'res-1',
        job_id: 'job-1',
        part_id: 'part-1',
        store_id: 'store-1',
        quantity: 5,
        consumed_quantity: 0,
        status: PartReservationStatus.RELEASED,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: 'user-1',
        updated_by: 'user-2',
      };
      const clientQuery = jest.fn().mockResolvedValue({ rows: [mockRow] });
      const client = { query: clientQuery };
      const repository = new PartReservationsRepository({} as DatabaseService);

      const result = await repository.updateReservationStatus(
        client as never,
        'res-1',
        PartReservationStatus.RELEASED,
        'user-2',
      );

      expect(result).toEqual(mockRow);
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET status = $2'),
        ['res-1', PartReservationStatus.RELEASED, 'user-2'],
      );
    });
  });
});
