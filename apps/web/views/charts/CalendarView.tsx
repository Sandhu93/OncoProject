import Link from 'next/link';

import type { Calendar, CalendarEntry } from '@oncotrack/contracts';

import { formatDay, formatWeekday, shiftDay } from '@/utils/format';

import { chartHref } from './ChartTable';

const KIND_LABELS: Record<CalendarEntry['kind'], string> = {
  MOULD: 'Mould',
  CT_SIM: 'CT Sim',
  FIRST_TREATMENT: 'First treatment',
};

/** One appointment: when, what, which chart, and whether it has been recorded as done. */
function Entry({ entry, showDate }: { entry: CalendarEntry; showDate?: boolean }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1">
      {showDate && <span className="w-24 text-sm">{formatWeekday(entry.date)}</span>}
      <span className="w-14 tabular-nums">{entry.time || '—'}</span>
      <span className="w-32 font-medium">{KIND_LABELS[entry.kind]}</span>
      <Link href={chartHref(entry.rtNumber)} className="underline underline-offset-4">
        {entry.rtNumber}
      </Link>
      {entry.resource && <span className="text-sm">{entry.resource}</span>}
      <span className="text-sm text-muted">
        {entry.done ? 'Done' : 'Not recorded as done'} · {entry.stage.label}
      </span>
    </li>
  );
}

/** Mould, CT Sim and first-treatment appointments by day, with a way to move a fortnight at a time. */
export default function CalendarView({ calendar }: { calendar: Calendar }) {
  const span = calendar.days.length;
  const previous = shiftDay(calendar.from, -span);
  const next = shiftDay(calendar.from, span);
  const booked = calendar.days.reduce((sum, day) => sum + day.entries.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Dates" className="flex flex-wrap items-center gap-4">
        <Link href={`/calendar?from=${previous}`} className="underline underline-offset-4">
          Previous {span} days
        </Link>
        <Link href="/calendar" className="underline underline-offset-4">
          Today
        </Link>
        <Link href={`/calendar?from=${next}`} className="underline underline-offset-4">
          Next {span} days
        </Link>
        <p className="text-sm text-muted">
          {formatDay(calendar.from)} to {formatDay(calendar.to)}: {booked}{' '}
          {booked === 1 ? 'appointment' : 'appointments'}
        </p>
      </nav>

      {calendar.late.length > 0 && (
        <section aria-labelledby="late" className="flex flex-col gap-2 rounded-md border border-red-300 p-3">
          <h2 id="late" className="text-lg font-medium">
            Not recorded as done
          </h2>
          <p className="text-sm text-muted">
            These dates have passed. Record the step on the chart, or give new dates.
          </p>
          <ul>
            {calendar.late.map(entry => (
              <Entry key={`${entry.rtNumber}-${entry.kind}`} entry={entry} showDate />
            ))}
          </ul>
        </section>
      )}

      <ol aria-label="Days" className="flex flex-col gap-4">
        {calendar.days.map(day => (
          <li
            key={day.date}
            aria-label={formatWeekday(day.date)}
            className="border-b border-zinc-200 pb-3 dark:border-zinc-800"
          >
            <h2 className="text-base font-semibold">
              {formatWeekday(day.date)}
              {day.date === calendar.today && <span className="ml-2 text-sm font-normal">(today)</span>}
            </h2>
            {day.entries.length === 0 ? (
              <p className="text-sm text-muted">Nothing booked.</p>
            ) : (
              <ul>
                {day.entries.map(entry => (
                  <Entry key={`${entry.rtNumber}-${entry.kind}`} entry={entry} />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
