import { DatabaseService } from '../../common/database/database.service';
import { TrainingSessionsRepository } from './training-sessions.repository';

const sessionId = '11111111-1111-4111-8111-111111111111';
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('TrainingSessionsRepository', () => {
  it('creates via id-only RETURNING and re-fetches so the accurate override count is always read', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: sessionId }] })
        .mockResolvedValueOnce({ rows: [{ id: sessionId, active_conflict_override_count: 0 }] }),
    };
    const repository = new TrainingSessionsRepository({} as DatabaseService);
    await repository.create(client as never, {
      title: 'Engine Basics', courseId: '2', groupId: '3', bayId: '4', mentorId: '5',
      startsAt: '2026-02-01T09:00:00Z', endsAt: '2026-02-01T11:00:00Z', actor,
    });
    expect(client.query.mock.calls[0][0]).toContain('RETURNING id');
    expect(client.query.mock.calls[0][0]).not.toContain('active_conflict_override_count');
    expect(client.query.mock.calls[1][0]).toContain('active_conflict_override_count');
    expect(client.query.mock.calls[1][1]).toEqual([sessionId]);
  });

  it('returns null on a stale version without re-fetching', async () => {
    const client = { query: jest.fn().mockResolvedValueOnce({ rowCount: 0, rows: [] }) };
    const repository = new TrainingSessionsRepository({} as DatabaseService);
    await expect(repository.update(client as never, sessionId, 2, { title: 'x' }, actor)).resolves.toBeNull();
    expect(client.query.mock.calls).toHaveLength(1);
  });

  it('lists only non-voided override keys', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ conflict_key: 'BAY_JOB_CONFLICT-a' }] }) };
    const repository = new TrainingSessionsRepository({} as DatabaseService);
    await expect(repository.findActiveOverrideKeys(client as never, sessionId)).resolves.toEqual(['BAY_JOB_CONFLICT-a']);
    expect(client.query.mock.calls[0][0]).toContain('voided_at IS NULL');
    expect(client.query.mock.calls[0][1]).toEqual([sessionId]);
  });

  it('voids only currently active overrides for the session', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new TrainingSessionsRepository({} as DatabaseService);
    await repository.voidActiveOverrides(client as never, sessionId);
    expect(client.query.mock.calls[0][0]).toContain('SET voided_at = CURRENT_TIMESTAMP');
    expect(client.query.mock.calls[0][0]).toContain('voided_at IS NULL');
    expect(client.query.mock.calls[0][1]).toEqual([sessionId]);
  });

  it('upserts overrides idempotently, reactivating a previously voided key with the new reason', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new TrainingSessionsRepository({} as DatabaseService);
    await repository.upsertOverrides(client as never, sessionId, ['BAY_JOB_CONFLICT-a'], 'Approved for the shift', actor);
    expect(client.query.mock.calls[0][0]).toContain('ON CONFLICT (training_session_id, conflict_key)');
    expect(client.query.mock.calls[0][0]).toContain('voided_at = NULL');
    expect(client.query.mock.calls[0][1]).toEqual([sessionId, ['BAY_JOB_CONFLICT-a'], 'Approved for the shift', actor]);
  });

  it('transitions status and cancellation reason together, re-fetching the accurate row', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: sessionId }] })
        .mockResolvedValueOnce({ rows: [{ id: sessionId, status: 'CANCELLED' }] }),
    };
    const repository = new TrainingSessionsRepository({} as DatabaseService);
    await repository.transitionStatus(client as never, sessionId, 'CANCELLED', 'No longer needed', actor);
    expect(client.query.mock.calls[0][1]).toEqual(['CANCELLED', 'No longer needed', actor, sessionId]);
  });
});
