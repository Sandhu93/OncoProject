import Link from 'next/link';

import type { QueueItem } from '@oncotrack/contracts';

import { chartHref } from './ChartTable';
import { ageText } from './queue';

function Flags({ item }: { item: QueueItem }) {
  return (
    <>
      {item.priority === 'URGENT' && (
        <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900 dark:bg-red-950 dark:text-red-200">
          Urgent
        </span>
      )}
      {item.stalled && (
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Stalled
        </span>
      )}
    </>
  );
}

/** A chart that needs the signed-in person: what to do, where it is, how long it has waited. */
export function NeedsYouList({ items }: { items: readonly QueueItem[] }) {
  return (
    <ul className="flex flex-col gap-3" aria-label="Charts that need you">
      {items.map(item => (
        <li
          key={item.rtNumber}
          className={`rounded-md border p-4 ${item.stalled ? 'border-amber-500' : 'border-zinc-300 dark:border-zinc-700'}`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={chartHref(item.rtNumber)}
              className="font-mono text-lg font-semibold underline underline-offset-4"
            >
              {item.rtNumber}
            </Link>
            <Flags item={item} />
            <span className="ml-auto text-sm text-zinc-600 dark:text-zinc-400">{ageText(item)}</span>
          </div>
          <p className="mt-2 font-medium">{item.nextStep}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {item.stage.label}
            {item.assignedToYou ? ' · Assigned to you' : item.assignedTo ? ` · Assigned to ${item.assignedTo}` : ''}
            {item.dateLine ? ` · ${item.dateLine}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Charts waiting on someone else. */
export function ElsewhereList({ items }: { items: readonly QueueItem[] }) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <caption className="sr-only">Charts waiting on other people</caption>
      <thead>
        <tr className="border-b border-zinc-300 dark:border-zinc-700">
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
          <tr key={item.rtNumber} className="border-b border-zinc-200 dark:border-zinc-800">
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
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-300 p-4 dark:border-zinc-700">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
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
    <table className="w-full border-collapse text-left text-sm">
      <caption className="sr-only">Open charts, furthest along first</caption>
      <thead>
        <tr className="border-b border-zinc-300 dark:border-zinc-700">
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
  );
}
