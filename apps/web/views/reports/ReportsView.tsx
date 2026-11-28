import Link from 'next/link';

import type { ReportsView as Reports, TreatmentRow } from '@oncotrack/contracts';

import { formatDateTime, formatDay } from '@/utils/format';

import { chartHref } from '@/views/charts/ChartTable';

const INPUT = 'min-h-11 rounded-[10px] border border-line bg-surface px-3 py-2 text-base aria-invalid:border-red-600';
const TH = 'px-3 py-2 text-left font-medium';
const TD = 'px-3 py-2';

const days = (value: number | null) =>
  value === null ? '–' : value.toLocaleString('en-IN', { maximumFractionDigits: 1 });

const OUTCOME: Record<TreatmentRow['outcome'], string> = {
  IN_TREATMENT: 'In treatment',
  FINISHED: 'Finished',
  STOPPED: 'Stopped',
};

/** A plain GET form, so a range can be bookmarked or shared. */
export function RangeForm({ from, to, problems }: { from: string; to: string; problems?: Record<string, string[]> }) {
  return (
    <form method="get" action="/reports" aria-label="Dates" className="flex flex-wrap items-start gap-4">
      {(
        [
          ['from', 'From', from],
          ['to', 'To', to],
        ] as const
      ).map(([name, label, value]) => (
        <div key={name} className="flex flex-col gap-1">
          <label htmlFor={`report-${name}`} className="text-sm font-medium">
            {label}
          </label>
          <input
            id={`report-${name}`}
            name={name}
            type="date"
            defaultValue={value}
            aria-invalid={problems?.[name] ? true : undefined}
            className={INPUT}
          />
          {problems?.[name] && <p className="text-sm text-red-600">{problems[name][0]}</p>}
        </div>
      ))}
      <button type="submit" className="mt-6 min-h-11 rounded-[10px] bg-brand px-5 py-2 text-brand-ink hover:opacity-90">
        Show
      </button>
    </form>
  );
}

function Download({ report, file, children }: { report: Reports; file: string; children: string }) {
  const query = new URLSearchParams({ file, from: report.range.from, to: report.range.to });

  return (
    // A file, not a page: a normal link, so the browser downloads it.
    <a href={`/reports/export?${query}`} className="font-medium underline underline-offset-4" download>
      {children}
    </a>
  );
}

function Section({
  id,
  title,
  about,
  download,
  children,
}: {
  id: string;
  title: string;
  about: string;
  download: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {download}
      </div>
      <p className="max-w-3xl text-sm text-muted">{about}</p>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: string }) => (
  <p role="status" className="rounded-md border border-zinc-300 p-4 dark:border-zinc-700">
    {children}
  </p>
);

/** The three reports. Charts are named by RT number only. */
export default function ReportsView({ report }: { report: Reports }) {
  const { summary, items } = report.treatment;

  return (
    <div className="flex flex-col gap-10">
      <p className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted">
        <span>
          {formatDay(report.range.from)} to {formatDay(report.range.to)}. Read {formatDateTime(report.generatedAt)}.
        </span>
        <Download report={report} file="xlsx">
          Download all as a spreadsheet
        </Download>
      </p>

      <Section
        id="waiting-title"
        title="Waiting time by stage"
        about="How long charts spent in each stage, for stays that began in these dates and have ended. “9 in 10 within” is the time nine in ten stays stayed under. The last two columns are charts in the stage right now, whatever the dates."
        download={
          <Download report={report} file="waiting">
            Download as CSV
          </Download>
        }
      >
        <div className="overflow-x-auto">
          <table aria-labelledby="waiting-title" className="w-full min-w-[48rem] text-sm">
            <thead className="border-b border-line">
              <tr>
                <th scope="col" className={TH}>
                  Stage
                </th>
                <th scope="col" className={TH}>
                  Stays finished
                </th>
                <th scope="col" className={TH}>
                  Median (days)
                </th>
                <th scope="col" className={TH}>
                  Average (days)
                </th>
                <th scope="col" className={TH}>
                  9 in 10 within (days)
                </th>
                <th scope="col" className={TH}>
                  Longest (days)
                </th>
                <th scope="col" className={TH}>
                  Waiting now
                </th>
                <th scope="col" className={TH}>
                  Longest now (days)
                </th>
              </tr>
            </thead>
            <tbody>
              {report.waiting.map(row => (
                <tr key={row.stage} className="border-b border-line">
                  <th scope="row" className={`${TD} text-left font-normal`}>
                    {row.stageLabel}
                    {row.phase && <span className="block text-xs text-zinc-500">{row.phase}</span>}
                  </th>
                  <td className={TD}>{row.finished}</td>
                  <td className={TD}>{days(row.medianDays)}</td>
                  <td className={TD}>{days(row.averageDays)}</td>
                  <td className={TD}>{days(row.ninetiethDays)}</td>
                  <td className={TD}>{days(row.longestDays)}</td>
                  <td className={TD}>{row.waitingNow}</td>
                  <td className={TD}>{days(row.longestWaitingNowDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="stalled-title"
        title="Stalled charts"
        about={`Open charts that have been in one stage for ${report.stallDays} days or more, longest first. Charts in treatment are not stalled. This is how things are now, whatever the dates.`}
        download={
          <Download report={report} file="stalled">
            Download as CSV
          </Download>
        }
      >
        {report.stalled.length === 0 ? (
          <Empty>No chart is stalled.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table aria-labelledby="stalled-title" className="w-full min-w-[48rem] text-sm">
              <thead className="border-b border-line">
                <tr>
                  <th scope="col" className={TH}>
                    Chart
                  </th>
                  <th scope="col" className={TH}>
                    Stage
                  </th>
                  <th scope="col" className={TH}>
                    Days
                  </th>
                  <th scope="col" className={TH}>
                    Waiting for
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.stalled.map(row => (
                  <tr key={row.rtNumber} className="border-b border-line">
                    <th scope="row" className={`${TD} text-left font-medium`}>
                      <Link href={chartHref(row.rtNumber)} className="underline underline-offset-4">
                        {row.rtNumber}
                      </Link>
                      {row.priority === 'URGENT' && (
                        <span className="ml-2 text-xs font-semibold text-red-700">Urgent</span>
                      )}
                    </th>
                    <td className={TD}>{row.stageLabel}</td>
                    <td className={TD}>{row.daysInStage}</td>
                    <td className={TD}>
                      {row.waitingFor}
                      {row.assignedTo ? ` (${row.assignedTo})` : row.owner ? ` (${row.owner})` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        id="treatment-title"
        title="Treatment completion"
        about="Charts whose treatment started in these dates, and how each is going. Sessions given is the count recorded at the end, or so far for treatment still going."
        download={
          <Download report={report} file="treatment">
            Download as CSV
          </Download>
        }
      >
        {summary.started === 0 ? (
          <Empty>No treatment started in these dates.</Empty>
        ) : (
          <>
            <dl aria-label="Treatment summary" className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              {(
                [
                  ['Started', summary.started],
                  ['In treatment', summary.inTreatment],
                  ['Finished', summary.finished],
                  ['Stopped', summary.stopped],
                  ['Finished with fewer sessions than planned', summary.finishedShort],
                  ['Average days to finish', days(summary.averageDaysTaken)],
                  [
                    'Sessions given, of those planned',
                    summary.sessionsGivenPercent === null ? '–' : `${summary.sessionsGivenPercent}%`,
                  ],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-xl font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="overflow-x-auto">
              <table aria-labelledby="treatment-title" className="w-full min-w-[40rem] text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <th scope="col" className={TH}>
                      Chart
                    </th>
                    <th scope="col" className={TH}>
                      Outcome
                    </th>
                    <th scope="col" className={TH}>
                      Started
                    </th>
                    <th scope="col" className={TH}>
                      Finished
                    </th>
                    <th scope="col" className={TH}>
                      Days
                    </th>
                    <th scope="col" className={TH}>
                      Sessions given
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(row => (
                    <tr key={row.rtNumber} className="border-b border-line">
                      <th scope="row" className={`${TD} text-left font-medium`}>
                        <Link href={chartHref(row.rtNumber)} className="underline underline-offset-4">
                          {row.rtNumber}
                        </Link>
                      </th>
                      <td className={TD}>{OUTCOME[row.outcome]}</td>
                      <td className={TD}>{formatDay(row.startedOn)}</td>
                      <td className={TD}>{row.finishedOn ? formatDay(row.finishedOn) : '–'}</td>
                      <td className={TD}>{row.daysTaken ?? '–'}</td>
                      <td className={TD}>
                        {row.sessionsGiven === null
                          ? '–'
                          : row.plannedSessions === null
                            ? row.sessionsGiven
                            : `${row.sessionsGiven} of ${row.plannedSessions}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}
