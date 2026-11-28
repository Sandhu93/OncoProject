import Link from 'next/link';

import type { ChartQueue, QueueItem } from '@oncotrack/contracts';

import { chartHref } from '@/views/charts/ChartTable';

import { chartsText, type PhaseCount } from './phases';

const card = 'rounded-xl border border-line bg-surface';

/** One number with a plain label under it. */
function Tile({
  label,
  value,
  note,
  strong = false,
}: {
  label: string;
  value: number;
  note: string;
  strong?: boolean;
}) {
  return (
    <div className={`${card} p-4`}>
      <p className={`text-3xl font-bold leading-tight ${strong ? 'text-brand' : ''}`}>{value}</p>
      <p className="mt-1 text-sm font-semibold">{label}</p>
      <p className="text-sm text-muted">{note}</p>
    </div>
  );
}

/** The five numbers worth a glance. Two across on a phone, three on a tablet, five on a desk. */
export function HomeTiles({
  totals,
  waitingForYou,
  urgentForYou,
  stallDays,
}: {
  totals: ChartQueue['totals'];
  waitingForYou: number;
  urgentForYou: number;
  stallDays: number;
}) {
  return (
    <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
      <Tile label="Open charts" value={totals.open} note="all phases" />
      <Tile
        label="Waiting for you"
        value={waitingForYou}
        note={urgentForYou > 0 ? `${urgentForYou} urgent` : 'none urgent'}
        strong
      />
      <Tile label={`Stuck ${stallDays}+ days`} value={totals.stalled} note="with someone" />
      <Tile label="In treatment" value={totals.inTreatment} note="on the machine" />
      <Tile label="Saturday updates due" value={totals.saturdayUpdatesToCome} note="not yet in" />
    </section>
  );
}

/** Where the open charts are, phase by phase. The bar is for the eye; the words carry the meaning. */
export function PhaseBars({ phases, total }: { phases: readonly PhaseCount[]; total: number }) {
  const most = Math.max(1, ...phases.map(phase => phase.open));

  return (
    <section aria-labelledby="where" className={`${card} p-5`}>
      <h2 id="where" className="text-lg font-semibold">
        Where the {total} open {total === 1 ? 'chart is' : 'charts are'}
      </h2>
      <ul className="mt-4 flex flex-col gap-4">
        {phases.map(phase => (
          <li key={phase.name}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-medium">{phase.name}</span>
              <span className="text-sm text-muted">
                {chartsText(phase.open)}
                {phase.stalled > 0 && <span className="font-semibold text-warn">, {phase.stalled} stuck</span>}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <div className="h-full rounded-full bg-brand" style={{ width: `${(phase.open / most) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm">
        <Link href="/stages" className="font-semibold text-brand underline-offset-4 hover:underline">
          See every stage
        </Link>
      </p>
    </section>
  );
}

/** Charts that have waited too long with someone else: the longest first, with who has them. */
export function StuckList({
  items,
  stallDays,
  total,
}: {
  items: readonly QueueItem[];
  stallDays: number;
  total: number;
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="stuck" className={card}>
      <div className="px-5 pt-5">
        <h2 id="stuck" className="text-lg font-semibold">
          Stuck with someone else
        </h2>
        <p className="mt-1 text-sm text-muted">Waiting more than {stallDays} days. A gentle nudge may help.</p>
      </div>
      <ul className="mt-3 divide-y divide-line border-t border-line" aria-label="Stuck charts">
        {items.map(item => (
          <li key={item.rtNumber} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
            <Link
              href={chartHref(item.rtNumber)}
              className="font-mono font-semibold text-brand underline-offset-4 hover:underline"
            >
              {item.rtNumber}
            </Link>
            <span className="flex-1 text-sm">{item.stage.label}</span>
            <span className="text-sm text-muted">
              {item.waitingOn}, {item.daysInStage} days
            </span>
          </li>
        ))}
      </ul>
      {total > items.length && (
        <p className="border-t border-line px-5 py-3 text-sm">
          <Link href="/overview?filter=stalled" className="inline-block py-1 font-semibold text-brand hover:underline">
            Show all {total} stuck charts
          </Link>
        </p>
      )}
    </section>
  );
}
