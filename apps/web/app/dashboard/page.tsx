import Link from 'next/link';

import type { Metadata } from 'next';

import { CAPABILITY_LABELS, ROLE_LABELS } from '@/utils/labels';

import ChartService from '@/services/api/chart.service';
import StaffService from '@/services/api/staff.service';

import { queueSummary } from '@/views/charts/queue';
import { ElsewhereList, NeedsYouList } from '@/views/charts/QueueViews';
import AppHeader from '@/views/layout/AppHeader';
import AutoRefresh from '@/views/layout/AutoRefresh';

export const metadata: Metadata = {
  title: 'Dashboard',
};

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

/**
 * Behind login: `/dashboard` is in PROTECTED_ROUTES (constants/routes.ts). What this page shows comes
 * from the API, which reads roles and capabilities from its own records: nothing is chosen in the browser.
 */
export default async function DashboardPage() {
  const [staff, queue] = await Promise.all([StaffService.me(), ChartService.queue()]);
  const mine = queue.items.filter(item => item.needsYou);
  const others = queue.items.filter(item => !item.needsYou);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <AppHeader current="dashboard" fullName={staff.fullName} capabilities={staff.capabilities} />
      <AutoRefresh />

      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <section aria-labelledby="needs-you" className="flex flex-col gap-3">
        <h2 id="needs-you" className="text-lg font-medium">
          Needs you
        </h2>
        <p role="status">{queueSummary(mine.length, mine.filter(item => item.stalled).length, queue.stallDays)}</p>
        {mine.length > 0 && <NeedsYouList items={mine} />}
      </section>

      {others.length > 0 && (
        <section aria-labelledby="everyone-else" className="flex flex-col gap-3">
          <h2 id="everyone-else" className="text-lg font-medium">
            Everyone else&apos;s
          </h2>
          <ElsewhereList items={others} />
        </section>
      )}

      <section aria-labelledby="signed-in" className="flex flex-col gap-2">
        <h2 id="signed-in" className="text-lg font-medium">
          Signed in as {staff.fullName}
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400">
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
      </section>

      <p className="text-zinc-600 dark:text-zinc-400">
        Open the{' '}
        <Link href="/charts" className="underline underline-offset-4">
          charts
        </Link>{' '}
        to see every chart, find one by RT number and see how long it has waited. OncoTrack holds no patient names or
        other patient information: a chart is identified by its RT number only.
      </p>
    </main>
  );
}
