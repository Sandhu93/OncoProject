import Link from 'next/link';

import type { ChartDetail } from '@oncotrack/contracts';

import { formatDateTime, formatDuration } from '@/utils/format';

import PriorityBadge from './PriorityBadge';

const ACTION_LABELS: Record<string, string> = {
  ISSUE_CHART: 'Chart issued',
};

const actionLabel = (action: string) => ACTION_LABELS[action] ?? action.replaceAll('_', ' ').toLowerCase();

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

const orDash = (value: string | number | null) => (value === null || value === '' ? '—' : value);

export default function ChartDetailView({ chart }: { chart: ChartDetail }) {
  return (
    <article className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/charts" className="text-sm underline underline-offset-4">
          ← All charts
        </Link>
        <h1 className="font-mono text-2xl font-semibold">{chart.rtNumber}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          {chart.stage.label} for {formatDuration(chart.minutesInStage)}
          {chart.status !== 'OPEN' && ` · ${chart.status === 'CLOSED' ? 'closed' : 'discontinued'}`}
        </p>
      </div>

      <section aria-labelledby="details" className="flex flex-col gap-3">
        <h2 id="details" className="text-lg font-medium">
          Details
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact label="Current stage">{chart.stage.label}</Fact>
          <Fact label="In this stage since">{formatDateTime(chart.stageSince)}</Fact>
          <Fact label="Priority">
            <PriorityBadge priority={chart.priority} />
          </Fact>
          <Fact label="Planned sessions">{orDash(chart.plannedSessions)}</Fact>
          <Fact label="Plan ID">{orDash(chart.planId)}</Fact>
          <Fact label="Contour set name">{orDash(chart.contourSetName)}</Fact>
          <Fact label="Scan reference">{orDash(chart.scanReference)}</Fact>
          <Fact label="Issued by">{chart.issuedBy}</Fact>
        </dl>
      </section>

      <section aria-labelledby="history" className="flex flex-col gap-3">
        <h2 id="history" className="text-lg font-medium">
          History
        </h2>
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Everything that has happened to this chart, oldest first</caption>
          <thead>
            <tr className="border-b border-zinc-300 text-sm dark:border-zinc-700">
              <th scope="col" className="py-2 pr-4 font-medium">
                When
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                What
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Stage
              </th>
              <th scope="col" className="py-2 font-medium">
                By
              </th>
            </tr>
          </thead>
          <tbody>
            {chart.history.map(entry => (
              <tr key={`${entry.occurredAt}-${entry.action}`} className="border-b border-zinc-200 dark:border-zinc-800">
                <td className="py-2 pr-4">{formatDateTime(entry.occurredAt)}</td>
                <td className="py-2 pr-4">
                  {actionLabel(entry.action)}
                  {entry.reason && (
                    <span className="block text-sm text-zinc-600 dark:text-zinc-400">{entry.reason}</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {entry.fromStageLabel ? `${entry.fromStageLabel} → ${entry.toStageLabel}` : entry.toStageLabel}
                </td>
                <td className="py-2">{entry.actorName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </article>
  );
}
