import type { IDatabaseService } from '../database/DatabaseService';
import type { ILogger } from '../logger';

export interface JobStats {
  readonly total: number;
  readonly pending: number;
  readonly running: number;
  readonly paused: number;
  readonly completed: number;
  readonly failed: number;
  readonly cancelled: number;
}

export interface BusinessStats {
  readonly totalRaw: number;
  readonly totalVerified: number;
  readonly withWebsite: number;
  readonly withoutWebsite: number;
  readonly conversionRate: number;
}

export interface TopCity {
  readonly city: string;
  readonly count: number;
}

export interface RecentExport {
  readonly id: number;
  readonly format: string;
  readonly recordCount: number;
  readonly filePath: string;
  readonly createdAt: string;
}

export interface AppStats {
  readonly jobs: JobStats;
  readonly businesses: BusinessStats;
  readonly topCities: TopCity[];
  readonly recentExports: RecentExport[];
}

export class StatsService {
  public constructor(
    private readonly database: IDatabaseService,
    _logger: ILogger,
  ) {}

  public async get(): Promise<AppStats> {
    const [jobs, businesses, topCities, recentExports] = await Promise.all([
      this.getJobStats(),
      this.getBusinessStats(),
      this.getTopCities(),
      this.getRecentExports(),
    ]);

    return { jobs, businesses, topCities, recentExports };
  }

  private async getJobStats(): Promise<JobStats> {
    const rows = await this.database.query<{ status: string; count: number }>(
      `SELECT \`status\`, COUNT(*) AS \`count\` FROM \`Jobs\` GROUP BY \`status\``,
    );

    const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));

    return {
      total: rows.reduce((sum, r) => sum + Number(r.count), 0),
      pending:   byStatus['PENDING']   ?? 0,
      running:   byStatus['RUNNING']   ?? 0,
      paused:    byStatus['PAUSED']    ?? 0,
      completed: byStatus['COMPLETED'] ?? 0,
      failed:    byStatus['FAILED']    ?? 0,
      cancelled: byStatus['CANCELLED'] ?? 0,
    };
  }

  private async getBusinessStats(): Promise<BusinessStats> {
    const [rawRow, verRow] = await Promise.all([
      this.database.queryOne<{ total: number }>(
        'SELECT COUNT(*) AS `total` FROM `RawBusinesses`',
      ),
      this.database.queryOne<{ total: number; withWebsite: number; withoutWebsite: number }>(
        `SELECT
           COUNT(*) AS \`total\`,
           SUM(\`hasWebsite\` = 1) AS \`withWebsite\`,
           SUM(\`hasWebsite\` = 0 AND \`verified\` = 1) AS \`withoutWebsite\`
         FROM \`VerifiedBusinesses\``,
      ),
    ]);

    const totalRaw      = Number(rawRow?.total ?? 0);
    const totalVerified = Number(verRow?.total ?? 0);
    const withWebsite   = Number(verRow?.withWebsite ?? 0);
    const withoutWebsite = Number(verRow?.withoutWebsite ?? 0);
    const conversionRate = totalRaw > 0
      ? Math.round((withoutWebsite / totalRaw) * 1000) / 10
      : 0;

    return { totalRaw, totalVerified, withWebsite, withoutWebsite, conversionRate };
  }

  private async getTopCities(): Promise<TopCity[]> {
    return this.database.query<TopCity>(
      `SELECT \`city\`, COUNT(*) AS \`count\`
         FROM \`VerifiedBusinesses\`
        WHERE \`verified\` = 1 AND \`hasWebsite\` = 0 AND \`city\` IS NOT NULL
        GROUP BY \`city\`
        ORDER BY \`count\` DESC
        LIMIT 10`,
    );
  }

  private async getRecentExports(): Promise<RecentExport[]> {
    return this.database.query<RecentExport>(
      `SELECT \`id\`, \`format\`, \`recordCount\`, \`filePath\`, \`createdAt\`
         FROM \`Exports\`
        ORDER BY \`createdAt\` DESC
        LIMIT 5`,
    );
  }
}
