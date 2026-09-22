import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult } from 'pg';
import { DatabaseService } from './database.service';
import { TransactionService } from './transaction.service';

// Mock pg.Pool
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    connect: jest.fn(),
    on: jest.fn(),
    end: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockPool: jest.Mocked<Pool>;
  let mockConfigService: Partial<ConfigService>;
  let mockClient: jest.Mocked<PoolClient>;

  beforeEach(async () => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    } as unknown as jest.Mocked<PoolClient>;

    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
      on: jest.fn(),
      end: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Pool>;

    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, unknown> = {
          'database.host': 'localhost',
          'database.port': 5432,
          'database.name': 'test_db',
          'database.user': 'test_user',
          'database.password': 'test_pass',
          'database.maxConnections': 10,
          'database.idleTimeoutMs': 30000,
          'database.connectionTimeoutMs': 5000,
          'database.ssl': false,
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
    // Access the private pool for testing
    (service as unknown as { pool: Pool }).pool = mockPool;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should check connection on init', async () => {
      const queryMock = mockPool.query;
      queryMock.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 } as QueryResult);
      await service.onModuleInit();
      expect(queryMock).toHaveBeenCalledWith('SELECT 1');
    });
  });

  describe('onModuleDestroy', () => {
    it('should close the pool', async () => {
      const endMock = mockPool.end;
      await service.onModuleDestroy();
      expect(endMock).toHaveBeenCalled();
    });
  });

  describe('query', () => {
    it('should delegate to pool.query with parameters', async () => {
      const queryMock = mockPool.query;
      const mockResult = { rows: [{ id: 1 }], rowCount: 1 } as QueryResult;
      queryMock.mockResolvedValueOnce(mockResult);

      const result = await service.query('SELECT * FROM test WHERE id = $1', [1]);

      expect(queryMock).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', [1]);
      expect(result).toBe(mockResult);
    });

    it('should delegate to pool.query without parameters', async () => {
      const queryMock = mockPool.query;
      const mockResult = { rows: [{ id: 1 }], rowCount: 1 } as QueryResult;
      queryMock.mockResolvedValueOnce(mockResult);

      const result = await service.query('SELECT * FROM test');

      expect(queryMock).toHaveBeenCalledWith('SELECT * FROM test', undefined);
      expect(result).toBe(mockResult);
    });
  });

  describe('queryOne', () => {
    it('should return first row when results exist', async () => {
      const queryMock = mockPool.query;
      const mockResult = { rows: [{ id: 1 }, { id: 2 }], rowCount: 2 } as QueryResult;
      queryMock.mockResolvedValueOnce(mockResult);

      const result = await service.queryOne('SELECT * FROM test');

      expect(result).toEqual({ id: 1 });
    });

    it('should return null when no results', async () => {
      const queryMock = mockPool.query;
      const mockResult = { rows: [], rowCount: 0 } as QueryResult;
      queryMock.mockResolvedValueOnce(mockResult);

      const result = await service.queryOne('SELECT * FROM test WHERE id = 999');

      expect(result).toBeNull();
    });
  });

  describe('queryValue', () => {
    it('should return first column value of first row', async () => {
      const queryMock = mockPool.query;
      const mockResult = { rows: [{ count: '5' }], rowCount: 1 } as QueryResult;
      queryMock.mockResolvedValueOnce(mockResult);

      const result = await service.queryValue('SELECT COUNT(*) FROM test');

      expect(result).toBe('5');
    });

    it('should return null when no results', async () => {
      const queryMock = mockPool.query;
      const mockResult = { rows: [], rowCount: 0 } as QueryResult;
      queryMock.mockResolvedValueOnce(mockResult);

      const result = await service.queryValue('SELECT COUNT(*) FROM test WHERE id = 999');

      expect(result).toBeNull();
    });
  });

  describe('execute', () => {
    it('should delegate to pool.query for write operations', async () => {
      const queryMock = mockPool.query;
      const mockResult = { rowCount: 1 } as QueryResult;
      queryMock.mockResolvedValueOnce(mockResult);

      const result = await service.execute('INSERT INTO test (name) VALUES ($1)', ['test']);

      expect(queryMock).toHaveBeenCalledWith('INSERT INTO test (name) VALUES ($1)', ['test']);
      expect(result).toBe(mockResult);
    });
  });

  describe('checkConnection', () => {
    it('should return true when SELECT 1 succeeds', async () => {
      const queryMock = mockPool.query;
      queryMock.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 } as QueryResult);

      const result = await service.checkConnection();

      expect(result).toBe(true);
      expect(queryMock).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return false when query fails', async () => {
      const queryMock = mockPool.query;
      queryMock.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.checkConnection();

      expect(result).toBe(false);
    });

    it('should return false when unexpected result', async () => {
      const queryMock = mockPool.query;
      queryMock.mockResolvedValueOnce({ rows: [{ '?column?': 2 }], rowCount: 1 } as QueryResult);

      const result = await service.checkConnection();

      expect(result).toBe(false);
    });
  });

  describe('getTransactionClient', () => {
    it('should connect and begin transaction', async () => {
      const connectMock = mockPool.connect;
      const clientQueryMock = mockClient.query;
      connectMock.mockResolvedValueOnce(mockClient);
      clientQueryMock.mockResolvedValueOnce({} as QueryResult);

      const client = await service.getTransactionClient();

      expect(mockPool.connect.mock.calls).toHaveLength(1);
      expect(mockClient.query.mock.calls).toEqual([['BEGIN']]);
      expect(client).toBe(mockClient);
      expect(mockClient.release.mock.calls).toHaveLength(0);
    });

    it('should destroy the client once and preserve the error when BEGIN fails', async () => {
      const error = new Error('BEGIN failed');
      mockClient.query.mockRejectedValueOnce(error);

      await expect(service.getTransactionClient()).rejects.toBe(error);

      expect(mockPool.connect.mock.calls).toHaveLength(1);
      expect(mockClient.query.mock.calls).toEqual([['BEGIN']]);
      expect(mockClient.release.mock.calls).toEqual([[true]]);
    });

    it('should preserve connection errors without releasing a client', async () => {
      const error = new Error('Connection failed');
      mockPool.connect.mockRejectedValueOnce(error);

      await expect(service.getTransactionClient()).rejects.toBe(error);

      expect(mockPool.connect.mock.calls).toHaveLength(1);
      expect(mockClient.query.mock.calls).toHaveLength(0);
      expect(mockClient.release.mock.calls).toHaveLength(0);
    });
  });

  describe('releaseTransactionClient', () => {
    it('should commit and release when rollback is false', async () => {
      const clientQueryMock = mockClient.query;
      const clientReleaseMock = mockClient.release;
      clientQueryMock.mockResolvedValueOnce({} as QueryResult);

      await service.releaseTransactionClient(mockClient, false);

      expect(clientQueryMock).toHaveBeenCalledWith('COMMIT');
      expect(clientReleaseMock).toHaveBeenCalled();
    });

    it('should rollback and release when rollback is true', async () => {
      const clientQueryMock = mockClient.query;
      const clientReleaseMock = mockClient.release;
      clientQueryMock.mockResolvedValueOnce({} as QueryResult);

      await service.releaseTransactionClient(mockClient, true);

      expect(clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(clientReleaseMock).toHaveBeenCalled();
    });

    it('should attempt rollback on commit error', async () => {
      const clientQueryMock = mockClient.query;
      const clientReleaseMock = mockClient.release;
      clientQueryMock
        .mockRejectedValueOnce(new Error('Commit failed'))
        .mockResolvedValueOnce({} as QueryResult);

      await expect(service.releaseTransactionClient(mockClient, false)).rejects.toThrow('Commit failed');
      expect(clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(clientReleaseMock).toHaveBeenCalled();
    });
  });

  describe('runInTransaction', () => {
    it('should begin, commit, and release on success', async () => {
      const connectMock = mockPool.connect;
      const clientQueryMock = mockClient.query;
      const clientReleaseMock = mockClient.release;
      connectMock.mockResolvedValueOnce(mockClient);
      clientQueryMock.mockResolvedValue({} as QueryResult);

      const callback = jest.fn().mockResolvedValue('success');

      const result = await service.runInTransaction(callback);

      expect(result).toBe('success');
      expect(connectMock).toHaveBeenCalled();
      expect(clientQueryMock).toHaveBeenCalledWith('BEGIN');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(clientQueryMock).toHaveBeenCalledWith('COMMIT');
      expect(clientReleaseMock).toHaveBeenCalled();
    });

    it('should rollback and release on callback error', async () => {
      const connectMock = mockPool.connect;
      const clientQueryMock = mockClient.query;
      const clientReleaseMock = mockClient.release;
      connectMock.mockResolvedValueOnce(mockClient);
      clientQueryMock.mockResolvedValue({} as QueryResult);

      const callback = jest.fn().mockRejectedValue(new Error('Callback failed'));

      await expect(service.runInTransaction(callback)).rejects.toThrow('Callback failed');

      expect(clientQueryMock).toHaveBeenCalledWith('BEGIN');
      expect(clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(clientReleaseMock).toHaveBeenCalled();
    });

    it('should attempt rollback even if rollback fails', async () => {
      const connectMock = mockPool.connect;
      const clientQueryMock = mockClient.query;
      const clientReleaseMock = mockClient.release;
      connectMock.mockResolvedValueOnce(mockClient);
      clientQueryMock
        .mockResolvedValueOnce({} as QueryResult) // BEGIN
        .mockRejectedValueOnce(new Error('Callback failed')) // callback throws
        .mockRejectedValueOnce(new Error('Rollback failed')); // ROLLBACK fails

      const callback = jest.fn().mockRejectedValue(new Error('Callback failed'));

      await expect(service.runInTransaction(callback)).rejects.toThrow('Callback failed');

      expect(clientQueryMock).toHaveBeenCalledTimes(2); // BEGIN, ROLLBACK (single attempt)
      expect(clientReleaseMock).toHaveBeenCalled();
    });
  });

  describe('getPool', () => {
    it('should return the underlying pool', () => {
      const pool = service.getPool();
      expect(pool).toBe(mockPool);
    });
  });
});

describe('TransactionService', () => {
  let service: TransactionService;
  let mockDatabaseService: Partial<DatabaseService>;

  beforeEach(async () => {
    mockDatabaseService = {
      runInTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('runInTransaction', () => {
    it('should delegate to databaseService.runInTransaction', async () => {
      const runInTransactionMock = mockDatabaseService.runInTransaction as jest.Mock;
      runInTransactionMock.mockResolvedValue('result');

      const callback = jest.fn().mockResolvedValue('result');
      const result = await service.runInTransaction(callback);

      expect(runInTransactionMock).toHaveBeenCalledTimes(1);
      expect(runInTransactionMock).toHaveBeenCalledWith(callback);
      expect(result).toBe('result');
    });

    it('should preserve errors from databaseService.runInTransaction', async () => {
      const error = new Error('Transaction failed');
      const runInTransactionMock = mockDatabaseService.runInTransaction as jest.Mock;
      runInTransactionMock.mockRejectedValueOnce(error);
      const callback = jest.fn();

      await expect(service.runInTransaction(callback)).rejects.toBe(error);

      expect(runInTransactionMock).toHaveBeenCalledTimes(1);
      expect(runInTransactionMock).toHaveBeenCalledWith(callback);
    });
  });

});
