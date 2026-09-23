import { DatabaseService } from '../../common/database/database.service';
import { AssessmentsRepository } from './assessments.repository';

const assessmentId = '11111111-1111-4111-8111-111111111111';
const courseId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const groupId = '44444444-4444-4444-8444-444444444444';
const studentId = '55555555-5555-4555-8555-555555555555';
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('AssessmentsRepository', () => {
  it('scopes findScoped through the course organization and joins the session mentor for authorization', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new AssessmentsRepository({} as DatabaseService);
    await repository.findScoped(assessmentId, ['scope-1'], client as never, true);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('c.organization_scope_id = ANY($2::uuid[])');
    expect(sql).toContain('ts.mentor_id AS session_mentor_id');
    expect(sql).toContain('FOR UPDATE OF a');
    expect(params).toEqual([assessmentId, ['scope-1']]);
  });

  it('checks task-in-course and active-enrollment membership with parameterized queries', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rowCount: 1 }) };
    const repository = new AssessmentsRepository({} as DatabaseService);
    await expect(repository.isTaskInCourse(client as never, courseId, taskId)).resolves.toBe(true);
    expect(client.query.mock.calls[0][1]).toEqual([courseId, taskId]);

    await expect(repository.isStudentActivelyEnrolled(client as never, groupId, studentId)).resolves.toBe(true);
    expect(client.query.mock.calls[1][0]).toContain("status = 'ACTIVE'");
    expect(client.query.mock.calls[1][1]).toEqual([groupId, studentId]);
  });

  it('creates via id-only RETURNING and re-fetches the full row including evidence', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: assessmentId }] })
        .mockResolvedValueOnce({ rows: [{ id: assessmentId, evidence_attachment_ids: [] }] }),
    };
    const repository = new AssessmentsRepository({} as DatabaseService);
    await repository.create(client as never, {
      sessionId: 'session-1', studentId, taskId, courseId, result: 'PASS', timeOnTaskMinutes: 20, actor,
    });
    expect(client.query.mock.calls[0][0]).toContain('RETURNING id');
    expect(client.query.mock.calls[1][0]).toContain('evidence_attachment_ids');
  });

  it('signs off only a not-yet-signed row, guarding the WHERE clause as defense-in-depth', async () => {
    const client = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ id: assessmentId }] }).mockResolvedValueOnce({ rows: [{ id: assessmentId }] }) };
    const repository = new AssessmentsRepository({} as DatabaseService);
    await repository.signOff(client as never, assessmentId, { status: 'SIGNED_OFF', note: null, actor, countsTowardCompletion: true });
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("sign_off_status <> 'SIGNED_OFF'");
    expect(params).toEqual(['SIGNED_OFF', actor, null, true, assessmentId]);

    const lockedClient = { query: jest.fn().mockResolvedValueOnce({ rowCount: 0, rows: [] }) };
    await expect(repository.signOff(lockedClient as never, assessmentId, { status: 'SIGNED_OFF', note: null, actor, countsTowardCompletion: true }))
      .resolves.toBeNull();
  });

  it('links evidence attachments through the TRAINING_EVIDENCE/ASSESSMENT contract exactly like other evidence modules', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'att-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
    };
    const repository = new AssessmentsRepository({} as DatabaseService);
    await repository.linkEvidenceAttachments(client as never, assessmentId, ['att-1'], actor);
    expect(client.query.mock.calls[0][0]).toContain("purpose = 'TRAINING_EVIDENCE'");
    expect(client.query.mock.calls[1][0]).toContain("owner_type = 'ASSESSMENT'");
    expect(client.query.mock.calls[2][0]).toContain('INSERT INTO assessment_evidence_attachments');
  });

  it('throws ATTACHMENT_NOT_LINKABLE when not every attachment matches the ownership/purpose/window guard', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    const repository = new AssessmentsRepository({} as DatabaseService);
    await expect(repository.linkEvidenceAttachments(client as never, assessmentId, ['att-1'], actor)).rejects.toThrow('ATTACHMENT_NOT_LINKABLE');
  });
});
