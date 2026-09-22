import { DatabaseService } from '../../common/database/database.service';
import { LaborRepository } from './labor.repository';

describe('LaborRepository', () => {
  it('computes the amount from a snapshotted hourly rate using server-side numeric arithmetic', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ amount: '135.0000' }] }) };
    const repository = new LaborRepository({} as DatabaseService);
    await expect(repository.computeAmount(client as never, '90.0000', 90)).resolves.toBe('135.0000');
    expect(client.query.mock.calls[0][0]).toContain('ROUND($1::numeric * $2::numeric / 60, 4)');
    expect(client.query.mock.calls[0][1]).toEqual(['90.0000', 90]);
  });

  it('creates a labor entry with the server-selected technician and parameterized values', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'l1' }] }) };
    const repository = new LaborRepository({} as DatabaseService);
    await repository.create(client as never, {
      jobId: 'job1', technicianId: 'tech1', workDate: '2026-10-02', durationMinutes: 90,
      hourlyRateAmount: '90.0000', hourlyRateCurrency: 'USD', amount: '135.0000', actor: 'tech1',
    });
    expect(client.query.mock.calls[0][0]).toContain('INSERT INTO labor_entries');
    expect(client.query.mock.calls[0][1]).toEqual(['job1', null, 'tech1', '2026-10-02', 90, null, '90.0000', 'USD', '135.0000', 'tech1']);
  });

  it('locks the labor entry row for correction or voiding', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'l1', status: 'ACTIVE' }] }) };
    const repository = new LaborRepository({} as DatabaseService);
    await repository.findLocked(client as never, 'job1', 'l1');
    expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(client.query.mock.calls[0][1]).toEqual(['l1', 'job1']);
  });

  it('voids a labor entry retaining the row with a reason', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'l1', status: 'VOIDED' }] }) };
    const repository = new LaborRepository({} as DatabaseService);
    await repository.void(client as never, 'l1', 'Wrong job', 'tech1');
    expect(client.query.mock.calls[0][0]).toContain("status = 'VOIDED'");
    expect(client.query.mock.calls[0][1]).toEqual(['Wrong job', 'tech1', 'l1']);
  });

  it('lists entries sorted by workDate by default and validates the sort allowlist', async () => {
    const queryValue = jest.fn().mockResolvedValue(1);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new LaborRepository({ queryValue, query } as unknown as DatabaseService);
    await repository.list('job1', { page: 1, pageSize: 20 });
    expect(query.mock.calls[0][0]).toContain('work_date ASC');
    await expect(repository.list('job1', { page: 1, pageSize: 20, sort: 'amount' })).rejects.toThrow('INVALID_SORT');
  });

  it('supports comma-separated multi-field sorting, matching the JobsRepository orderBy convention', async () => {
    const queryValue = jest.fn().mockResolvedValue(1);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new LaborRepository({ queryValue, query } as unknown as DatabaseService);
    await repository.list('job1', { page: 1, pageSize: 20, sort: '-createdAt,workDate' });
    expect(query.mock.calls[0][0]).toContain('created_at DESC, work_date ASC, id ASC');
  });

  it('checks for an APPROVED ADDITIONAL_WORK approval covering the work item', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rowCount: 1 }) };
    const repository = new LaborRepository({} as DatabaseService);
    await expect(repository.hasApprovedAdditionalWorkApproval(client as never, 'w1')).resolves.toBe(true);
    expect(client.query.mock.calls[0][0]).toContain("scope = 'ADDITIONAL_WORK'");
  });
});
