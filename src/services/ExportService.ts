import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import ExcelJS from 'exceljs';

import type { IDatabaseService } from '../database/DatabaseService';
import type { ILogger } from '../logger';
import { LogEvent } from '../logger';
import type { VerifiedBusinessFilter } from '../models/dtos';
import type { ExportRow, VerifiedBusinessRow } from '../models/entities';
import { toNumber } from '../models/entities';
import { ExportFormat } from '../models/enums';
import { ExportError } from '../utils/errors';
import { ensureDirectory } from '../utils/fs';
import { fileTimestamp } from '../utils/time';

export interface ExportOptions {
  readonly format: ExportFormat;
  readonly outputDir: string;
  readonly filter?: VerifiedBusinessFilter | undefined;
  /** When set, scopes the export to businesses from this job. */
  readonly jobId?: number | undefined;
}

export interface ExportResult {
  readonly filePath: string;
  readonly recordCount: number;
  readonly format: ExportFormat;
}

/** Columns written to every export format, in order. */
const COLUMNS = [
  { key: 'name',          header: 'Business Name' },
  { key: 'category',      header: 'Category' },
  { key: 'phone',         header: 'Phone' },
  { key: 'address',       header: 'Address' },
  { key: 'city',          header: 'City' },
  { key: 'state',         header: 'State' },
  { key: 'country',       header: 'Country' },
  { key: 'rating',        header: 'Rating' },
  { key: 'reviewCount',   header: 'Review Count' },
  { key: 'provider',      header: 'Provider' },
  { key: 'googleMapsUrl', header: 'Google Maps URL' },
] as const;

type ColumnKey = (typeof COLUMNS)[number]['key'];

export class ExportService {
  public constructor(
    private readonly database: IDatabaseService,
    private readonly logger: ILogger,
  ) {}

  public async run(options: ExportOptions): Promise<ExportResult> {
    this.logger.event(LogEvent.EXPORT_STARTED, 'Export started', {
      format: options.format,
      jobId: options.jobId,
    });

    const rows = await this.loadLeads(options.jobId, options.filter);

    if (rows.length === 0) {
      throw new ExportError(
        'No leads found to export. Run `leadscout verify` first to identify businesses without websites.',
        { jobId: options.jobId },
      );
    }

    await ensureDirectory(options.outputDir);

    const filename = this.buildFilename(options.format, options.jobId);
    const filePath = join(options.outputDir, filename);

    switch (options.format) {
      case ExportFormat.CSV:
        await this.writeCsv(filePath, rows);
        break;
      case ExportFormat.EXCEL:
        await this.writeExcel(filePath, rows);
        break;
      case ExportFormat.JSON:
        await this.writeJson(filePath, rows);
        break;
    }

    await this.recordExport(options.format, filePath, rows.length, options.jobId);

    this.logger.event(LogEvent.EXPORT_FINISHED, 'Export finished', {
      format: options.format,
      filePath,
      recordCount: rows.length,
    });

    return { filePath, recordCount: rows.length, format: options.format };
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  private async loadLeads(
    jobId?: number,
    filter?: VerifiedBusinessFilter,
  ): Promise<VerifiedBusinessRow[]> {
    const conditions: string[] = [
      '`verified` = 1',
      '`hasWebsite` = 0',
    ];
    const params: (string | number)[] = [];

    if (jobId !== undefined) {
      // Join through RawBusinesses to scope by job
      const rows = await this.database.query<VerifiedBusinessRow>(
        `SELECT vb.*
           FROM \`VerifiedBusinesses\` vb
           JOIN \`RawBusinesses\` rb ON rb.\`id\` = vb.\`rawBusinessId\`
          WHERE vb.\`verified\` = 1
            AND vb.\`hasWebsite\` = 0
            AND rb.\`jobId\` = ?
          ORDER BY vb.\`name\` ASC`,
        [jobId],
      );
      return rows;
    }

    if (filter?.city !== undefined) {
      conditions.push('`city` = ?');
      params.push(filter.city);
    }
    if (filter?.state !== undefined) {
      conditions.push('`state` = ?');
      params.push(filter.state);
    }
    if (filter?.country !== undefined) {
      conditions.push('`country` = ?');
      params.push(filter.country);
    }
    if (filter?.category !== undefined) {
      conditions.push('`category` = ?');
      params.push(filter.category);
    }
    if (filter?.provider !== undefined) {
      conditions.push('`provider` = ?');
      params.push(filter.provider);
    }
    if (filter?.minRating !== undefined) {
      conditions.push('`rating` >= ?');
      params.push(filter.minRating);
    }

    return this.database.query<VerifiedBusinessRow>(
      `SELECT * FROM \`VerifiedBusinesses\`
        WHERE ${conditions.join(' AND ')}
        ORDER BY \`name\` ASC`,
      params,
    );
  }

  // ── Writers ───────────────────────────────────────────────────────────────

  private async writeCsv(filePath: string, rows: VerifiedBusinessRow[]): Promise<void> {
    const lines: string[] = [
      COLUMNS.map((c) => this.csvEscape(c.header)).join(','),
      ...rows.map((row) =>
        COLUMNS.map((c) => this.csvEscape(String(this.getValue(row, c.key) ?? ''))).join(','),
      ),
    ];

    const content = lines.join('\n') + '\n';
    await pipeline(Readable.from([content]), createWriteStream(filePath));
  }

  private async writeExcel(filePath: string, rows: VerifiedBusinessRow[]): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LeadScout';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Leads');

    sheet.columns = COLUMNS.map((c) => ({
      header: c.header,
      key: c.key,
      width: this.columnWidth(c.key),
    }));

    // Style the header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E79' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    for (const row of rows) {
      sheet.addRow(
        Object.fromEntries(
          COLUMNS.map((c) => [c.key, this.getValue(row, c.key) ?? '']),
        ),
      );
    }

    // Freeze the header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    await workbook.xlsx.writeFile(filePath);
  }

  private async writeJson(filePath: string, rows: VerifiedBusinessRow[]): Promise<void> {
    const records = rows.map((row) =>
      Object.fromEntries(COLUMNS.map((c) => [c.key, this.getValue(row, c.key) ?? null])),
    );

    const content = JSON.stringify(records, null, 2) + '\n';
    await pipeline(Readable.from([content]), createWriteStream(filePath));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getValue(row: VerifiedBusinessRow, key: ColumnKey): string | number | null {
    switch (key) {
      case 'name':          return row.name;
      case 'category':      return row.category;
      case 'phone':         return row.phone;
      case 'address':       return row.address;
      case 'city':          return row.city;
      case 'state':         return row.state;
      case 'country':       return row.country;
      case 'rating':        return toNumber(row.rating);
      case 'reviewCount':   return row.reviewCount;
      case 'provider':      return row.provider;
      case 'googleMapsUrl': return row.googleMapsUrl;
    }
  }

  private csvEscape(value: string): string {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private columnWidth(key: ColumnKey): number {
    const widths: Record<ColumnKey, number> = {
      name: 35,
      category: 20,
      phone: 18,
      address: 40,
      city: 18,
      state: 18,
      country: 14,
      rating: 8,
      reviewCount: 14,
      provider: 12,
      googleMapsUrl: 50,
    };
    return widths[key];
  }

  private buildFilename(format: ExportFormat, jobId?: number): string {
    const jobPart = jobId !== undefined ? `-job${String(jobId)}` : '';
    const ts = fileTimestamp();
    return `leads${jobPart}-${ts}.${format === ExportFormat.EXCEL ? 'xlsx' : format}`;
  }

  private async recordExport(
    format: ExportFormat,
    filePath: string,
    recordCount: number,
    jobId?: number,
  ): Promise<ExportRow> {
    const result = await this.database.execute(
      `INSERT INTO \`Exports\` (\`jobId\`, \`format\`, \`filePath\`, \`recordCount\`)
       VALUES (?, ?, ?, ?)`,
      [jobId ?? null, format, filePath, recordCount],
    );

    const row = await this.database.queryOne<ExportRow>(
      'SELECT * FROM `Exports` WHERE `id` = ?',
      [result.insertId],
    );

    if (row === null) throw new Error('Export row missing after insert');
    return row;
  }
}
