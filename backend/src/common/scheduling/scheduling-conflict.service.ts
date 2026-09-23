import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';

export type ConflictKind =
  | 'BAY_JOB_CONFLICT'
  | 'BAY_SESSION_CONFLICT'
  | 'BAY_UNAVAILABLE'
  | 'BAY_CAPACITY_EXCEEDED'
  | 'MENTOR_SESSION_CONFLICT'
  | 'MENTOR_WORKSHOP_CONFLICT';

export interface CalendarReference {
  kind: 'JOB' | 'TRAINING_SESSION';
  referenceId: string;
  referenceLabel: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ScheduleConflict {
  conflictKey: string;
  kind: ConflictKind;
  overridable: boolean;
  overridden: boolean;
  message: string;
  bayId?: string;
  mentorId?: string;
  conflictingReference?: CalendarReference;
}

export interface OverlapWindow {
  bayId: string;
  personId: string;
  startsAt: Date;
  endsAt: Date;
  /** Excludes this job from the bay/person-vs-job branches (the job being assigned). */
  excludeJobId?: string;
  /** Excludes this session from the bay/person-vs-session branches (the session being evaluated). */
  excludeSessionId?: string;
  /** Also checks the person as a technician on an active job (mentor-vs-workshop double-booking). */
  includePersonJobOverlap: boolean;
}

interface OverlapRow {
  kind: 'BAY_JOB_CONFLICT' | 'BAY_SESSION_CONFLICT' | 'MENTOR_SESSION_CONFLICT' | 'MENTOR_WORKSHOP_CONFLICT';
  reference_id: string;
  reference_label: string;
  starts_at: Date;
  ends_at: Date;
}

const JOB_REFERENCE_KINDS = new Set<OverlapRow['kind']>(['BAY_JOB_CONFLICT', 'MENTOR_WORKSHOP_CONFLICT']);

/**
 * Shared scheduling-conflict engine for the bay calendar workshop jobs and training sessions
 * both write to: bay-vs-job, bay-vs-session, person-vs-session and person-vs-job overlap detection
 * live in one place with one UTC half-open-interval overlap rule and one stable ordering, so a job
 * and a training session can never reach different verdicts about the same window.
 */
@Injectable()
export class SchedulingConflictService {
  /**
   * Half-open interval overlap (`start < otherEnd AND end > otherStart`): touching boundaries
   * (one window's end equals another's start) never conflict.
   */
  async findOverlaps(client: PoolClient, window: OverlapWindow): Promise<OverlapRow[]> {
    const result = await client.query<OverlapRow>(
      `SELECT kind, reference_id, reference_label, starts_at, ends_at FROM (
         SELECT 'BAY_JOB_CONFLICT'::text AS kind, j.id AS reference_id, j.job_number AS reference_label,
                j.scheduled_start_at AS starts_at, j.expected_completion_at AS ends_at
         FROM job_cards j
         WHERE j.bay_id = $1
           AND j.stage IN ('RECEIVED', 'IN_PROGRESS', 'QUALITY_CHECK')
           AND j.scheduled_start_at IS NOT NULL
           AND j.scheduled_start_at < $3::timestamptz AND j.expected_completion_at > $2::timestamptz
           AND ($5::uuid IS NULL OR j.id <> $5)
         UNION ALL
         SELECT 'BAY_SESSION_CONFLICT'::text, s.id, s.title, s.starts_at, s.ends_at
         FROM training_sessions s
         WHERE s.bay_id = $1 AND s.status = 'PUBLISHED'
           AND s.starts_at < $3::timestamptz AND s.ends_at > $2::timestamptz
           AND ($6::uuid IS NULL OR s.id <> $6)
         UNION ALL
         SELECT 'MENTOR_SESSION_CONFLICT'::text, s.id, s.title, s.starts_at, s.ends_at
         FROM training_sessions s
         WHERE s.mentor_id = $4 AND s.status = 'PUBLISHED'
           AND s.starts_at < $3::timestamptz AND s.ends_at > $2::timestamptz
           AND ($6::uuid IS NULL OR s.id <> $6)
         UNION ALL
         SELECT 'MENTOR_WORKSHOP_CONFLICT'::text, j.id, j.job_number, j.scheduled_start_at, j.expected_completion_at
         FROM job_cards j
         WHERE $7::boolean IS TRUE
           AND j.technician_id = $4
           AND j.stage IN ('RECEIVED', 'IN_PROGRESS', 'QUALITY_CHECK')
           AND j.scheduled_start_at IS NOT NULL
           AND j.scheduled_start_at < $3::timestamptz AND j.expected_completion_at > $2::timestamptz
           AND ($5::uuid IS NULL OR j.id <> $5)
       ) conflicts
       ORDER BY starts_at ASC, kind ASC, reference_id ASC`,
      [
        window.bayId, window.startsAt, window.endsAt, window.personId,
        window.excludeJobId ?? null, window.excludeSessionId ?? null, window.includePersonJobOverlap,
      ],
    );
    return result.rows;
  }

  mapOverlaps(
    rows: OverlapRow[],
    context: { bayId: string; personId: string; overridableKinds: ReadonlySet<ConflictKind> },
  ): ScheduleConflict[] {
    return rows.map((row) => ({
      conflictKey: `${row.kind}-${row.reference_id}`,
      kind: row.kind,
      overridable: context.overridableKinds.has(row.kind),
      overridden: false,
      message: `${row.kind.replaceAll('_', ' ')} conflicts with ${row.reference_label}`,
      ...(row.kind.startsWith('BAY_') ? { bayId: context.bayId } : { mentorId: context.personId }),
      conflictingReference: {
        kind: JOB_REFERENCE_KINDS.has(row.kind) ? 'JOB' : 'TRAINING_SESSION',
        referenceId: row.reference_id,
        referenceLabel: row.reference_label,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
      },
    }));
  }

  bayUnavailableConflict(bayId: string): ScheduleConflict {
    return {
      conflictKey: `BAY_UNAVAILABLE-${bayId}`,
      kind: 'BAY_UNAVAILABLE',
      overridable: false,
      overridden: false,
      message: 'Bay is not available',
      bayId,
    };
  }

  bayCapacityExceededConflict(bayId: string, capacity: number, requiredCapacity: number): ScheduleConflict {
    return {
      conflictKey: `BAY_CAPACITY_EXCEEDED-${bayId}`,
      kind: 'BAY_CAPACITY_EXCEEDED',
      overridable: false,
      overridden: false,
      message: `Bay capacity ${capacity} is insufficient for ${requiredCapacity} participants`,
      bayId,
    };
  }

  /** Deterministic total order: by the competing window's start time (own window as fallback), then kind, then key. */
  sortConflicts(conflicts: ScheduleConflict[], fallbackStartsAt: Date): ScheduleConflict[] {
    const timeOf = (conflict: ScheduleConflict): number =>
      conflict.conflictingReference ? conflict.conflictingReference.startsAt.getTime() : fallbackStartsAt.getTime();
    return [...conflicts].sort((a, b) => {
      const delta = timeOf(a) - timeOf(b);
      if (delta !== 0) return delta;
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
      return a.conflictKey < b.conflictKey ? -1 : a.conflictKey > b.conflictKey ? 1 : 0;
    });
  }

  applyOverrides(conflicts: ScheduleConflict[], activeOverrideKeys: ReadonlySet<string>): ScheduleConflict[] {
    return conflicts.map((conflict) => (
      conflict.overridable && activeOverrideKeys.has(conflict.conflictKey)
        ? { ...conflict, overridden: true }
        : conflict
    ));
  }

  /**
   * Full session-perspective evaluation: bay availability and group-capacity resource checks
   * plus all four overlap kinds. Only BAY_JOB_CONFLICT is ever overridable (per contract).
   */
  async evaluateSessionConflicts(
    client: PoolClient,
    params: {
      sessionId: string;
      bayId: string;
      bayStatus: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
      bayCapacity: number;
      requiredCapacity: number;
      mentorId: string;
      startsAt: Date;
      endsAt: Date;
    },
  ): Promise<ScheduleConflict[]> {
    const conflicts: ScheduleConflict[] = [];
    if (params.bayStatus !== 'ACTIVE') conflicts.push(this.bayUnavailableConflict(params.bayId));
    if (params.requiredCapacity > params.bayCapacity) {
      conflicts.push(this.bayCapacityExceededConflict(params.bayId, params.bayCapacity, params.requiredCapacity));
    }
    const rows = await this.findOverlaps(client, {
      bayId: params.bayId,
      personId: params.mentorId,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      excludeSessionId: params.sessionId,
      includePersonJobOverlap: true,
    });
    conflicts.push(...this.mapOverlaps(rows, {
      bayId: params.bayId,
      personId: params.mentorId,
      overridableKinds: new Set<ConflictKind>(['BAY_JOB_CONFLICT']),
    }));
    return this.sortConflicts(conflicts, params.startsAt);
  }
}
