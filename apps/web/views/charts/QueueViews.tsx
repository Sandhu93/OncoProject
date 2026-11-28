import Link from 'next/link';

import type { QueueItem } from '@oncotrack/contracts';

import { chartHref } from './ChartTable';
import { ageText } from './queue';

function Flags({ item }: { item: QueueItem }) {
  return (
    <>
      {item.priority === 'URGENT' && (
        <span className="rounded bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">Urgent</span>
      )}
      {item.stalled && (
        <span className="rounded bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">Stalled</span>
      )}
    </>
  );
}

/** A chart that needs the signed-in person: what to do, where it is, how long it has waited, and one button. */
export function NeedsYouList({ items }: { items: readonly QueueItem[] }) {
  return (
    <ul className="flex flex-col gap-3" aria-label="Charts that need you">
      {items.map(item => (
        <li
          key={item.rtNumber}
          className={`flex flex-col gap-4 rounded-xl border bg-surface p-5 sm:flex-row sm:items-center ${item.stalled ? 'border-warn' : 'border-line'}`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-bold">{item.rtNumber}</span>
              <Flags item={item} />
              <span className="text-sm text-muted">{item.stage.label}</span>
            </div>
            <p className="mt-2 font-medium">{item.nextStep}</p>
            <p className={`mt-1 text-sm ${item.stalled ? 'font-semibold text-danger' : 'text-muted'}`}>
              {ageText(item)}
              {item.assignedToYou ? ' · Assigned to you' : item.assignedTo ? ` · Assigned to ${item.assignedTo}` : ''}
              {item.dateLine ? ` · ${item.dateLine}` : ''}
            </p>
          </div>
          <Link
            href={chartHref(item.rtNumber)}
            aria-label={`Open ${item.rtNumber}`}
            className="inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-[10px] bg-brand px-5 text-[15px] font-semibold text-brand-ink hover:opacity-90 sm:w-auto"
          >
            Open chart
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Charts waiting on someone else. */
export function ElsewhereList({ items }: { items: readonly QueueItem[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface px-4">
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
        <caption className="sr-only">Charts waiting on other people</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="py-2 pr-4 font-medium">
              RT number
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Stage
            </th>
            <th scope="col" className="py-2 font-medium">
              Waiting on
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.rtNumber} className="border-b border-line">
              <th scope="row" className="py-2 pr-4 font-mono font-medium">
                <Link href={chartHref(item.rtNumber)} className="underline underline-offset-4">
                  {item.rtNumber}
                </Link>{' '}
                <Flags item={item} />
              </th>
              <td className="py-2 pr-4">{item.stage.label}</td>
              <td className="py-2">{item.waitingOn}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

export function KpiTiles({
  totals,
  stallDays,
}: {
  totals: { gettingReady: number; stalled: number; inTreatment: number; saturdayUpdatesToCome: number };
  stallDays: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Getting ready" value={totals.gettingReady} />
      <Tile label={`Stalled over ${stallDays} days`} value={totals.stalled} />
      <Tile label="In treatment" value={totals.inTreatment} />
      <Tile label="Saturday updates to come" value={totals.saturdayUpdatesToCome} />
    </div>
  );
}

/** Every open chart with a bar showing how far along it is. */
export function OverviewTable({ items }: { items: readonly QueueItem[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface px-4">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="sr-only">Open charts, furthest along first</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="py-2 pr-4 font-medium">
              RT number
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Stage
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Waiting on
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Here
            </th>
            <th scope="col" className="py-2 font-medium">
              Dates
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.rtNumber} className="border-b border-zinc-200 align-top dark:border-zinc-800">
              <th scope="row" className="py-2 pr-4 font-mono font-medium">
                <Link href={chartHref(item.rtNumber)} className="underline underline-offset-4">
                  {item.rtNumber}
                </Link>
                <div className="mt-1 flex gap-1 font-sans">
                  <Flags item={item} />
                </div>
              </th>
              <td className="py-2 pr-4">
                {item.stage.label}
                <progress
                  className="mt-1 block h-1.5 w-32"
                  max={item.stageCount}
                  value={item.stageNumber}
                  aria-label={`Stage ${item.stageNumber} of ${item.stageCount}`}
                />
              </td>
              <td className="py-2 pr-4">{item.waitingOn}</td>
              <td className="py-2 pr-4">{ageText(item)}</td>
              <td className="py-2">{item.dateLine ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
