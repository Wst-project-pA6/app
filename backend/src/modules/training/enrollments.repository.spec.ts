import { EnrollmentsRepository } from './enrollments.repository';

describe('EnrollmentsRepository', () => {
  it('inserts an ACTIVE enrollment relying on the partial unique index for duplicate detection', async () => {
    const row = {
      id: 'e1', group_id: 'g1', course_id: 'c1', student_id: 's1', status: 'ACTIVE',
      enrolled_at: new Date(), withdrawn_at: null, withdrawal_reason: null,
      created_at: new Date(), updated_at: new Date(), created_by: 'a1', updated_by: 'a1',
    };
    const query = jest.fn().mockResolvedValue({ rows: [row] });
    const client = { query } as never;
    const repository = new EnrollmentsRepository({} as never);
    await expect(repository.create(client, { groupId: 'g1', courseId: 'c1', studentId: 's1', actor: 'a1' })).resolves.toEqual(row);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO enrollments');
    expect(sql).toContain("'ACTIVE'");
    expect(params).toEqual(['g1', 'c1', 's1', 'a1']);
  });

  it('withdraws an enrollment, stamping withdrawn_at and the reason', async () => {
    const row = {
      id: 'e1', group_id: 'g1', course_id: 'c1', student_id: 's1', status: 'WITHDRAWN',
      enrolled_at: new Date(), withdrawn_at: new Date(), withdrawal_reason: 'Left the program',
      created_at: new Date(), updated_at: new Date(), created_by: 'a1', updated_by: 'a1',
    };
    const query = jest.fn().mockResolvedValue({ rows: [row] });
    const client = { query } as never;
    const repository = new EnrollmentsRepository({} as never);
    await expect(repository.withdraw(client, 'e1', 'Left the program', 'a1')).resolves.toEqual(row);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("SET status = 'WITHDRAWN'");
    expect(sql).toContain('withdrawn_at = CURRENT_TIMESTAMP');
    expect(params).toEqual(['Left the program', 'a1', 'e1']);
  });

  it('rejects an unallowlisted sort field', async () => {
    const db = { queryValue: jest.fn().mockResolvedValue(0) } as never;
    const repository = new EnrollmentsRepository(db);
    await expect(repository.listByGroup('g1', { page: 1, pageSize: 20, sort: 'status' } as never)).rejects.toThrow('INVALID_SORT');
  });
});
