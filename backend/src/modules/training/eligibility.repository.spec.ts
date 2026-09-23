import { DatabaseService } from '../../common/database/database.service';
import { EligibilityRepository } from './eligibility.repository';

const studentId = '11111111-1111-4111-8111-111111111111';
const courseId = '22222222-2222-4222-8222-222222222222';

describe('EligibilityRepository', () => {
  it('finds the current ACTIVE enrollment only, optionally locking it', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'enr-1' }] }) };
    const repository = new EligibilityRepository({} as DatabaseService);
    await repository.findActiveEnrollment(studentId, courseId, client as never, true);
    expect(client.query.mock.calls[0][0]).toContain("status = 'ACTIVE'");
    expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(client.query.mock.calls[0][1]).toEqual([studentId, courseId]);

    await repository.findActiveEnrollment(studentId, courseId, client as never, false);
    expect(client.query.mock.calls[1][0]).not.toContain('FOR UPDATE');
  });

  it('uses the injected client when given, and DatabaseService otherwise', async () => {
    const dbQuery = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new EligibilityRepository({ query: dbQuery } as unknown as DatabaseService);
    await repository.findActiveEnrollment(studentId, courseId);
    expect(dbQuery).toHaveBeenCalled();

    const clientQuery = jest.fn().mockResolvedValue({ rows: [] });
    await repository.findActiveEnrollment(studentId, courseId, { query: clientQuery } as never);
    expect(clientQuery).toHaveBeenCalled();
    expect(dbQuery.mock.calls).toHaveLength(1);
  });

  it('computes attendance percent excluding EXCUSED from the denominator, rounded in SQL', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ pct: '66.67' }] }) };
    const repository = new EligibilityRepository({} as DatabaseService);
    await expect(repository.findAttendancePercent(studentId, courseId, client as never)).resolves.toBe('66.67');
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("status IN ('PRESENT', 'LATE')");
    expect(sql).toContain("status <> 'EXCUSED'");
    expect(sql).toContain('ROUND(');
    expect(params).toEqual([studentId, courseId]);
  });

  it('checks for an existing ISSUED certificate only', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rowCount: 1 }) };
    const repository = new EligibilityRepository({} as DatabaseService);
    await expect(repository.hasActiveCertificate(studentId, courseId, client as never)).resolves.toBe(true);
    expect(client.query.mock.calls[0][0]).toContain("status = 'ISSUED'");
  });

  it('finds required-task statuses using the latest assessment per task by assessed_at', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new EligibilityRepository({} as DatabaseService);
    await repository.findRequiredTaskStatuses(studentId, courseId, client as never);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('DISTINCT ON (a.task_id)');
    expect(sql).toContain('ORDER BY a.task_id, a.assessed_at DESC, a.id DESC');
    expect(sql).toContain('ct.required = TRUE');
    expect(params).toEqual([studentId, courseId]);
  });

  it('rounds an exact integer ratio via SQL NUMERIC arithmetic, never JS floating point', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ pct: '33.33' }] }) };
    const repository = new EligibilityRepository({} as DatabaseService);
    await expect(repository.computePercent(1, 3, client as never)).resolves.toBe('33.33');
    expect(client.query.mock.calls[0][1]).toEqual([1, 3]);

    const zeroClient = { query: jest.fn().mockResolvedValue({ rows: [{ pct: '0' }] }) };
    await expect(repository.computePercent(0, 0, zeroClient as never)).resolves.toBe('0');
  });
});
