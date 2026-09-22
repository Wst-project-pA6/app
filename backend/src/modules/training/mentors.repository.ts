import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { MentorListQuery } from './dto/mentor.dto';

export interface MentorRow {
  id: string;
  display_name: string;
}

@Injectable()
export class MentorsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findEligibleMentor(
    client: PoolClient,
    mentorId: string,
    scopeIds: string[],
  ): Promise<MentorRow | null> {
    const result = await client.query<MentorRow>(
      `SELECT u.id, u.display_name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role_code = 'MENTOR'
       WHERE u.id = $1 AND u.status = 'ACTIVE'
         AND EXISTS (
           SELECT 1 FROM user_organization_scopes uos
           WHERE uos.user_id = u.id AND uos.organization_scope_id = ANY($2::uuid[])
         )`,
      [mentorId, scopeIds],
    );
    return result.rows[0] ?? null;
  }

  async list(query: MentorListQuery, scopeIds: string[]): Promise<{ rows: MentorRow[]; totalItems: number }> {
    const where = [
      `ur.role_code = 'MENTOR'`,
      `u.status = 'ACTIVE'`,
      `EXISTS (SELECT 1 FROM user_organization_scopes uos
               WHERE uos.user_id = u.id AND uos.organization_scope_id = ANY($1::uuid[]))`,
    ];
    const params: unknown[] = [scopeIds];
    if (query.q) {
      params.push(`%${query.q}%`);
      where.push(`u.display_name ILIKE $${params.length}`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(DISTINCT u.id)::int AS count
       FROM users u JOIN user_roles ur ON ur.user_id = u.id ${condition}`,
      params,
    );
    const rows = await this.db.query<MentorRow>(
      `SELECT DISTINCT u.id, u.display_name
       FROM users u JOIN user_roles ur ON ur.user_id = u.id ${condition}
       ORDER BY u.display_name ASC, u.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}
