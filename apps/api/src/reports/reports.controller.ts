import { Controller, Get, Inject, Param, Query, Res, StreamableFile } from '@nestjs/common';
import type { ReportsView } from '@oncotrack/contracts';
import { requireCapability } from '../admin/capability.js';
import { CurrentActor, type Actor } from '../auth/actor.js';
import { DomainError } from '../transactions/domain-error.js';
import { REPORT_NAMES, csv, tables, workbook, type ReportName } from './report-files.js';
import { ReportsService, type ReportQuery } from './reports.service.js';

interface ResponseLike {
  setHeader(name: string, value: string): unknown;
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get()
  report(@CurrentActor() actor: Actor, @Query() query: ReportQuery): Promise<ReportsView> {
    return this.reports.report(actor, query);
  }

  /** All three reports as one workbook. */
  @Get('export.xlsx')
  async workbook(
    @CurrentActor() actor: Actor,
    @Query() query: ReportQuery,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    const report = await this.reports.report(actor, query);
    return this.file(
      response,
      XLSX,
      `oncotrack-reports-${report.range.from}-to-${report.range.to}.xlsx`,
      await workbook(report),
    );
  }

  /** One report as CSV. */
  @Get('export/:name')
  async csv(
    @CurrentActor() actor: Actor,
    @Param('name') name: string,
    @Query() query: ReportQuery,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    requireCapability(actor, 'EXPORT_REPORTS');
    if (!(REPORT_NAMES as readonly string[]).includes(name)) {
      throw new DomainError(404, 'NO_SUCH_REPORT', 'There is no such report.');
    }
    const report = await this.reports.report(actor, query);
    const table = tables(report)[name as ReportName];
    return this.file(
      response,
      'text/csv; charset=utf-8',
      `oncotrack-${table.title}-${report.range.from}-to-${report.range.to}.csv`,
      Buffer.from(csv(table), 'utf8'),
    );
  }

  private file(response: ResponseLike, type: string, filename: string, body: Buffer) {
    response.setHeader('Content-Type', type);
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(body);
  }
}
