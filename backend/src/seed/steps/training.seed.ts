import { SeedContext } from '../context';
import { ensureCreated, findIdByField } from '../idempotent';
import { SeedApiError } from '../http-client';

/** Enrollments have a unique (group, student) constraint but no single-item GET — recover the
 * existing id from a 409 by listing the group's enrollments and matching on studentId. */
async function enrollStudent(ctx: SeedContext, manifestKey: string, groupId: string, studentId: string): Promise<void> {
  if (ctx.manifest.get(manifestKey)) return;
  try {
    const enrollment = await ctx.client.post(`training-groups/${groupId}/enrollments`, 'supervisor', { studentId }, [200, 201]);
    ctx.manifest.set(manifestKey, enrollment.id as string);
  } catch (error) {
    if (error instanceof SeedApiError && error.status === 409) {
      const id = await findIdByField(ctx, `training-groups/${groupId}/enrollments`, 'supervisor', 'studentId', studentId);
      ctx.manifest.set(manifestKey, id);
      return;
    }
    throw error;
  }
}

function dateOnly(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60_000).toISOString().slice(0, 10);
}

function isoInDays(daysFromNow: number, hour: number): string {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60_000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

export async function seedTraining(ctx: SeedContext): Promise<void> {
  const { client, ids } = ctx;
  const trainingScopeId = ids.scopes.training;

  ctx.log('Creating training term...');
  // No single-item GET and no DB uniqueness constraint on training_terms — the manifest is the
  // only duplication guard here (see idempotent.ts / docs/DEMO_SEED.md).
  const term = await ensureCreated(ctx, 'training-term:fall-2026', {
    create: () =>
      client.post('training-terms', 'supervisor', {
        organizationScopeId: trainingScopeId,
        name: 'Fall 2026 Cohort',
        startDate: dateOnly(-14),
        endDate: dateOnly(90),
      }),
  });

  ctx.log('Creating training courses...');
  const course1 = await ensureCreated(ctx, 'course:electrical-fundamentals', {
    create: () =>
      client.post('courses', 'supervisor', {
        organizationScopeId: trainingScopeId,
        code: 'DEMO-CRS-01',
        name: { en: 'Automotive Electrical Fundamentals' },
        termId: term.id,
        description: 'Introduction to automotive electrical systems and diagnostics.',
        tasks: [],
        minimumAttendancePercent: 80,
      }),
    recoverOnDuplicate: () => findIdByField(ctx, 'courses', 'supervisor', 'code', 'DEMO-CRS-01'),
  });
  const course2 = await ensureCreated(ctx, 'course:engine-diagnostics', {
    create: () =>
      client.post('courses', 'supervisor', {
        organizationScopeId: trainingScopeId,
        code: 'DEMO-CRS-02',
        name: { en: 'Engine Diagnostics Basics' },
        termId: term.id,
        description: 'Foundations of engine diagnostic scanning and interpretation.',
        tasks: [],
        minimumAttendancePercent: 75,
      }),
    recoverOnDuplicate: () => findIdByField(ctx, 'courses', 'supervisor', 'code', 'DEMO-CRS-02'),
  });

  ctx.log('Creating student records...');
  const student1 = await ensureCreated(ctx, 'student:student1', {
    verify: async (id) => (await client.tryGet(`students/${id}`, 'supervisor')) !== null,
    create: () => client.post('students', 'supervisor', { userId: ids.users.student1, studentNumber: 'DEMO-STU-001' }),
    recoverOnDuplicate: () => findIdByField(ctx, 'students', 'supervisor', 'userId', ids.users.student1),
  });
  const student2 = await ensureCreated(ctx, 'student:student2', {
    verify: async (id) => (await client.tryGet(`students/${id}`, 'supervisor')) !== null,
    create: () => client.post('students', 'supervisor', { userId: ids.users.student2, studentNumber: 'DEMO-STU-002' }),
    recoverOnDuplicate: () => findIdByField(ctx, 'students', 'supervisor', 'userId', ids.users.student2),
  });

  ctx.log('Creating a training group and enrollments...');
  // No single-item GET and no DB uniqueness constraint on training_groups — manifest-guarded only.
  // A session's groupId must belong to the same courseId (enforced by the service), so each
  // course gets its own group.
  const groupA = await ensureCreated(ctx, 'training-group:cohort-a', {
    // Each demo course has exactly one demo group — a reliable natural key for self-healing.
    findExisting: async () => {
      const page = await client.get('training-groups', 'supervisor', { courseId: course1.id, pageSize: 1 });
      return (page.items[0]?.id as string) ?? null;
    },
    create: () => client.post('training-groups', 'supervisor', { name: 'Cohort A - Electrical Fundamentals', courseId: course1.id }),
  });
  const groupB = await ensureCreated(ctx, 'training-group:cohort-b', {
    findExisting: async () => {
      const page = await client.get('training-groups', 'supervisor', { courseId: course2.id, pageSize: 1 });
      return (page.items[0]?.id as string) ?? null;
    },
    create: () => client.post('training-groups', 'supervisor', { name: 'Cohort B - Engine Diagnostics', courseId: course2.id }),
  });

  await enrollStudent(ctx, 'enrollment:groupA:student1', groupA.id, student1.id);
  await enrollStudent(ctx, 'enrollment:groupA:student2', groupA.id, student2.id);
  await enrollStudent(ctx, 'enrollment:groupB:student2', groupB.id, student2.id);

  ctx.log('Creating training sessions...');
  await ensureCreated(ctx, 'training-session:electrical-1', {
    verify: async (id) => (await client.tryGet(`training-sessions/${id}`, 'supervisor')) !== null,
    create: () =>
      client.post('training-sessions', 'supervisor', {
        title: 'Electrical Systems - Session 1',
        courseId: course1.id,
        groupId: groupA.id,
        bayId: ids.bays.bay1,
        mentorId: ids.users.mentor,
        startsAt: isoInDays(2, 9),
        endsAt: isoInDays(2, 11),
      }),
  });
  await ensureCreated(ctx, 'training-session:diagnostics-1', {
    verify: async (id) => (await client.tryGet(`training-sessions/${id}`, 'supervisor')) !== null,
    create: () =>
      client.post('training-sessions', 'supervisor', {
        title: 'Engine Diagnostics - Session 1',
        courseId: course2.id,
        groupId: groupB.id,
        bayId: ids.bays.bay2,
        mentorId: ids.users.mentor,
        startsAt: isoInDays(4, 9),
        endsAt: isoInDays(4, 11),
      }),
  });

  ctx.log('Training data ready: 1 term, 2 courses, 2 students, 2 groups, 3 enrollments, 2 sessions.');
}
