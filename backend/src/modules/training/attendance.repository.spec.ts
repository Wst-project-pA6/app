import { DatabaseService } from '../../common/database/database.service';
import { AttendanceRepository } from './attendance.repository';

const sessionId = '11111111-1111-4111-8111-111111111111';
const groupId = '22222222-2222-4222-8222-222222222222';
const studentA = '33333333-3333-4333-8333-333333333333';
const studentB = '44444444-4444-4444-8444-444444444444';
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('AttendanceRepository', () => {
  it('checks ACTIVE enrollment membership scoped to the session group only', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ student_id: studentA }] }) };
    const repository = new AttendanceRepository({} as DatabaseService);
    await expect(repository.findActiveEnrolledStudentIds(client as never, groupId, [studentA, studentB])).resolves.toEqual(new Set([studentA]));
    expect(client.query.mock.calls[0][0]).toContain("status = 'ACTIVE'");
    expect(client.query.mock.calls[0][1]).toEqual([groupId, [studentA, studentB]]);
  });

  it('locks existing rows for the audited before-snapshot', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new AttendanceRepository({} as DatabaseService);
    await repository.findExisting(client as never, sessionId, [studentA]);
    expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE');
  });

  it('locks existing rows in a deterministic student_id order to avoid deadlocking against upsertBulk\'s own sorted lock order', async () => {
    // Two overlapping concurrent PUT /training-sessions/{id}/attendance calls both start by
    // locking here (findExisting) before locking again in upsertBulk. Without an explicit
    // ORDER BY, Postgres gives no guarantee that FOR UPDATE acquires locks in the ANY($2)
    // array's order, so the two calls could each grab a subset of overlapping rows in opposite
    // relative order and deadlock. Ordering by student_id here matches upsertBulk's own
    // studentId-sorted lock sequence, so every caller acquires these rows in the same order.
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new AttendanceRepository({} as DatabaseService);
    await repository.findExisting(client as never, sessionId, [studentB, studentA]);
    const [sql] = client.query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY ar\.student_id\s+FOR UPDATE OF ar/);
  });

  it('upserts in a deterministic, studentId-sorted order regardless of input order', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new AttendanceRepository({} as DatabaseService);
    await repository.upsertBulk(
      client as never, sessionId,
      [{ studentId: studentB, status: 'ABSENT', note: null }, { studentId: studentA, status: 'PRESENT', note: 'On time' }],
      actor,
    );
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (session_id, student_id) DO UPDATE');
    expect(params).toEqual([sessionId, [studentA, studentB], ['PRESENT', 'ABSENT'], ['On time', null], actor]);
  });

  it('uses parameterized list filters with no raw filter text in SQL', async () => {
    const queryValue = jest.fn().mockResolvedValue(2);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new AttendanceRepository({ queryValue, query } as unknown as DatabaseService);
    await repository.list({ page: 1, pageSize: 20, sessionId, status: 'PRESENT' } as never, ['scope-1'], { mentorId: 'mentor-1' });
    expect(query.mock.calls[0][0]).toContain('ar.recorded_at DESC');
    expect(query.mock.calls[0][0]).toContain('ts.mentor_id = $4');
    expect(query.mock.calls[0][1]).toEqual([['scope-1'], sessionId, 'PRESENT', 'mentor-1', 20, 0]);
    await expect(repository.list({ page: 1, pageSize: 20, sort: 'status' } as never, [])).rejects.toThrow('INVALID_SORT');
  });
});
