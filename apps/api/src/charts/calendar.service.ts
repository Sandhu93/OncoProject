import { Inject, Injectable } from '@nestjs/common';
import type { Calendar, CalendarDay, CalendarEntry } from '@oncotrack/contracts';
import { DatabaseService } from '../database/database.service.js';
import { DomainError } from '../transactions/domain-error.js';
import { addDays, isIsoDate } from './actions/dates.js';
import type { ChartData } from './actions/types.js';

interface Row {
  rt_number: string;
  stage: string;
  stage_label: string;
  data: ChartData;
}

export const CALENDAR_DEFAULT_DAYS = 14;
export const CALENDAR_MAX_DAYS = 31;

/**
 * The appointments given on open charts, by day: mould, CT Sim and first treatment. They come from the dates
 * the radiographer and physicist recorded on each chart, so the calendar can never disagree with a chart.
 */
@Injectable()
export class CalendarService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async calendar(query: { from?: unknown; days?: unknown }): Promise<Calendar> {
    const todayRow = await this.database.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text AS today`,
    );
    const today = todayRow.rows[0]!.today;

    const from = query.from === undefined || query.from === '' ? today : String(query.from);
    if (!isIsoDate(from)) {
      throw new DomainError(400, 'VALIDATION_FAILED', 'Some fields need attention.', [
        { field: 'from', message: 'Use a date like 2026-12-01.' },
      ]);
    }
    const asked =
      query.days === undefined || query.days === '' ? CALENDAR_DEFAULT_DAYS : Number(query.days);
    if (!Number.isInteger(asked) || asked < 1 || asked > CALENDAR_MAX_DAYS) {
      throw new DomainError(400, 'VALIDATION_FAILED', 'Some fields need attention.', [
        { field: 'days', message: `Choose between 1 and ${CALENDAR_MAX_DAYS} days.` },
      ]);
    }
    const to = addDays(from, asked - 1);

    const charts = await this.database.query<Row>(
      `SELECT c.display_number AS rt_number, c.current_stage AS stage, s.label AS stage_label, c.data
         FROM rt_charts c
         JOIN workflow_stages s ON s.workflow_id = c.workflow_id AND s.code = c.current_stage
        WHERE c.status = 'OPEN'`,
    );

    const all: CalendarEntry[] = [];
    for (const chart of charts.rows) {
      const data = chart.data ?? {};
      const stage = { code: chart.stage, label: chart.stage_label };
      const add = (
        kind: CalendarEntry['kind'],
        date: string | undefined,
        time: string | undefined,
        doneKey: string,
        resource: string | null = null,
      ) => {
        if (!date) return;
        all.push({
          rtNumber: chart.rt_number,
          kind,
          date,
          time: time ?? '',
          resource,
          done: data[doneKey] !== undefined,
          stage,
        });
      };
      add('MOULD', data.mouldDate, data.mouldTime, 'mouldDoneOn');
      add('CT_SIM', data.ctDate, data.ctTime, 'ctDoneOn');
      add(
        'FIRST_TREATMENT',
        data.firstSlotDate,
        data.firstSlotTime,
        'startOn',
        data.linacMachine ?? null,
      );
    }

    const order = (a: CalendarEntry, b: CalendarEntry) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      a.rtNumber.localeCompare(b.rtNumber) ||
      a.kind.localeCompare(b.kind);

    const late = all.filter((entry) => entry.date < today && !entry.done).sort(order);
    const days: CalendarDay[] = [];
    for (let i = 0; i < asked; i++) {
      const date = addDays(from, i);
      days.push({ date, entries: all.filter((entry) => entry.date === date).sort(order) });
    }
    return { today, from, to, late, days };
  }
}
