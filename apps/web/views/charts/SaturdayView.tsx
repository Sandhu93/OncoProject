import Link from 'next/link';

import type { ChartQueue, ClinicalRole } from '@oncotrack/contracts';

import { formatDay } from '@/utils/format';
import { ROLE_LABELS } from '@/utils/labels';

import { chartHref } from './ChartTable';

/** The roles that post a Saturday update, as the treatment stage asks for them. */
const WEEKLY_ROLES: readonly ClinicalRole[] = ['JUNIOR_RESIDENT', 'RADIOGRAPHER'];

/** Who has posted this week's Saturday update on each chart in treatment, and the final updates still owed. */
export default function SaturdayView({ queue }: { queue: ChartQueue }) {
  const treating = queue.items.filter(item => item.stage.code === 'TREATMENT_IN_PROGRESS');
  const finishing = queue.items.filter(item => item.stage.code === 'TREATMENT_COMPLETED');
  const owed = treating.reduce((sum, item) => sum + item.weeklyMissing.length, 0);

  return (
    <div className="flex flex-col gap-8">
      <p>
        Week ending <strong>{formatDay(queue.weekEnding)}</strong>:{' '}
        {owed === 0
          ? 'every Saturday update is in.'
          : `${owed} ${owed === 1 ? 'update is' : 'updates are'} still to come.`}
      </p>

      <section aria-labelledby="in-treatment" className="flex flex-col gap-3">
        <h2 id="in-treatment" className="text-lg font-medium">
          In treatment
        </h2>
        {treating.length === 0 ? (
          <p className="text-sm text-muted">No chart is in treatment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left">
              <caption className="sr-only">Saturday updates for each chart in treatment</caption>
              <thead>
                <tr className="border-b border-zinc-300 text-sm dark:border-zinc-700">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Chart
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Sessions
                  </th>
                  {WEEKLY_ROLES.map(role => (
                    <th key={role} scope="col" className="py-2 pr-4 font-medium">
                      {ROLE_LABELS[role]}
                    </th>
                  ))}
                  <th scope="col" className="py-2 font-medium">
                    <span className="sr-only">Yours</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {treating.map(item => (
                  <tr key={item.rtNumber} className="border-b border-line">
                    <th scope="row" className="py-2 pr-4 font-normal">
                      <Link href={chartHref(item.rtNumber)} className="underline underline-offset-4">
                        {item.rtNumber}
                      </Link>
                    </th>
                    <td className="py-2 pr-4">
                      {item.sessionsDone ?? 0}
                      {item.plannedSessions !== null && ` of ${item.plannedSessions}`}
                    </td>
                    {WEEKLY_ROLES.map(role => (
                      <td key={role} className="py-2 pr-4">
                        {item.weeklyMissing.includes(role) ? 'Not yet' : 'Posted'}
                      </td>
                    ))}
                    <td className="py-2">{item.needsYou && <strong>Yours to post</strong>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="finishing" className="flex flex-col gap-3">
        <h2 id="finishing" className="text-lg font-medium">
          Treatment finished, final updates owed
        </h2>
        {finishing.length === 0 ? (
          <p className="text-sm text-muted">None.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {finishing.map(item => (
              <li key={item.rtNumber}>
                <Link href={chartHref(item.rtNumber)} className="underline underline-offset-4">
                  {item.rtNumber}
                </Link>{' '}
                waiting on {item.waitingOn}
                {item.needsYou && <strong> · yours to post</strong>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
