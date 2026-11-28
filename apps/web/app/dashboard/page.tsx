import Link from 'next/link';

import type { Metadata } from 'next';

import { CAPABILITY_LABELS, ROLE_LABELS } from '@/utils/labels';

import ChartService from '@/services/api/chart.service';
import StaffService from '@/services/api/staff.service';

import { queueSummary } from '@/views/charts/queue';
import { ElsewhereList, NeedsYouList } from '@/views/charts/QueueViews';
import { HomeTiles, PhaseBars, StuckList } from '@/views/home/HomeView';
import { chartsText, greeting, phaseCounts } from '@/views/home/phases';
import AppHeader from '@/views/layout/AppHeader';
import AutoRefresh from '@/views/layout/AutoRefresh';

export const metadata: Metadata = {
  title: 'Home',
};

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

/** How many stuck charts the home page lists before pointing to the rest. */
const STUCK_SHOWN = 3;

/**
 * Behind login: `/dashboard` is in PROTECTED_ROUTES (constants/routes.ts). What this page shows comes
 * from the API, which reads roles and capabilities from its own records: nothing is chosen in the browser.
 */
export default async function DashboardPage() {
  const [staff, queue] = await Promise.all([StaffService.me(), ChartService.queue()]);
  const mine = queue.items.filter(item => item.needsYou);
  const others = queue.items.filter(item => !item.needsYou);
  const stuck = others.filter(item => item.stalled).sort((a, b) => b.daysInStage - a.daysInStage);

  return (
    <>
      <AppHeader current="dashboard" fullName={staff.fullName} capabilities={staff.capabilities} />
      <main id="main" className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-8 sm:py-7">
        <AutoRefresh />

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold leading-tight sm:text-[1.75rem]">
            {greeting(new Date())}, {staff.fullName}
          </h1>
          <p role="status" className="text-muted">
            {queueSummary(mine.length, mine.filter(item => item.stalled).length, queue.stallDays)}
          </p>
        </div>

        <HomeTiles
          totals={queue.totals}
          waitingForYou={mine.length}
          urgentForYou={mine.filter(item => item.priority === 'URGENT').length}
          stallDays={queue.stallDays}
        />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-6">
            <section aria-labelledby="needs-you" className="flex flex-col gap-3">
              <h2 id="needs-you" className="text-lg font-semibold">
                Needs you
              </h2>
              {mine.length > 0 ? (
                <NeedsYouList items={mine} />
              ) : (
                <p className="rounded-xl border border-line bg-surface p-5 text-muted">
                  That is everything for now. Everything else is in good hands.
                </p>
              )}
            </section>

            <StuckList items={stuck.slice(0, STUCK_SHOWN)} stallDays={queue.stallDays} total={stuck.length} />
          </div>

          <div className="flex flex-col gap-6">
            <PhaseBars phases={phaseCounts(queue.stages)} total={queue.totals.open} />

            {others.length > 0 && (
              <details className="rounded-xl border border-line bg-surface">
                <summary className="flex min-h-11 cursor-pointer items-center px-5 py-3 text-lg font-semibold">
                  Everyone else&apos;s charts ({others.length})
                </summary>
                <div className="px-3 pb-3">
                  <ElsewhereList items={others} />
                </div>
              </details>
            )}
          </div>
        </div>

        <section aria-labelledby="signed-in" className="flex flex-col gap-1 border-t border-line pt-5 text-sm">
          <h2 id="signed-in" className="font-semibold">
            Signed in as {staff.fullName}
          </h2>
          <p className="text-muted">
            Username <span className="font-mono">{staff.username}</span>
          </p>
          <p>
            <span className="font-medium">Roles: </span>
            {staff.roles.length > 0 ? staff.roles.map(role => ROLE_LABELS[role]).join(', ') : 'none assigned'}
          </p>
          {staff.capabilities.length > 0 && (
            <p>
              <span className="font-medium">Also allowed to: </span>
              {staff.capabilities.map(capability => CAPABILITY_LABELS[capability]).join(', ')}
            </p>
          )}
          <p className="mt-2 text-muted">
            {chartsText(queue.totals.open)} open. Find any chart in the{' '}
            <Link href="/charts" className="font-medium text-brand underline underline-offset-4">
              charts list
            </Link>
            . OncoTrack holds no patient names or other patient information: a chart is identified by its RT number
            only.
          </p>
        </section>
      </main>
    </>
  );
}
