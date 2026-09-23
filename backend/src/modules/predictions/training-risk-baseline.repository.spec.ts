import { DatabaseService } from '../../common/database/database.service';
import { TrainingRiskBaselineRepository } from './training-risk-baseline.repository';

describe('TrainingRiskBaselineRepository.findCandidates', () => {
  it('scopes ACTIVE enrollments by course organization_scope_id', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new TrainingRiskBaselineRepository(db as unknown as DatabaseService);
    await repository.findCandidates(['scope-1'], undefined, undefined);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("e.status = 'ACTIVE'");
    expect(sql).toContain('c.organization_scope_id = ANY($1::uuid[])');
    expect(params).toEqual([['scope-1']]);
  });

  it('adds a courseId filter only when provided', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new TrainingRiskBaselineRepository(db as unknown as DatabaseService);
    await repository.findCandidates(['scope-1'], 'course-1', undefined);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('e.course_id = $2');
    expect(params).toEqual([['scope-1'], 'course-1']);
  });

  it('adds the mentor-own-students EXISTS condition only when mentorUserId is given', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new TrainingRiskBaselineRepository(db as unknown as DatabaseService);
    await repository.findCandidates(['scope-1'], undefined, 'mentor-1');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('ts2.mentor_id = $2');
    expect(params).toEqual([['scope-1'], 'mentor-1']);
  });

  it('counts unsigned assessments as sign_off_status <> SIGNED_OFF and unmet competencies as required tasks with no counted completion', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new TrainingRiskBaselineRepository(db as unknown as DatabaseService);
    await repository.findCandidates(['scope-1'], undefined, undefined);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("a.sign_off_status <> 'SIGNED_OFF'");
    expect(sql).toContain('ct.required = TRUE');
    expect(sql).toContain('a.counts_toward_completion = TRUE');
  });
});
