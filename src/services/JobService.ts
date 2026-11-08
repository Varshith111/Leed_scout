import type { IDatabaseService } from '../database/DatabaseService';
import type { ILogger } from '../logger';
import { LogEvent } from '../logger';
import type { JobRow } from '../models/entities';
import type { CreateJobInput, JobCounterDelta, JobFilter, Pagination } from '../models/dtos';
import { resolvePagination } from '../models/dtos';
import { JobStatus } from '../models/enums';
import { JobError, NotFoundError } from '../utils/errors';

export class JobService {
  public constructor(
    private readonly database: IDatabaseService,
    private readonly logger: ILogger,
  ) {}

  public async create(input: CreateJobInput): Promise<JobRow> {
    const result = await this.database.execute(
      `INSERT INTO \`Jobs\` (\`provider\`, \`category\`, \`city\`, \`state\`, \`country\`)
       VALUES (?, ?, ?, ?, ?)`,
      [input.provider, input.category, input.city, input.state ?? null, input.country ?? null],
    );

    const job = await this.getById(result.insertId);
    this.logger.event(LogEvent.JOB_CREATED, 'Job created', {
      jobId: job.id,
      provider: job.provider,
      category: job.category,
      city: job.city,
    });

    return job;
  }

  public async start(jobId: number): Promise<JobRow> {
    await this.transition(jobId, JobStatus.RUNNING, [JobStatus.PENDING, JobStatus.PAUSED], {
      startedAt: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ''),
    });

    const job = await this.getById(jobId);
    this.logger.event(LogEvent.JOB_STARTED, 'Job started', { jobId });
    return job;
  }

  public async pause(jobId: number): Promise<JobRow> {
    await this.transition(jobId, JobStatus.PAUSED, [JobStatus.RUNNING]);
    const job = await this.getById(jobId);
    this.logger.event(LogEvent.JOB_PAUSED, 'Job paused', { jobId });
    return job;
  }

  public async resume(jobId: number): Promise<JobRow> {
    await this.transition(jobId, JobStatus.RUNNING, [JobStatus.PAUSED]);
    const job = await this.getById(jobId);
    this.logger.event(LogEvent.JOB_RESUMED, 'Job resumed', { jobId });
    return job;
  }

  public async cancel(jobId: number): Promise<JobRow> {
    await this.transition(jobId, JobStatus.CANCELLED, [
      JobStatus.PENDING,
      JobStatus.RUNNING,
      JobStatus.PAUSED,
    ]);
    const job = await this.getById(jobId);
    this.logger.event(LogEvent.JOB_CANCELLED, 'Job cancelled', { jobId });
    return job;
  }

  public async complete(jobId: number): Promise<JobRow> {
    await this.transition(jobId, JobStatus.COMPLETED, [JobStatus.RUNNING], {
      completedAt: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ''),
      progress: 100,
    });
    const job = await this.getById(jobId);
    this.logger.event(LogEvent.JOB_COMPLETED, 'Job completed', { jobId });
    return job;
  }

  public async fail(jobId: number): Promise<JobRow> {
    await this.transition(jobId, JobStatus.FAILED, [JobStatus.RUNNING, JobStatus.PAUSED], {
      completedAt: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ''),
    });
    const job = await this.getById(jobId);
    this.logger.event(LogEvent.JOB_FAILED, 'Job failed', { jobId });
    return job;
  }

  public async incrementCounters(jobId: number, delta: JobCounterDelta): Promise<void> {
    const parts: string[] = [];
    const params: (number | string)[] = [];

    if (delta.businessesFound !== undefined) {
      parts.push('`businessesFound` = `businessesFound` + ?');
      params.push(delta.businessesFound);
    }
    if (delta.businessesVerified !== undefined) {
      parts.push('`businessesVerified` = `businessesVerified` + ?');
      params.push(delta.businessesVerified);
    }
    if (delta.businessesWithoutWebsite !== undefined) {
      parts.push('`businessesWithoutWebsite` = `businessesWithoutWebsite` + ?');
      params.push(delta.businessesWithoutWebsite);
    }

    if (parts.length === 0) return;

    params.push(jobId);
    await this.database.execute(
      `UPDATE \`Jobs\` SET ${parts.join(', ')} WHERE \`id\` = ?`,
      params,
    );
  }

  public async setProgress(jobId: number, progress: number): Promise<void> {
    const clamped = Math.min(100, Math.max(0, Math.round(progress)));
    await this.database.execute('UPDATE `Jobs` SET `progress` = ? WHERE `id` = ?', [
      clamped,
      jobId,
    ]);
  }

  public async getById(jobId: number): Promise<JobRow> {
    const row = await this.database.queryOne<JobRow>('SELECT * FROM `Jobs` WHERE `id` = ?', [
      jobId,
    ]);

    if (row === null) {
      throw new NotFoundError(`Job ${String(jobId)} not found`, { jobId });
    }

    return row;
  }

  public async list(filter: JobFilter = {}, pagination: Pagination = {}): Promise<JobRow[]> {
    const { limit, offset } = resolvePagination(pagination);
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.status !== undefined) {
      conditions.push('`status` = ?');
      params.push(filter.status);
    }
    if (filter.provider !== undefined) {
      conditions.push('`provider` = ?');
      params.push(filter.provider);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    return this.database.query<JobRow>(
      `SELECT * FROM \`Jobs\` ${where} ORDER BY \`createdAt\` DESC LIMIT ? OFFSET ?`,
      params,
    );
  }

  private async transition(
    jobId: number,
    to: JobStatus,
    from: JobStatus[],
    extra: Record<string, string | number> = {},
  ): Promise<void> {
    const job = await this.getById(jobId);

    if (!from.includes(job.status)) {
      throw new JobError(
        `Cannot transition job ${String(jobId)} from ${job.status} to ${to}`,
        { jobId, from: job.status, to },
      );
    }

    const extraCols = Object.keys(extra)
      .map((k) => `\`${k}\` = ?`)
      .join(', ');
    const extraVals = Object.values(extra);
    const setCols = extraCols ? `, ${extraCols}` : '';

    await this.database.execute(
      `UPDATE \`Jobs\` SET \`status\` = ?${setCols} WHERE \`id\` = ?`,
      [to, ...extraVals, jobId],
    );
  }
}
