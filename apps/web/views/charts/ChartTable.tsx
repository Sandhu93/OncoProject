import Link from 'next/link';

import type { ChartSummary } from '@oncotrack/contracts';

import { formatDuration } from '@/utils/format';

import PriorityBadge from './PriorityBadge';

/** The RT number is the only identifier: it goes in the link, encoded, because it may contain "/". */
export const chartHref = (rtNumber: string) => `/charts/${encodeURIComponent(rtNumber)}`;

export default function ChartTable({ charts }: { charts: readonly ChartSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <caption className="sr-only">Charts, urgent first, then the longest wait in the current stage</caption>
        <thead>
          <tr className="border-b border-zinc-300 text-sm dark:border-zinc-700">
            <th scope="col" className="py-2 pr-4 font-medium">
              RT number
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Stage
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              In this stage
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Priority
            </th>
            <th scope="col" className="py-2 font-medium">
              Planned sessions
            </th>
          </tr>
        </thead>
        <tbody>
          {charts.map(chart => (
            <tr key={chart.id} className="border-b border-line">
              <th scope="row" className="py-2 pr-4 font-mono font-medium">
                <Link href={chartHref(chart.rtNumber)} className="underline underline-offset-4">
                  {chart.rtNumber}
                </Link>
              </th>
              <td className="py-2 pr-4">
                {chart.stage.label}
                {chart.status !== 'OPEN' && (
                  <span className="ml-2 text-xs text-muted">
                    ({chart.status === 'CLOSED' ? 'closed' : 'discontinued'})
                  </span>
                )}
              </td>
              <td className="py-2 pr-4">{formatDuration(chart.minutesInStage)}</td>
              <td className="py-2 pr-4">
                <PriorityBadge priority={chart.priority} />
              </td>
              <td className="py-2">{chart.plannedSessions ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
